"""Resize images while preserving aspect ratio."""

import cv2
import numpy as np


def resize_keep_ratio(image: np.ndarray, max_width: int = 1800) -> np.ndarray:
    h, w = image.shape[:2]
    if w <= max_width:
        return image
    ratio = max_width / w
    new_h = int(h * ratio)
    return cv2.resize(image, (max_width, new_h), interpolation=cv2.INTER_AREA)


def resize_to_height(image: np.ndarray, target_height: int) -> np.ndarray:
    h, w = image.shape[:2]
    ratio = target_height / h
    new_w = int(w * ratio)
    return cv2.resize(image, (new_w, target_height), interpolation=cv2.INTER_AREA)
