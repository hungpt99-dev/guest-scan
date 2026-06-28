"""Detect passport documents in images."""

import cv2
import numpy as np


def detect_passport_layout(gray: np.ndarray) -> dict:
    h, w = gray.shape[:2]
    ratio = w / h if h > 0 else 0
    signals: list[str] = []
    is_passport = False
    confidence = 0.0

    if 1.3 < ratio < 1.8:
        signals.append("ASPECT_RATIO_PASSPORT")
        confidence += 0.3

    bottom = gray[int(h * 0.75) :, :]
    if _has_dense_text_lines(bottom):
        signals.append("DENSE_TEXT_BOTTOM")
        confidence += 0.3

    top_third = gray[: int(h * 0.3), :]
    if _has_large_text_region(top_third):
        signals.append("LARGE_TEXT_TOP")
        confidence += 0.2

    if confidence >= 0.3:
        is_passport = True

    return {
        "is_passport": is_passport,
        "confidence": min(confidence, 1.0),
        "signals": signals,
    }


def _has_dense_text_lines(region: np.ndarray) -> bool:
    binary = cv2.threshold(region, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 1))
    lines = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, horizontal_kernel)
    return float(cv2.countNonZero(lines)) / (region.shape[0] * region.shape[1]) > 0.1


def _has_large_text_region(region: np.ndarray) -> bool:
    binary = cv2.threshold(region, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    return float(cv2.countNonZero(binary)) / (region.shape[0] * region.shape[1]) < 0.8
