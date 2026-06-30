"""Tesseract OCR engine wrapper."""

import logging
import subprocess
import time

import cv2
import numpy as np
import pytesseract
from PIL import Image

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Ok, Result

logger = logging.getLogger("guestfill_ocr.tesseract_engine")

MRZ_CONFIG = "-c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789< --psm 6"
GENERIC_CONFIG = "--psm 3"

_TESSERACT_CHECKED = False
_TESSERACT_AVAILABLE = False

_TESSERACT_RETRY_ATTEMPTS = 2
_TESSERACT_RETRY_BACKOFF = 1.0


def check_tesseract_available() -> bool:
    global _TESSERACT_CHECKED, _TESSERACT_AVAILABLE
    if _TESSERACT_CHECKED:
        return _TESSERACT_AVAILABLE
    for attempt in range(1, _TESSERACT_RETRY_ATTEMPTS + 1):
        try:
            result = subprocess.run(
                [pytesseract.pytesseract.tesseract_cmd, "--version"],
                capture_output=True,
                timeout=5,
            )
            if result.returncode == 0:
                _TESSERACT_AVAILABLE = True
                _TESSERACT_CHECKED = True
                return True
            logger.warning(
                "Tesseract version check attempt %d/%d failed | returncode=%d",
                attempt,
                _TESSERACT_RETRY_ATTEMPTS,
                result.returncode,
            )
        except Exception as e:
            logger.warning(
                "Tesseract version check attempt %d/%d raised | error=%s",
                attempt,
                _TESSERACT_RETRY_ATTEMPTS,
                e,
            )
        if attempt < _TESSERACT_RETRY_ATTEMPTS:
            time.sleep(_TESSERACT_RETRY_BACKOFF * attempt)
    _TESSERACT_AVAILABLE = False
    _TESSERACT_CHECKED = True
    return False


def run_tesseract_ocr(
    image: np.ndarray | str,
    psm: int = 6,
    lang: str = "eng",
    timeout: int = 8,
    char_whitelist: str | None = None,
) -> Result:
    if not check_tesseract_available():
        return Err(
            OcrError(
                "TESSERACT_NOT_FOUND",
                "Tesseract OCR engine is not installed. Please install Tesseract "
                "(brew install tesseract on macOS, apt install tesseract-ocr on Linux).",
            )
        )

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
