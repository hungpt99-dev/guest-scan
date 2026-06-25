"""Image thresholding methods for OCR."""

import cv2
import numpy as np


def threshold_otsu(gray: np.ndarray) -> np.ndarray:
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return binary


def threshold_adaptive(gray: np.ndarray, block_size: int = 31, c: int = 10) -> np.ndarray:
    return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, c)


def threshold_binary(gray: np.ndarray, threshold: int = 128) -> np.ndarray:
    _, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)
    return binary


def threshold_inverse(gray: np.ndarray, threshold: int = 128) -> np.ndarray:
    _, binary = cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY_INV)
    return binary
