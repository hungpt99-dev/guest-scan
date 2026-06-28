"""PaddleOCR-specific image preprocessing for optimal MRZ extraction.

PaddleOCR benefits from different preprocessing than Tesseract:
- PaddleOCR works well with color images (no need to grayscale)
- Slight upscaling improves small text detection
- Bilateral filtering preserves edges while reducing noise
- CLAHE on the L channel improves contrast in uneven lighting
"""

import cv2
import numpy as np


def preprocess_for_paddleocr(
    image: np.ndarray,
    upscale: bool = True,
    denoise: bool = True,
    enhance_contrast: bool = True,
    target_height: int = 1200,
) -> np.ndarray:
    result = image.copy()

    if len(result.shape) == 2:
        result = cv2.cvtColor(result, cv2.COLOR_GRAY2BGR)
    elif len(result.shape) == 3 and result.shape[2] == 4:
        result = cv2.cvtColor(result, cv2.COLOR_RGBA2BGR)

    h, w = result.shape[:2]

    if upscale and h < target_height:
        scale = target_height / h
        new_w = int(w * scale)
        result = cv2.resize(result, (new_w, target_height), interpolation=cv2.INTER_CUBIC)

    if enhance_contrast:
        lab = cv2.cvtColor(result, cv2.COLOR_BGR2LAB)
        lightness, a, b = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        lightness = clahe.apply(lightness)
        lab = cv2.merge([lightness, a, b])
        result = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    if denoise:
        result = cv2.bilateralFilter(result, d=5, sigmaColor=30, sigmaSpace=10)

    return result
