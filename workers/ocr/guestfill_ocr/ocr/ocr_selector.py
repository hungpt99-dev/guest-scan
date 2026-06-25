"""Score and select the best OCR candidate."""

from guestfill_ocr.ocr.ocr_candidate import OcrCandidate
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

    if len(lines) >= 2:
        if len(lines[0]) == 44 and len(lines[1]) == 44:
            score += 40.0

    invalid_chars = sum(1 for l in lines for ch in l if ch not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<")
    if invalid_chars > 10:
        score -= 50.0

    if not line2:
        score -= 100.0

    return score


async def select_best_candidate(
    candidates: list[OcrCandidate], timeout: int = 8
) -> tuple[OcrCandidate | None, list[str]]:

    warnings: list[str] = []
    best_candidate: OcrCandidate | None = None
    best_score = float("-inf")

    for candidate in candidates:
        result = run_mrz_ocr(candidate.image, psm=candidate.psm, timeout=timeout)
        if result.is_err():
            continue
        candidate.raw_text = result.unwrap()
        candidate.cleaned_lines = clean_mrz_text(candidate.raw_text)

        line1 = candidate.cleaned_lines[0] if len(candidate.cleaned_lines) >= 1 else None
        line2 = candidate.cleaned_lines[1] if len(candidate.cleaned_lines) >= 2 else None
        candidate.score = score_candidate(candidate, line1, line2)

        if candidate.score > best_score:
            best_score = candidate.score
            best_candidate = candidate

    if best_candidate is None:
        warnings.append("MRZ_NOT_FOUND")

    return best_candidate, warnings


def select_best_candidate_sync(
    candidates: list[OcrCandidate], timeout: int = 8
) -> tuple[OcrCandidate | None, list[str]]:
    warnings: list[str] = []
    best_candidate: OcrCandidate | None = None
    best_score = float("-inf")

    for candidate in candidates:
        result = run_mrz_ocr(candidate.image, psm=candidate.psm, timeout=timeout)
        if result.is_err():
            continue
        candidate.raw_text = result.unwrap()
        candidate.cleaned_lines = clean_mrz_text(candidate.raw_text)

        line1 = candidate.cleaned_lines[0] if len(candidate.cleaned_lines) >= 1 else None
        line2 = candidate.cleaned_lines[1] if len(candidate.cleaned_lines) >= 2 else None
        candidate.score = score_candidate(candidate, line1, line2)

        if candidate.score > best_score:
            best_score = candidate.score
            best_candidate = candidate

    if best_candidate is None:
        warnings.append("MRZ_NOT_FOUND")

    return best_candidate, warnings
