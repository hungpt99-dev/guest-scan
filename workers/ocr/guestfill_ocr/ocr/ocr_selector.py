"""Score and select the best OCR candidate.

Uses PaddleOCR as the primary engine, Tesseract as fallback.
Integrates PaddleOCR confidence into candidate scoring for
higher accuracy on global passport documents.
"""

from guestfill_ocr.ocr.ocr_candidate import OcrCandidate
from guestfill_ocr.ocr.paddleocr_engine import (
    check_paddleocr_available,
    compute_average_confidence,
    run_paddleocr_mrz_with_details,
)
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

    if candidate.ocr_confidence is not None and candidate.ocr_confidence > 0:
        confidence_bonus = candidate.ocr_confidence * 50.0
        score += confidence_bonus

    return score


def _run_single_candidate_ocr(
    candidate: OcrCandidate,
    timeout: int,
    use_paddleocr: bool,
    upscale_factor: float = 1.0,
) -> bool:
    if use_paddleocr:
        result = run_paddleocr_mrz_with_details(candidate.image, timeout=timeout, upscale_factor=upscale_factor)
        if result.is_ok():
            raw_text, details = result.unwrap()
            joined = "\n".join(raw_text) if isinstance(raw_text, list) else str(raw_text)
            if joined.strip():
                candidate.raw_text = joined
                candidate.cleaned_lines = clean_mrz_text(joined)
                flat_details = [item for sublist in details for item in sublist]
                candidate.ocr_confidence = compute_average_confidence(flat_details) if flat_details else 0.0
                return True

    result = run_mrz_ocr(candidate.image, psm=candidate.psm, timeout=timeout)
    if result.is_ok():
        candidate.raw_text = result.unwrap()
        candidate.cleaned_lines = clean_mrz_text(candidate.raw_text)
        candidate.ocr_confidence = None
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
    languages: list[str] | None = None,
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
            for c in candidates:
                c.raw_text = ""
                c.cleaned_lines = []
                c.ocr_confidence = None
            warnings.append("PADDLE_OCR_POOR_RESULT")

            if languages:
                multi_candidate, multi_warnings, multi_engine = _try_multi_lang_candidates(
                    candidates, languages, timeout, paddle_upscale
                )
                if multi_candidate and len(multi_candidate.cleaned_lines) >= 2:
                    warnings.extend(multi_warnings)
                    return multi_candidate, warnings, multi_engine
                warnings.extend(multi_warnings)
        else:
            warnings.append("PADDLE_OCR_FAILED")
            if languages:
                multi_candidate, multi_warnings, multi_engine = _try_multi_lang_candidates(
                    candidates, languages, timeout, paddle_upscale
                )
                if multi_candidate and len(multi_candidate.cleaned_lines) >= 2:
                    warnings.extend(multi_warnings)
                    return multi_candidate, warnings, multi_engine
                warnings.extend(multi_warnings)
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


def _try_multi_lang_candidates(
    candidates: list[OcrCandidate],
    languages: list[str],
    timeout: int,
    upscale_factor: float,
) -> tuple[OcrCandidate | None, list[str], str]:
    warnings: list[str] = []
    best_overall: OcrCandidate | None = None
    best_score_val = float("-inf")
    best_lang = languages[0]

    for lang in languages:
        for candidate in candidates:
            candidate.raw_text = ""
            candidate.cleaned_lines = []
            candidate.ocr_confidence = None

            result = run_paddleocr_mrz_with_details(
                candidate.image, timeout=timeout, lang=lang, upscale_factor=upscale_factor
            )
            if result.is_ok():
                raw_text, details = result.unwrap()
                joined = "\n".join(raw_text) if isinstance(raw_text, list) else str(raw_text)
                if joined.strip():
                    temp = OcrCandidate(
                        image=candidate.image,
                        psm=candidate.psm,
                        preprocessing=candidate.preprocessing,
                        crop_source=candidate.crop_source,
                        crop_ratio=candidate.crop_ratio,
                    )
                    temp.raw_text = joined
                    temp.cleaned_lines = clean_mrz_text(joined)
                    flat_details = [item for sublist in details for item in sublist]
                    temp.ocr_confidence = compute_average_confidence(flat_details) if flat_details else 0.0
                    line1 = temp.cleaned_lines[0] if len(temp.cleaned_lines) >= 1 else None
                    line2 = temp.cleaned_lines[1] if len(temp.cleaned_lines) >= 2 else None
                    temp.score = score_candidate(temp, line1, line2)
                    if temp.score > best_score_val:
                        best_score_val = temp.score
                        best_overall = temp
                        best_lang = lang
                        break

            if best_overall:
                break

    if best_overall:
        for c in candidates:
            c.raw_text = best_overall.raw_text
            c.cleaned_lines = best_overall.cleaned_lines
            c.ocr_confidence = best_overall.ocr_confidence
            c.score = best_overall.score
        warnings.append(f"PADDLE_OCR_LANG_{best_lang.upper()}")
        return best_overall, warnings, "paddleocr"

    warnings.append("PADDLE_OCR_MULTI_LANG_FAILED")
    return None, warnings, "tesseract"


