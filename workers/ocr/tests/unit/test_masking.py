"""Tests for sensitive data masking."""

from guestfill_ocr.security.sensitive_masking import (
    mask_full_name,
    mask_id_number,
    mask_passport_number,
)


class TestMaskPassportNumber:
    def test_normal(self) -> None:
        assert mask_passport_number("AB123456") == "AB12****"

    def test_short(self) -> None:
        assert mask_passport_number("AB") == "AB"


class TestMaskIdNumber:
    def test_normal(self) -> None:
        assert mask_id_number("123456789") == "1234*****"

    def test_short(self) -> None:
        assert mask_id_number("12") == "12"


class TestMaskFullName:
    def test_multiple_parts(self) -> None:
        masked = mask_full_name("John Doe")
        assert "D" in masked
        assert "oe" not in masked
