"""Analyze image quality metrics."""

import cv2
import numpy as np


def calculate_blur_score(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def calculate_brightness(gray: np.ndarray) -> float:
    return float(gray.mean())


def calculate_contrast(gray: np.ndarray) -> float:
    return float(gray.std())


def estimate_skew_angle(gray: np.ndarray) -> float:
    try:
        coords = np.column_stack(np.where(gray > 128))
        if len(coords) < 100:
            return 0.0
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = 90 + angle
        return float(angle)
    except Exception:
        return 0.0


def estimate_glare(gray: np.ndarray) -> float:
    h, w = gray.shape
    top_percentile = float(np.percentile(gray, 98))
    if top_percentile > 240:
        bright_pixels = float(np.sum(gray > 240))
        total_pixels = float(h * w)
        return bright_pixels / total_pixels
    return 0.0


def analyze_quality(gray: np.ndarray) -> dict:
    h, w = gray.shape[:2]
    blur = calculate_blur_score(gray)
    brightness = calculate_brightness(gray)
    contrast = calculate_contrast(gray)
    skew = estimate_skew_angle(gray)
    glare = estimate_glare(gray)

    warnings: list[str] = []
    if blur < 50:
        warnings.append("LOW_IMAGE_SHARPNESS")
    if brightness < 50:
        warnings.append("IMAGE_TOO_DARK")
    elif brightness > 220:
        warnings.append("IMAGE_TOO_BRIGHT")
    if contrast < 30:
        warnings.append("LOW_CONTRAST")
    if abs(skew) > 5:
        warnings.append("IMAGE_SKEWED")
    if glare > 0.15:
        warnings.append("GLARE_DETECTED")
    if w < 800 or h < 600:
        warnings.append("LOW_RESOLUTION")

    return {
        "width": w,
        "height": h,
        "blur_score": round(blur, 2),
        "brightness": round(brightness, 2),
        "contrast": round(contrast, 2),
        "skew_angle": round(skew, 2),
        "glare_ratio": round(glare, 4),
        "warnings": warnings,
        "quality_ok": len(warnings) == 0,
    }
