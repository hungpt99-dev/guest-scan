"""Image preprocessing for OCR."""

import cv2
import numpy as np


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
