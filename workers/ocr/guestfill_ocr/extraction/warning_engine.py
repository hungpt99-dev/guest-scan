"""Generate warning codes from processing results."""

from guestfill_ocr.common.constants import WARNING_CODES as WC
from guestfill_ocr.extraction.field_validator import validate_required_fields


def collect_warnings(
    classification: dict,
    quality: dict,
    mrz_lines: list[str],
    check_digits: dict,
    fields: dict,
    repair_warnings: list[str],
    visual_used: bool,
) -> list[str]:
    warnings: list[str] = []

    if not mrz_lines or (len(mrz_lines) < 2):
        warnings.append(WC["MRZ_NOT_FOUND"])

    if check_digits.get("errors"):
        for err in check_digits["errors"]:
            if err == "PASSPORT_NUMBER_CHECK_FAILED":
                warnings.append(WC["PASSPORT_NUMBER_CHECK_FAILED"])
            elif err == "DOB_CHECK_FAILED":
                warnings.append(WC["DOB_CHECK_FAILED"])
            elif err == "EXPIRY_CHECK_FAILED":
                warnings.append(WC["EXPIRY_CHECK_FAILED"])
            elif err == "FINAL_COMPOSITE_CHECK_FAILED":
                warnings.append(WC["FINAL_CHECK_FAILED"])

    doc_type = fields.get("document_type", "UNKNOWN")
    validation_warnings = validate_required_fields(fields, doc_type)
    warnings.extend(validation_warnings)

    warnings.extend(repair_warnings)

    if visual_used:
        warnings.append(WC["VISUAL_OCR_USED"])

    quality_warnings = quality.get("warnings", [])
    warnings.extend(quality_warnings)

    return warnings


def join_warnings(warnings: list[str]) -> str:
    return ";".join(warnings)