def try_multi_lang_paddleocr(
    candidate: OcrCandidate,
    timeout: int = 8,
    upscale_factor: float = 1.5,
    languages: list[str] | None = None,
) -> tuple[OcrCandidate | None, list[str], str]:
    if languages is None:
        languages = ["ml", "en", "fr", "de", "es", "ar", "ru", "ch", "ja", "ko"]
    warnings: list[str] = []

    if not check_paddleocr_available():
        warnings.append("PADDLE_OCR_UNAVAILABLE")
        result = run_mrz_ocr(candidate.image, psm=candidate.psm, timeout=timeout)
        if result.is_ok():
            candidate.raw_text = result.unwrap()
            candidate.cleaned_lines = clean_mrz_text(candidate.raw_text)
            return candidate if candidate.cleaned_lines else None, warnings, "tesseract"
        return None, warnings, "tesseract"

    best_candidate: OcrCandidate | None = None
    best_score_val = float("-inf")
    best_lang = languages[0]

    for lang in languages:
        result = run_paddleocr_mrz_with_details(
            candidate.image, timeout=timeout, lang=lang, upscale_factor=upscale_factor
        )
        if result.is_ok():
            raw_text, details = result.unwrap()
            joined = "\n".join(raw_text) if isinstance(raw_text, list) else str(raw_text)
            if joined.strip():
                temp = OcrCandidate(
                    image=candidate.image,
                    psm=candidate.psm,
                    preprocessing=candidate.preprocessing,
                    crop_source=candidate.crop_source,
                    crop_ratio=candidate.crop_ratio,
                )
                temp.raw_text = joined
                temp.cleaned_lines = clean_mrz_text(joined)
                flat_details = [item for sublist in details for item in sublist]
                temp.ocr_confidence = compute_average_confidence(flat_details) if flat_details else 0.0
                line1 = temp.cleaned_lines[0] if len(temp.cleaned_lines) >= 1 else None
                line2 = temp.cleaned_lines[1] if len(temp.cleaned_lines) >= 2 else None
                temp.score = score_candidate(temp, line1, line2)
                if temp.score > best_score_val:
                    best_score_val = temp.score
                    best_candidate = temp
                    best_lang = lang

    if best_candidate is None:
        warnings.append("PADDLE_OCR_FAILED")
        result = run_mrz_ocr(candidate.image, psm=candidate.psm, timeout=timeout)
        if result.is_ok():
            candidate.raw_text = result.unwrap()
            candidate.cleaned_lines = clean_mrz_text(candidate.raw_text)
            return candidate if candidate.cleaned_lines else None, warnings, "tesseract"
        return None, warnings, "tesseract"

    candidate.raw_text = best_candidate.raw_text
    candidate.cleaned_lines = best_candidate.cleaned_lines
    candidate.ocr_confidence = best_candidate.ocr_confidence
    candidate.score = best_candidate.score
    warnings.append(f"PADDLE_OCR_USED_LANG_{best_lang.upper()}")

    return candidate, warnings, "paddleocr"


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
    _, _, engine = select_best_candidate_with_engine(candidates, timeout=timeout, prefer_paddleocr=True)
    return engine
