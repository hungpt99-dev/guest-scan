"""Tests for confidence engine."""

from guestfill_ocr.extraction.confidence_engine import (
    calculate_passport_confidence,
    determine_status,
    get_confidence_level,
)


class TestCalculatePassportConfidence:
    def test_perfect_conditions(self) -> None:
        score = calculate_passport_confidence(
            has_mrz=True,
            lines_valid=True,
            check_digits={
                "passport_number_valid": True,
                "date_of_birth_valid": True,
                "expiry_date_valid": True,
                "final_composite_valid": True,
            },
            image_quality={"quality_ok": True},
            warnings=[],
            repair_used=False,
            visual_used=False,
        )
        assert score > 0.9

    def test_low_quality(self) -> None:
        score = calculate_passport_confidence(
            has_mrz=False,
            lines_valid=False,
            check_digits={},
            image_quality={"quality_ok": False, "warnings": ["LOW_IMAGE_SHARPNESS"]},
            warnings=["MRZ_NOT_FOUND"],
            repair_used=False,
            visual_used=True,
        )
        assert score < 0.5


class TestGetConfidenceLevel:
    def test_high(self) -> None:
        assert get_confidence_level(0.95) == "HIGH"

    def test_medium(self) -> None:
        assert get_confidence_level(0.80) == "MEDIUM"

    def test_low(self) -> None:
        assert get_confidence_level(0.50) == "LOW"


class TestDetermineStatus:
    def test_ready(self) -> None:
        assert determine_status(0.95, []) == "READY"

    def test_need_review_low_confidence(self) -> None:
        assert determine_status(0.50, []) == "NEED_REVIEW"

    def test_need_review_warnings(self) -> None:
        assert determine_status(0.95, ["MRZ_NOT_FOUND"]) == "NEED_REVIEW"

    def test_failed(self) -> None:
        assert determine_status(0.0, [], has_fatal_error=True) == "FAILED"
