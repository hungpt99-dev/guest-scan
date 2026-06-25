"""Validate extracted fields for completeness and correctness."""

from datetime import date, datetime

from guestfill_ocr.common.constants import WARNING_CODES


def validate_passport_fields(fields: dict) -> list[str]:
    warnings: list[str] = []
    if not fields.get("full_name"):
        warnings.append(WARNING_CODES["FULL_NAME_MISSING"])
    if not fields.get("passport_number"):
        warnings.append(WARNING_CODES["PASSPORT_NUMBER_MISSING"])
    if not fields.get("date_of_birth"):
        warnings.append(WARNING_CODES["DOB_MISSING"])
    if fields.get("gender") == "UNKNOWN":
        warnings.append(WARNING_CODES["GENDER_UNKNOWN"])
    if not fields.get("passport_expiry_date"):
        warnings.append(WARNING_CODES["EXPIRY_DATE_MISSING"])
    else:
        expiry = fields["passport_expiry_date"]
        try:
            exp_date = datetime.strptime(expiry, "%Y-%m-%d").date()
            today = date.today()
            if exp_date < today:
                warnings.append(WARNING_CODES["EXPIRY_DATE_EXPIRED"])
            elif (exp_date - today).days <= 90:
                warnings.append(WARNING_CODES["EXPIRY_DATE_SOON"])
        except ValueError:
            warnings.append(WARNING_CODES["EXPIRY_DATE_MISSING"])
    return warnings


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


def validate_required_fields(fields: dict, doc_type: str) -> list[str]:
    if doc_type == "PASSPORT":
        return validate_passport_fields(fields)
    elif doc_type == "ID_CARD":
        return validate_id_card_fields(fields)
    return []
