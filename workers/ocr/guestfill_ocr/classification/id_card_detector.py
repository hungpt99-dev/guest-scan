"""Detect ID card documents in images."""

import cv2
import numpy as np


def detect_id_card_layout(gray: np.ndarray) -> dict:
    h, w = gray.shape[:2]
    ratio = w / h if h > 0 else 0
    area = w * h
    signals: list[str] = []
    is_id_card = False
    confidence = 0.0

    if 1.4 < ratio < 1.8:
        signals.append("ASPECT_RATIO_ID_CARD")
        confidence += 0.2

    edges = cv2.Canny(gray, 50, 150)
    edge_density = float(cv2.countNonZero(edges)) / area
    if edge_density < 0.15:
        signals.append("LOW_EDGE_DENSITY")
        confidence += 0.15

    binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    white_ratio = float(cv2.countNonZero(binary)) / area
    if 0.4 < white_ratio < 0.8:
        signals.append("BALANCED_WHITE_RATIO")
        confidence += 0.15

    if confidence >= 0.3:
        is_id_card = True

    return {
        "is_id_card": is_id_card,
        "confidence": min(confidence, 1.0),
        "signals": signals,
    }
