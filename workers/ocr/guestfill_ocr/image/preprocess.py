"""Image preprocessing for OCR with adaptive pipeline selection.

Supports multiple preprocessing paths optimized for different
document quality levels:
  - Standard: CLAHE + denoise + deskew (existing)
  - Worn/creased: CLAHE + bilateral filter + morph close + adaptive threshold
  - Low contrast: LAB CLAHE + gamma correction + unsharp mask + contrast stretch
  - Glare/highlight: Glare mask + inpaint + standard pipeline
  - RTL: Same as standard but skip deskew for slight rotations
"""

import cv2
import numpy as np

from guestfill_ocr.image.quality_analyzer import (
    PATH_GLARE,
    PATH_LOW_CONTRAST,
    PATH_RTL,
    PATH_STANDARD,
    PATH_WORN,
)


def to_grayscale(image: np.ndarray) -> np.ndarray:
    if len(image.shape) == 3:
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return image


def apply_clahe(gray: np.ndarray, clip_limit: float = 2.0, grid_size: tuple = (8, 8)) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=grid_size)
    return clahe.apply(gray)


def light_denoise(gray: np.ndarray, strength: int = 10) -> np.ndarray:
    return cv2.fastNlMeansDenoising(gray, None, strength, 7, 21)


def deskew(gray: np.ndarray) -> np.ndarray:
    try:
        coords = np.column_stack(np.where(gray > 128))
        if len(coords) < 100:
            return gray
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        if abs(angle) < 0.5:
            return gray
        h, w = gray.shape[:2]
        center = (w // 2, h // 2)
        matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
        return cv2.warpAffine(gray, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    except Exception:
        return gray


def preprocess_pipeline(
    gray: np.ndarray,
    apply_clahe_flag: bool = True,
    apply_denoise: bool = True,
    deskew_flag: bool = True,
) -> np.ndarray:
    result = gray.copy()
    if apply_clahe_flag:
        result = apply_clahe(result)
    if apply_denoise:
        result = light_denoise(result)
    if deskew_flag:
        result = deskew(result)
    return result


def preprocess_worn_creased(gray: np.ndarray) -> np.ndarray:
    result = gray.copy()
    result = apply_clahe(result, clip_limit=3.0)
    result = cv2.bilateralFilter(result, d=7, sigmaColor=50, sigmaSpace=15)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    result = cv2.morphologyEx(result, cv2.MORPH_CLOSE, kernel)
    result = cv2.adaptiveThreshold(result, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 2)
    result = deskew(result)
    return result


def preprocess_low_contrast(gray: np.ndarray) -> np.ndarray:
    color = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    lab = cv2.cvtColor(color, cv2.COLOR_BGR2LAB)
    lightness, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    lightness = clahe.apply(lightness)
    lab = cv2.merge([lightness, a, b])
    result = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    result = cv2.cvtColor(result, cv2.COLOR_BGR2GRAY)
    gamma = 1.2
    look_up = np.array([((i / 255.0) ** (1.0 / gamma)) * 255 for i in range(256)]).astype("uint8")
    result = cv2.LUT(result, look_up)
    blur = cv2.GaussianBlur(result, (0, 0), 3)
    result = cv2.addWeighted(result, 1.5, blur, -0.5, 0)
    min_val = float(result.min())
    max_val = float(result.max())
    if max_val > min_val:
        result = ((result - min_val) / (max_val - min_val) * 255).astype(np.uint8)
    result = deskew(result)
    return result


def preprocess_glare(gray: np.ndarray) -> np.ndarray:
    h, w = gray.shape[:2]
    _, glare_mask = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    glare_mask = cv2.morphologyEx(glare_mask, cv2.MORPH_CLOSE, kernel)
    if cv2.countNonZero(glare_mask) > 0:
        result = cv2.inpaint(gray, glare_mask, inpaintRadius=3, flags=cv2.INPAINT_TELEA)
    else:
        result = gray.copy()
    result = apply_clahe(result)
    result = light_denoise(result)
    result = deskew(result)
    return result


def preprocess_rtl(gray: np.ndarray, skew_angle: float = 0.0) -> np.ndarray:
    result = gray.copy()
    result = apply_clahe(result)
    result = light_denoise(result)
    if abs(skew_angle) >= 2.0:
        result = deskew(result)
    return result


def adaptive_preprocess(
    gray: np.ndarray,
    quality: dict | None = None,
) -> np.ndarray:
    if quality is None:
        return preprocess_pipeline(gray)

    path = quality.get("recommended_path", PATH_STANDARD)

    if path == PATH_WORN:
        return preprocess_worn_creased(gray)
    elif path == PATH_LOW_CONTRAST:
        return preprocess_low_contrast(gray)
    elif path == PATH_GLARE:
        return preprocess_glare(gray)
    elif path == PATH_RTL:
        return preprocess_rtl(gray, skew_angle=quality.get("skew_angle", 0.0))

    return preprocess_pipeline(gray)
