"""Tesseract OCR engine wrapper."""

import cv2
import numpy as np
import pytesseract
from PIL import Image

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Ok, Result

MRZ_CONFIG = "-c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789< --psm 6"
GENERIC_CONFIG = "--psm 3"


def run_tesseract_ocr(
    image: np.ndarray | str,
    psm: int = 6,
    lang: str = "eng",
    timeout: int = 8,
    char_whitelist: str | None = None,
) -> Result:
    try:
        if isinstance(image, str):
            pil_image = Image.open(image)
        elif isinstance(image, np.ndarray):
            if len(image.shape) == 3:
                image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            pil_image = Image.fromarray(image)
        else:
            return Err(OcrError("OCR_FAILED", "Invalid image type"))
    except Exception as e:
        return Err(OcrError("IMAGE_UNREADABLE", f"Cannot open image for OCR: {e}"))

    config_parts = [f"--psm {psm}"]
    if char_whitelist:
        config_parts.append(f"-c tessedit_char_whitelist={char_whitelist}")
    config = " ".join(config_parts)

    try:
        text = pytesseract.image_to_string(pil_image, lang=lang, config=config, timeout=timeout)
        return Ok(text)
    except RuntimeError as e:
        if "TesseractTimeout" in str(e):
            return Err(OcrError("OCR_TIMEOUT", "Tesseract OCR timed out"))
        return Err(OcrError("OCR_FAILED", f"Tesseract error: {e}"))
    except Exception as e:
        return Err(OcrError("OCR_FAILED", f"OCR failed: {e}"))


def run_mrz_ocr(image: np.ndarray, psm: int = 6, timeout: int = 8) -> Result:
    return run_tesseract_ocr(image, psm=psm, char_whitelist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<", timeout=timeout)
