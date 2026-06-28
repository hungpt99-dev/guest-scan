"""Calculate confidence scores for extracted data."""


def calculate_passport_confidence(
    has_mrz: bool,
    lines_valid: bool,
    check_digits: dict,
    image_quality: dict,
    warnings: list[str],
    repair_used: bool,
    visual_used: bool,
    engine_used: str = "tesseract",
) -> float:
    score = 0.50
    if has_mrz:
        score += 0.15
    if lines_valid:
        score += 0.10
    if check_digits.get("passport_number_valid"):
        score += 0.10
    if check_digits.get("date_of_birth_valid"):
        score += 0.10
    if check_digits.get("expiry_date_valid"):
        score += 0.10
    if check_digits.get("final_composite_valid"):
        score += 0.10
    if not any(
        w.startswith("FULL_NAME_MISSING") or w.startswith("PASSPORT_NUMBER_MISSING") or w.startswith("DOB_MISSING")
        for w in warnings
    ):
        score += 0.05
    if image_quality.get("quality_ok"):
        score += 0.05

    if engine_used == "paddleocr":
        score += 0.05

    important_warnings = [
        w for w in warnings if w not in ("LOW_IMAGE_SHARPNESS", "IMAGE_TOO_DARK", "IMAGE_TOO_BRIGHT", "LOW_CONTRAST")
    ]
    score -= len(important_warnings) * 0.10

    if visual_used:
        score -= 0.15
    if repair_used:
        score -= 0.20
    if not image_quality.get("quality_ok"):
        score -= 0.20

    return max(0.0, min(1.0, score))


def calculate_id_card_confidence(
    qr_found: bool,
    ocr_fields_found: bool,
    layout_recognized: bool,
    date_valid: bool,
    number_valid: bool,
    image_quality: dict,
    warnings: list[str],
    qr_conflict: bool,
) -> float:
    score = 0.40
    if qr_found:
        score += 0.25
    if ocr_fields_found:
        score += 0.15
    if layout_recognized:
        score += 0.10
    if date_valid:
        score += 0.10
    if number_valid:
        score += 0.10
    if image_quality.get("quality_ok"):
        score += 0.05

    score -= len(warnings) * 0.10
    if qr_conflict:
        score -= 0.20
    if not image_quality.get("quality_ok"):
        score -= 0.20

    return max(0.0, min(1.0, score))


def get_confidence_level(score: float) -> str:
    if score >= 0.90:
        return "HIGH"
    if score >= 0.70:
        return "MEDIUM"
    return "LOW"


def determine_status(score: float, warnings: list[str], has_fatal_error: bool = False) -> str:
    if has_fatal_error:
        return "FAILED"
    if score >= 0.90 and not warnings:
        return "READY"
    return "NEED_REVIEW"
