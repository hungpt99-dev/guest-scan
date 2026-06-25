"""ID card OCR processing."""

import numpy as np

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Ok, Result
from guestfill_ocr.id_card.id_field_parser import parse_id_card_fields
from guestfill_ocr.ocr.tesseract_engine import run_tesseract_ocr


def process_id_card(gray: np.ndarray, source_file: str) -> Result:
    try:
        result = run_tesseract_ocr(gray, psm=4, timeout=15)
        if result.is_err():
            return Err(result.unwrap_err())
        text = result.unwrap()
        fields = parse_id_card_fields(text)
        fields["source_file"] = source_file
        return Ok(fields)
    except Exception as e:
        return Err(OcrError("ID_CARD_PARSE_FAILED", f"ID card OCR failed: {e}", source_file=source_file))
