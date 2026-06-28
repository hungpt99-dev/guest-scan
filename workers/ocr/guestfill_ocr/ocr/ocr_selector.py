"""Score and select the best OCR candidate.

Uses PaddleOCR as the primary engine, Tesseract as fallback.
"""

from guestfill_ocr.ocr.ocr_candidate import OcrCandidate
from guestfill_ocr.ocr.paddleocr_engine import check_paddleocr_available, run_paddleocr_mrz
from guestfill_ocr.ocr.tesseract_engine import run_mrz_ocr
from guestfill_ocr.passport.mrz_cleaner import clean_mrz_text
from guestfill_ocr.passport.mrz_validator import validate_check_digit


def score_candidate(candidate: OcrCandidate, line1: str | None, line2: str | None) -> float:
    score = 0.0
    lines = candidate.cleaned_lines

    if line1 and line1.startswith("P<"):
        score += 20.0

    if len(lines) >= 2:
        score += 80.0

    if lines:
        if len(lines[0]) == 44:
            score += 40.0
        if len(lines) >= 2 and len(lines[1]) == 44:
            score += 40.0

    if line1 and line1.count("<") >= 5:
        score += 10.0

    if line2:
        if len(line2) >= 10:
            passport_num = line2[0:9]
            passport_cd = line2[9:10]
            if validate_check_digit(passport_num, passport_cd):
                score += 100.0

        if len(line2) >= 20:
            dob = line2[13:19]
            dob_cd = line2[19:20]
            if validate_check_digit(dob, dob_cd):
                score += 100.0

        if len(line2) >= 28:
            expiry = line2[21:27]
            expiry_cd = line2[27:28]
            if validate_check_digit(expiry, expiry_cd):
                score += 100.0

        if len(line2) >= 44:
            composite_input = line2[0:10] + line2[13:20] + line2[21:43]
            composite_cd = line2[43:44]
            if validate_check_digit(composite_input, composite_cd):
                score += 200.0

    import re

    if line2 and re.search(r"\d{6}", line2[13:20]):
        score += 20.0

    if len(lines) >= 2 and len(lines[0]) == 44 and len(lines[1]) == 44:
        score += 40.0

    invalid_chars = sum(1 for line in lines for ch in line if ch not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<")
    if invalid_chars > 10:
        score -= 50.0

    if not line2:
        score -= 100.0

    return score


def _run_single_candidate_ocr(
    candidate: OcrCandidate,
    timeout: int,
    use_paddleocr: bool,
    upscale_factor: float = 1.0,
) -> bool:
    if use_paddleocr:
        result = run_paddleocr_mrz(candidate.image, timeout=timeout, upscale_factor=upscale_factor)
        if result.is_ok():
            raw_text = result.unwrap()
            if raw_text.strip():
                candidate.raw_text = raw_text
                candidate.cleaned_lines = clean_mrz_text(raw_text)
                return True

    result = run_mrz_ocr(candidate.image, psm=candidate.psm, timeout=timeout)
    if result.is_ok():
        candidate.raw_text = result.unwrap()
        candidate.cleaned_lines = clean_mrz_text(candidate.raw_text)
        return True
    return False


def _select_from_candidates(candidates: list[OcrCandidate]) -> tuple[OcrCandidate | None, list[str]]:
    warnings: list[str] = []
    best_candidate: OcrCandidate | None = None
    best_score = float("-inf")

    for candidate in candidates:
        if not candidate.cleaned_lines:
            continue
        line1 = candidate.cleaned_lines[0] if len(candidate.cleaned_lines) >= 1 else None
        line2 = candidate.cleaned_lines[1] if len(candidate.cleaned_lines) >= 2 else None
        candidate.score = score_candidate(candidate, line1, line2)

        if candidate.score > best_score:
            best_score = candidate.score
            best_candidate = candidate

    if best_candidate is None:
        warnings.append("MRZ_NOT_FOUND")

    return best_candidate, warnings


def select_best_candidate_with_engine(
    candidates: list[OcrCandidate],
    timeout: int = 8,
    prefer_paddleocr: bool = True,
    paddle_upscale: float = 1.5,
) -> tuple[OcrCandidate | None, list[str], str]:
    warnings: list[str] = []
    engine_used = "tesseract"

    paddle_available = prefer_paddleocr and check_paddleocr_available()

    if paddle_available:
        for candidate in candidates:
            success = _run_single_candidate_ocr(candidate, timeout, use_paddleocr=True, upscale_factor=paddle_upscale)
            if success:
                break

        has_paddle_result = any(c.raw_text for c in candidates)
        if has_paddle_result:
            warnings.append("PADDLE_OCR_USED")
            best_candidate, sel_warnings = _select_from_candidates(candidates)
            warnings.extend(sel_warnings)
            if best_candidate and len(best_candidate.cleaned_lines) >= 2:
                engine_used = "paddleocr"
                return best_candidate, warnings, engine_used
        else:
            warnings.append("PADDLE_OCR_FAILED")
    else:
        if prefer_paddleocr:
            warnings.append("PADDLE_OCR_UNAVAILABLE")

    for candidate in candidates:
        if not candidate.raw_text:
            success = _run_single_candidate_ocr(candidate, timeout, use_paddleocr=False)
            if not success:
                continue

    best_candidate, sel_warnings = _select_from_candidates(candidates)
    warnings.extend(sel_warnings)

    return best_candidate, warnings, engine_used


async def select_best_candidate(
    candidates: list[OcrCandidate], timeout: int = 8
) -> tuple[OcrCandidate | None, list[str]]:
    best, warnings, _engine = select_best_candidate_with_engine(candidates, timeout=timeout, prefer_paddleocr=True)
    return best, warnings


def select_best_candidate_sync(
    candidates: list[OcrCandidate], timeout: int = 8
) -> tuple[OcrCandidate | None, list[str]]:
    best, warnings, _engine = select_best_candidate_with_engine(candidates, timeout=timeout, prefer_paddleocr=True)
    return best, warnings


def get_select_best_candidate_engine(candidates: list[OcrCandidate], timeout: int = 8) -> str:
    """Return the engine name that would be used for the given candidates."""
    _, _, engine = select_best_candidate_with_engine(candidates, timeout=timeout, prefer_paddleocr=True)
    return engine
