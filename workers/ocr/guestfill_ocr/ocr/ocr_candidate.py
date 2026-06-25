"""OCR candidate model and generation."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class OcrCandidate:
    image: Any
    psm: int
    preprocessing: str
    crop_source: str
    crop_ratio: float | None = None
    raw_text: str = ""
    cleaned_lines: list[str] = field(default_factory=list)
    score: float = 0.0


def generate_ocr_candidates(preprocessed_images: list[dict]) -> list[OcrCandidate]:
    candidates: list[OcrCandidate] = []
    for item in preprocessed_images:
        for psm in [6, 7, 11, 13]:
            candidate = OcrCandidate(
                image=item["image"],
                psm=psm,
                preprocessing=item.get("preprocessing", "grayscale"),
                crop_source=item.get("source", "unknown"),
                crop_ratio=item.get("crop_ratio"),
            )
            candidates.append(candidate)
    return candidates
