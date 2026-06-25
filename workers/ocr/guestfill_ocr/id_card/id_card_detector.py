"""ID card detection in images."""

import cv2
import numpy as np


def detect_id_card(gray: np.ndarray) -> dict:
    h, w = gray.shape[:2]
    ratio = w / h if h > 0 else 0
    signals: list[str] = []
    side = "UNKNOWN"

    if 1.4 < ratio < 1.8:
        signals.append("ASPECT_RATIO_ID_CARD")

    edges = cv2.Canny(gray, 50, 150)
    edge_density = float(cv2.countNonZero(edges)) / (w * h)
    if edge_density < 0.15:
        signals.append("LOW_EDGE_DENSITY")

    binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    white_ratio = float(cv2.countNonZero(binary)) / (w * h)

    if white_ratio > 0.6:
        signals.append("HIGH_WHITE_RATIO")
        side = "FRONT"
    else:
        side = "BACK"

    return {
        "is_id_card": len(signals) >= 2,
        "side": side,
        "confidence": min(len(signals) * 0.25, 1.0),
        "signals": signals,
    }
