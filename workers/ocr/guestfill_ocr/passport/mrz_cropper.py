"""MRZ crop detection strategies."""

from dataclasses import dataclass
from typing import Any

import cv2
import numpy as np

from guestfill_ocr.image.crop_utils import crop_bottom_percent
from guestfill_ocr.image.preprocess import apply_clahe
from guestfill_ocr.image.thresholding import threshold_adaptive, threshold_otsu


@dataclass
class MrzCropCandidate:
    image: Any
    source: str
    bbox: tuple | None = None
    crop_ratio: float | None = None
    preprocessing: str = "none"


def generate_bottom_crop_candidates(gray: np.ndarray) -> list[MrzCropCandidate]:
    candidates: list[MrzCropCandidate] = []
    ratios = [20, 25, 30, 35, 40]
    for ratio in ratios:
        cropped = crop_bottom_percent(gray, ratio)
        clahe_applied = apply_clahe(cropped)
        otsu = threshold_otsu(clahe_applied)
        adaptive = threshold_adaptive(cropped)
        candidates.append(
            MrzCropCandidate(image=cropped, source=f"bottom_{ratio}", crop_ratio=ratio, preprocessing="grayscale")
        )
        candidates.append(
            MrzCropCandidate(
                image=clahe_applied,
                source=f"bottom_{ratio}",
                crop_ratio=ratio,
                preprocessing="clahe",
            )
        )
        candidates.append(
            MrzCropCandidate(image=otsu, source=f"bottom_{ratio}", crop_ratio=ratio, preprocessing="otsu")
        )
        candidates.append(
            MrzCropCandidate(image=adaptive, source=f"bottom_{ratio}", crop_ratio=ratio, preprocessing="adaptive")
        )
    return candidates


def detect_mrz_band(gray: np.ndarray) -> list[tuple[int, int, int, int]]:
    binary = threshold_otsu(gray)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (25, 3))
    morphed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    contours, _ = cv2.findContours(morphed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = gray.shape[:2]
    candidates: list[tuple[int, int, int, int]] = []
    for contour in contours:
        x, y, cw, ch = cv2.boundingRect(contour)
        if cw > w * 0.5 and y > h * 0.45:
            candidates.append((x, y, cw, ch))
    return candidates


def generate_morph_band_candidates(gray: np.ndarray) -> list[MrzCropCandidate]:
    candidates: list[MrzCropCandidate] = []
    bands = detect_mrz_band(gray)
    for band in bands:
        x, y, w, h = band
        from guestfill_ocr.image.crop_utils import crop_region

        cropped = crop_region(gray, x, y, w, h)
        clahe_applied = apply_clahe(cropped)
        otsu = threshold_otsu(clahe_applied)
        candidates.append(MrzCropCandidate(image=cropped, source="morph_band", bbox=band, preprocessing="grayscale"))
        candidates.append(MrzCropCandidate(image=clahe_applied, source="morph_band", bbox=band, preprocessing="clahe"))
        candidates.append(MrzCropCandidate(image=otsu, source="morph_band", bbox=band, preprocessing="otsu"))
    return candidates


def generate_all_candidates(gray: np.ndarray) -> list[MrzCropCandidate]:
    candidates: list[MrzCropCandidate] = []
    candidates.extend(generate_bottom_crop_candidates(gray))
    candidates.extend(generate_morph_band_candidates(gray))
    return candidates
