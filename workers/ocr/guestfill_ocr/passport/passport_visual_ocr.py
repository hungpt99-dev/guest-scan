"""Passport visual zone OCR fallback when MRZ is unavailable."""

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Ok, Result
from guestfill_ocr.ocr.tesseract_engine import run_tesseract_ocr


def run_passport_visual_ocr(image_path: str) -> Result:
    try:
        ocr_result = run_tesseract_ocr(image_path, psm=3)
        if ocr_result.is_err():
            return Err(ocr_result.unwrap_err())
        text = ocr_result.unwrap()
        fields = _extract_visual_fields(text)
        return Ok(fields)
    except Exception as e:
        return Err(OcrError("OCR_FAILED", f"Visual OCR failed: {e}", source_file=image_path))


def _extract_visual_fields(text: str) -> dict:
    import re

    fields: dict = {
        "surname": "",
        "given_name": "",
        "full_name": "",
        "passport_number": "",
        "nationality": "",
        "date_of_birth": "",
        "gender": "UNKNOWN",
        "passport_expiry_date": "",
        "issuing_country": "",
    }
    lines = text.splitlines()
    for line in lines:
        line_upper = line.strip().upper()
        m = re.search(r"PASSPORT\s*NO[.:]?\s*([A-Z0-9]+)", line_upper)
        if m:
            fields["passport_number"] = m.group(1)
        m = re.search(r"SURNAME[.:]?\s*(.+)", line_upper)
        if m:
            fields["surname"] = m.group(1).strip()
        m = re.search(r"GIVEN\s*NAME[.:]?\s*(.+)", line_upper)
        if m:
            fields["given_name"] = m.group(1).strip()
        m = re.search(r"NATIONALITY[.:]?\s*([A-Z]+)", line_upper)
        if m:
            fields["nationality"] = m.group(1)
        m = re.search(r"DATE\s*OF\s*BIRTH[.:]?\s*([\d/.-]+)", line_upper)
        if m:
            fields["date_of_birth"] = m.group(1).strip()
        m = re.search(r"\bSEX[.:]?\s*([MF])", line_upper)
        if m:
            fields["gender"] = m.group(1)
        m = re.search(r"DATE\s*OF\s*EXPIRY[.:]?\s*([\d/.-]+)", line_upper)
        if m:
            fields["passport_expiry_date"] = m.group(1).strip()
    if fields["surname"] and fields["given_name"]:
        fields["full_name"] = f"{fields['surname']} {fields['given_name']}"
    elif fields["surname"]:
        fields["full_name"] = fields["surname"]
    return fields
