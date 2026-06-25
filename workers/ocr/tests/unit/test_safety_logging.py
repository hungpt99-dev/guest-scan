"""Tests for privacy-safe logging."""

from guestfill_ocr.security.safe_logging import sanitize_dict


class TestSanitizeDict:
    def test_masks_passport_number(self) -> None:
        result = sanitize_dict({"passport_number": "AB123456"})
        assert result["passport_number"] == "AB12****"

    def test_masks_id_number(self) -> None:
        result = sanitize_dict({"id_number": "123456789"})
        assert result["id_number"] == "1234*****"

    def test_masks_full_name(self) -> None:
        result = sanitize_dict({"full_name": "John Doe"})
        assert "D" in result["full_name"]
        assert "oe" not in result["full_name"]

    def test_preserves_non_sensitive_keys(self) -> None:
        result = sanitize_dict({"status": "READY", "confidence_score": 0.95})
        assert result["status"] == "READY"
        assert result["confidence_score"] == 0.95

    def test_handles_empty_dict(self) -> None:
        result = sanitize_dict({})
        assert result == {}

    def test_handles_none_values(self) -> None:
        result = sanitize_dict({"passport_number": None})
        assert result["passport_number"] is None
