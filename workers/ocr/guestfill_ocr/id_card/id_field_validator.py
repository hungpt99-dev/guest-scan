"""Validate ID card extracted fields."""

from guestfill_ocr.common.constants import WARNING_CODES


def validate_id_card_fields(fields: dict) -> list[str]:
    warnings: list[str] = []
    if not fields.get("full_name"):
        warnings.append(WARNING_CODES["FULL_NAME_MISSING"])
    if not fields.get("id_number"):
        warnings.append(WARNING_CODES["ID_NUMBER_MISSING"])
    if not fields.get("date_of_birth"):
        warnings.append(WARNING_CODES["DOB_MISSING"])
    if fields.get("gender") == "UNKNOWN":
        warnings.append(WARNING_CODES["GENDER_UNKNOWN"])
    return warnings
