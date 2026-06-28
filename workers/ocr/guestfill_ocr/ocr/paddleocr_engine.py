"""PaddleOCR engine wrapper for passport MRZ extraction.

PaddleOCR is used as the primary OCR engine for MRZ extraction.
Tesseract is used as fallback when PaddleOCR is unavailable or fails.
"""

from typing import Any

import cv2
import numpy as np

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Ok, Result

_PPOCR_AVAILABLE = False
_PPOCR_CHECKED = False
_PPOCR_INSTANCE: Any = None

MRZ_TD3_LENGTH = 44
MRZ_TD2_LENGTH = 36
MRZ_TD1_LENGTH = 30

MRZ_VALID_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<")
MRZ_FORMAT_LENGTHS = [MRZ_TD3_LENGTH, MRZ_TD2_LENGTH, MRZ_TD1_LENGTH]

# Minimum lines required for each format
MRZ_FORMAT_LINES: dict[int, int] = {
    MRZ_TD3_LENGTH: 2,
    MRZ_TD2_LENGTH: 2,
    MRZ_TD1_LENGTH: 3,
}

# Reverse MRZ for upside-down detection
MRZ_LINE1_START_PREFIXES = ("P<", "P", "I<", "ID", "V<")


def check_paddleocr_available() -> bool:
    global _PPOCR_AVAILABLE, _PPOCR_CHECKED
    if _PPOCR_CHECKED:
        return _PPOCR_AVAILABLE
    try:
        import paddleocr  # type: ignore[import-untyped] # noqa: F401

        _PPOCR_AVAILABLE = True
    except ImportError:
        _PPOCR_AVAILABLE = False
    _PPOCR_CHECKED = True
    return _PPOCR_AVAILABLE


def _get_paddleocr_instance(lang: str = "en") -> Any:
    global _PPOCR_INSTANCE
    if _PPOCR_INSTANCE is None:
        from paddleocr import PaddleOCR

        _PPOCR_INSTANCE = PaddleOCR(
            lang=lang,
            use_angle_cls=False,
            show_log=False,
            use_gpu=False,
            det_db_thresh=0.3,
            det_db_box_thresh=0.5,
            rec_batch_num=6,
        )
    return _PPOCR_INSTANCE


def reset_paddleocr_instance() -> None:
    global _PPOCR_INSTANCE
    _PPOCR_INSTANCE = None


def run_paddleocr_mrz(
    image: np.ndarray | str,
    timeout: int = 30,
    confidence_threshold: float = 0.5,
    lang: str = "en",
    upscale_factor: float = 1.0,
) -> Result:
    if not check_paddleocr_available():
        return Err(
            OcrError(
                "PADDLEOCR_NOT_FOUND",
                "PaddleOCR is not installed. Install with: pip install paddleocr. Falling back to Tesseract.",
            )
        )

    try:
        if isinstance(image, str):
            img = cv2.imread(image)
            if img is None:
                return Err(OcrError("IMAGE_UNREADABLE", f"Cannot read image: {image}"))
        elif isinstance(image, np.ndarray):
            img = image
            if len(img.shape) == 2:
                img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
            elif len(img.shape) == 3 and img.shape[2] == 4:
                img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
        else:
            return Err(OcrError("OCR_FAILED", "Invalid image type"))

        if upscale_factor > 1.0 and img is not None:
            h, w = img.shape[:2]
            img = cv2.resize(
                img,
                None,
                fx=upscale_factor,
                fy=upscale_factor,
                interpolation=cv2.INTER_CUBIC,
            )

        ocr = _get_paddleocr_instance(lang=lang)
        result = ocr.ocr(img, cls=False)

        if result is None or len(result) == 0 or result[0] is None:
            return Ok("")

        lines = _extract_mrz_text(result, confidence_threshold)
        return Ok("\n".join(lines))
    except Exception as e:
        return Err(OcrError("OCR_FAILED", f"PaddleOCR failed: {e}"))


