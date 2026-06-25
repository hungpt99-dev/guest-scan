"""Load images from file paths."""

import cv2

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Ok, Result


def load_image(path: str) -> Result:
    try:
        image = cv2.imread(path)
        if image is None:
            return Err(OcrError("IMAGE_LOAD_FAILED", f"Could not load image: {path}", source_file=path))
        return Ok(image)
    except Exception as e:
        return Err(OcrError("IMAGE_LOAD_FAILED", f"Error loading image: {e}", source_file=path))


def load_image_grayscale(path: str) -> Result:
    result = load_image(path)
    if result.is_err():
        return Err(result.unwrap_err())
    gray = cv2.cvtColor(result.unwrap(), cv2.COLOR_BGR2GRAY)
    return Ok(gray)
