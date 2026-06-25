"""Classify document type from an image."""

import numpy as np

from guestfill_ocr.classification.id_card_detector import detect_id_card_layout
from guestfill_ocr.classification.passport_detector import detect_passport_layout


def classify_document(gray: np.ndarray, mode: str = "auto") -> dict:
    if mode == "passport_mrz":
        return {
            "document_type": "PASSPORT",
            "sub_type": "PASSPORT_MRZ",
            "confidence": 1.0,
            "signals": ["FORCED_MODE"],
        }
    if mode == "passport_visual":
        return {
            "document_type": "PASSPORT",
            "sub_type": "PASSPORT_VISUAL",
            "confidence": 1.0,
            "signals": ["FORCED_MODE"],
        }
    if mode == "id_card":
        return {
            "document_type": "ID_CARD",
            "sub_type": "ID_CARD",
            "confidence": 1.0,
            "signals": ["FORCED_MODE"],
        }
    if mode == "generic_document":
        return {
            "document_type": "UNKNOWN",
            "sub_type": "GENERIC",
            "confidence": 1.0,
            "signals": ["FORCED_MODE"],
        }

    passport_result = detect_passport_layout(gray)
    id_card_result = detect_id_card_layout(gray)

    if passport_result["is_passport"] and passport_result["confidence"] >= id_card_result["confidence"]:
        return {
            "document_type": "PASSPORT",
            "sub_type": "PASSPORT_MRZ",
            "confidence": passport_result["confidence"],
            "signals": passport_result["signals"],
        }

    if id_card_result["is_id_card"]:
        return {
            "document_type": "ID_CARD",
            "sub_type": "ID_CARD",
            "confidence": id_card_result["confidence"],
            "signals": id_card_result["signals"],
        }

    return {
        "document_type": "UNKNOWN",
        "sub_type": "GENERIC",
        "confidence": 0.0,
        "signals": [],
    }
