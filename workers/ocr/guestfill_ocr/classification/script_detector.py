"""Lightweight script detection for visual zone images.

Detects the dominant script type from an image region using
pixel-density analysis and connected-component statistics.

Used to select the appropriate OCR language when the document
country code is not available from MRZ.
"""

import numpy as np

from guestfill_ocr.common.result import Err, Ok, Result

SCRIPT_LATIN = "latin"
SCRIPT_ARABIC = "arabic"
SCRIPT_CYRILLIC = "cyrillic"
SCRIPT_CJK = "cjk"
SCRIPT_DEVANAGARI = "devanagari"
SCRIPT_THAI = "thai"
SCRIPT_HEBREW = "hebrew"
SCRIPT_GREEK = "greek"
SCRIPT_UNKNOWN = "unknown"

ALL_SCRIPTS = [
    SCRIPT_LATIN,
    SCRIPT_ARABIC,
    SCRIPT_CYRILLIC,
    SCRIPT_CJK,
    SCRIPT_DEVANAGARI,
    SCRIPT_THAI,
    SCRIPT_HEBREW,
    SCRIPT_GREEK,
]


def detect_script(image: np.ndarray) -> Result:
    if image is None or image.size == 0:
        return Err({"code": "INVALID_IMAGE", "message": "Cannot detect script on empty image"})

    gray = _ensure_grayscale(image)
    h, w = gray.shape[:2]

    stats = _compute_image_stats(gray)

    features = _extract_features(gray, stats)

    scores = _score_scripts(features)
    best_script = max(scores, key=lambda s: s["confidence"])
    return Ok(best_script)


def _ensure_grayscale(image: np.ndarray) -> np.ndarray:
    if len(image.shape) == 3:
        import cv2

        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image


def _compute_image_stats(gray: np.ndarray) -> dict:
    h, w = gray.shape[:2]
    total = h * w

    import cv2

    binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    _, labels, stats_cc, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    component_areas = stats_cc[1:, cv2.CC_STAT_AREA]
    fg_pixels = int(np.sum(binary == 255))
    fg_ratio = fg_pixels / total if total > 0 else 0

    avg_area = float(np.mean(component_areas)) if len(component_areas) > 0 else 0
    std_area = float(np.std(component_areas)) if len(component_areas) > 0 else 0

    horizontal_gradient = cv2.Sobel(gray, cv2.CV_64F, 1, 0)
    vertical_gradient = cv2.Sobel(gray, cv2.CV_64F, 0, 1)
    hg_mag = np.abs(horizontal_gradient).mean()
    vg_mag = np.abs(vertical_gradient).mean()

    return {
        "fg_ratio": fg_ratio,
        "component_count": len(component_areas),
        "avg_component_area": avg_area,
        "std_component_area": std_area,
        "h_gradient": hg_mag,
        "v_gradient": vg_mag,
    }


def _extract_features(gray: np.ndarray, stats: dict) -> dict:
    h, w = gray.shape[:2]

    h_proj = np.mean(gray, axis=1)
    h_proj_var = float(np.var(h_proj))

    import cv2

    edges = cv2.Canny(gray, 50, 150)
    edge_density = float(np.sum(edges > 0)) / (h * w) if h * w > 0 else 0

    roi_center = gray[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4]
    local_contrast = float(np.std(roi_center)) if roi_center.size > 0 else 0

    cc_ratio = stats["avg_component_area"] / max(stats["std_component_area"], 1e-6)

    return {
        "h_proj_variance": h_proj_var,
        "edge_density": edge_density,
        "local_contrast": local_contrast,
        "fg_ratio": stats["fg_ratio"],
        "component_count": stats["component_count"],
        "avg_component_area": stats["avg_component_area"],
        "std_component_area": stats["std_component_area"],
        "cc_ratio": cc_ratio,
        "h_gradient_ratio": (stats["h_gradient"] / max(stats["v_gradient"], 1e-6)),
    }


def _score_scripts(features: dict) -> list[dict]:
    scores: list[dict] = []
    for script in ALL_SCRIPTS:
        confidence = _score_single_script(script, features)
        scores.append({"script": script, "confidence": confidence})
    total = sum(s["confidence"] for s in scores)
    if total > 0:
        for s in scores:
            s["confidence"] /= total
    scores.sort(key=lambda s: s["confidence"], reverse=True)
    return scores


def _score_single_script(script: str, features: dict) -> float:
    if script == SCRIPT_LATIN:
        score = 0.5
        if features["cc_ratio"] > 2.0:
            score += 0.2
        if 0.1 < features["fg_ratio"] < 0.4:
            score += 0.15
        if features["component_count"] > 50:
            score += 0.15
        return score

    if script == SCRIPT_ARABIC:
        score = 0.3
        if features["h_gradient_ratio"] < 0.8:
            score += 0.3
        if features["component_count"] > 100:
            score += 0.2
        if features["local_contrast"] > 40:
            score += 0.2
        return score

    if script == SCRIPT_CYRILLIC:
        score = 0.3
        if 1.5 < features["cc_ratio"] < 3.0:
            score += 0.2
        if features["component_count"] > 60:
            score += 0.15
        if features["local_contrast"] > 35:
            score += 0.15
        if features["fg_ratio"] > 0.15:
            score += 0.1
        return score

    if script == SCRIPT_CJK:
        score = 0.2
        if features["component_count"] > 150:
            score += 0.3
        if features["avg_component_area"] < 50:
            score += 0.2
        if features["std_component_area"] < 30:
            score += 0.15
        if features["edge_density"] > 0.15:
            score += 0.15
        return score

    if script == SCRIPT_DEVANAGARI:
        score = 0.2
        if features["component_count"] > 120:
            score += 0.2
        if features["h_proj_variance"] > 200:
            score += 0.2
        if features["avg_component_area"] < 80:
            score += 0.1
        return score

    if script == SCRIPT_THAI:
        score = 0.2
        if features["component_count"] > 80:
            score += 0.2
        if features["h_proj_variance"] > 150:
            score += 0.15
        if features["avg_component_area"] < 60:
            score += 0.1
        return score

    if script == SCRIPT_HEBREW:
        score = 0.2
        if features["h_gradient_ratio"] < 0.9:
            score += 0.2
        if features["component_count"] > 60:
            score += 0.15
        return score

    if script == SCRIPT_GREEK:
        score = 0.3
        if 1.5 < features["cc_ratio"] < 3.0:
            score += 0.2
        if features["component_count"] > 50:
            score += 0.15
        return score

    return 0.0


def detect_script_from_country(country_code: str | None) -> str:
    from guestfill_ocr.config.language_resolver import resolve_script

    return resolve_script(country_code)
