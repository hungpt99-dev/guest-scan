"""Crop utilities for extracting regions of interest."""

import numpy as np


def crop_bottom_percent(gray: np.ndarray, percent: float) -> np.ndarray:
    h = gray.shape[0]
    crop_start = int(h * (1 - percent / 100))
    return gray[crop_start:, :]


def crop_top_percent(gray: np.ndarray, percent: float) -> np.ndarray:
    h = gray.shape[0]
    crop_end = int(h * percent / 100)
    return gray[:crop_end, :]


def crop_region(gray: np.ndarray, x: int, y: int, w: int, h: int) -> np.ndarray:
    y = max(0, y)
    x = max(0, x)
    h = min(h, gray.shape[0] - y)
    w = min(w, gray.shape[1] - x)
    return gray[y : y + h, x : x + w]


def crop_lower_half(gray: np.ndarray) -> np.ndarray:
    h = gray.shape[0]
    return gray[h // 2 :, :]