def _compute_adaptive_y_tolerance(items: list) -> float:
    if not items:
        return 0.02
    box_heights = [h for _, h, _, _ in items]
    if not box_heights:
        return 0.02
    median_height = sorted(box_heights)[len(box_heights) // 2]
    return max(median_height * 0.6, 3.0)


def _group_by_y_coordinate(
    ocr_result: list,
) -> list[list[Any]]:
    """Group OCR text detections by their y-coordinate (row).

    Uses the vertical center of each bounding box to determine line membership.
    Tolerance is computed adaptively based on detected text sizes.
    """
    items: list[Any] = []

    for region in ocr_result:
        if region is None:
            continue
        for item in region:
            if len(item) >= 2:
                bbox, text_data = item[0], item[1]
                if len(bbox) >= 4:
                    y_vals = [pt[1] for pt in bbox]
                    y_center = sum(y_vals) / len(y_vals)
                    y_min = min(y_vals)
                    y_max = max(y_vals)
                    box_height = y_max - y_min
                    items.append((y_center, box_height, bbox, text_data))

    if not items:
        return []

    y_threshold = _compute_adaptive_y_tolerance(items)

    items.sort(key=lambda x: x[0])

    groups: list[list[Any]] = []
    current_group: list[Any] = [items[0]]

    for i in range(1, len(items)):
        y_center, box_height, bbox, text_data = items[i]
        prev_y = current_group[-1][0]

        if abs(y_center - prev_y) <= y_threshold:
            current_group.append((y_center, box_height, bbox, text_data))
        else:
            groups.append([(bbox, td) for _, _, bbox, td in current_group])
            current_group = [(y_center, box_height, bbox, text_data)]

    if current_group:
        groups.append([(bbox, td) for _, _, bbox, td in current_group])

    return groups


def _sort_group_by_x(
    group: list[Any],
) -> list[Any]:
    """Sort items within a y-group by their x-coordinate (left-to-right)."""
    with_x: list[Any] = []
    for bbox, text_data in group:
        x_vals = [pt[0] for pt in bbox]
        x_min = min(x_vals)
        text, conf = text_data
        with_x.append((x_min, text.strip().upper(), conf))
    with_x.sort(key=lambda x: x[0])
    return [(text, conf) for _, text, conf in with_x]


def _reconstruct_line(
    sorted_items: list[Any],
    confidence_threshold: float = 0.5,
) -> str | None:
    """Concatenate text items from the same line with spacing logic."""
    parts: list[str] = []
    for text, conf in sorted_items:
        if conf is not None and conf >= confidence_threshold:
            cleaned = text.strip()
            cleaned = cleaned.replace(" ", "").replace("\t", "")
            if cleaned:
                parts.append(cleaned)

    if not parts:
        return None

    combined = "".join(parts)
    cleaned = "".join(ch for ch in combined if ch in MRZ_VALID_CHARS or ch.islower())
    cleaned = cleaned.upper()
    return cleaned if len(cleaned) >= 15 else None


def _detect_mrz_format(candidates: list[str]) -> int | None:
    """Detect the MRZ format based on line lengths.

    Returns the detected format length (44 for TD3, 36 for TD2, 30 for TD1)
    or None if no format is detected.
    """
    for length in MRZ_FORMAT_LENGTHS:
        min_lines = MRZ_FORMAT_LINES[length]
        matching = [ln for ln in candidates if len(ln) == length]
        if len(matching) >= min_lines:
            return length
    return None


def _try_detect_upside_down(lines: list[str]) -> bool:
    if not lines:
        return False
    start_prefixes = ("P<", "I<", "V<", "ID")
    upside_down_hints = 0
    normal_hints = 0
    for line in lines:
        if len(line) >= 2:
            prefix = line[:2]
            if prefix in start_prefixes:
                normal_hints += 1
            if prefix[-1] == ">" and prefix[0] in ("P", "I", "V", "A", "B", "C"):
                upside_down_hints += 1
        if len(line) >= 5:
            last_chars = line[-5:]
            letter_count = sum(1 for c in last_chars if c.isalpha())
            if letter_count >= 3:
                upside_down_hints += 1
    return upside_down_hints > normal_hints


def _extract_mrz_text(
    ocr_result: list,
    confidence_threshold: float = 0.5,
) -> list[str]:
    """Extract MRZ text from PaddleOCR output using spatial layout.

    Groups detections by y-coordinate to reconstruct MRZ lines,
    then selects the best matching lines based on format and scoring.
    Handles TD3 (2x44), TD2 (2x36), and TD1 (3x30) formats.
    """
    groups = _group_by_y_coordinate(ocr_result)
    if not groups:
        return []

    reconstructed_lines: list[str] = []
    for group in groups:
        sorted_items = _sort_group_by_x(group)
        line = _reconstruct_line(sorted_items, confidence_threshold)
        if line:
            reconstructed_lines.append(line)

    if not reconstructed_lines:
        return []

    detected_format = _detect_mrz_format(reconstructed_lines)
    if detected_format is not None:
        matching = [ln for ln in reconstructed_lines if len(ln) == detected_format]
        if _try_detect_upside_down(matching):
            matching = [ln[::-1] for ln in matching]
        return matching[:3]

    scored: list[tuple[float, str]] = []
    for line in reconstructed_lines:
        score = _score_mrz_likelihood(line)
        if score > 0:
            scored.append((score, line))

    scored.sort(key=lambda x: x[0], reverse=True)

    selected: list[str] = []
    seen_texts: set[str] = set()
    for _score_val, text in scored:
        if len(selected) >= 3:
            break
        if text in seen_texts:
            continue
        seen_texts.add(text)
        selected.append(text)

    return selected


def _score_mrz_likelihood(text: str) -> float:
    score = 0.0
    if len(text) < 15:
        return 0.0

    valid_chars = sum(1 for ch in text if ch in MRZ_VALID_CHARS)
    if valid_chars / len(text) < 0.85:
        return 0.0

    if text.startswith("P<"):
        score += 30.0
    elif text.startswith("P") and len(text) >= 40:
        score += 15.0
    elif text.startswith("I<") or text.startswith("ID"):
        score += 20.0
    elif text.startswith("V<"):
        score += 15.0

    if len(text) in MRZ_FORMAT_LENGTHS:
        score += 25.0
    elif len(text) >= 40:
        score += 20.0
    elif len(text) >= 30:
        score += 10.0

    if text.count("<") >= 5:
        score += 10.0

    digit_count = sum(1 for ch in text if ch.isdigit())
    if digit_count >= 8:
        score += 15.0
    elif digit_count >= 4:
        score += 5.0

    filler_positions = [i for i, ch in enumerate(text) if ch == "<"]
    consecutive = 1
    max_consecutive = 1
    for i in range(1, len(filler_positions)):
        if filler_positions[i] == filler_positions[i - 1] + 1:
            consecutive += 1
            max_consecutive = max(max_consecutive, consecutive)
        else:
            consecutive = 1

    if max_consecutive >= 10:
        score += 10.0
    elif max_consecutive >= 5:
        score += 5.0

    return score
