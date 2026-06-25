"""Tests for MRZ check digit validation."""

from guestfill_ocr.passport.mrz_validator import (
    char_value,
    compute_check_digit,
    validate_check_digit,
)


class TestCharValue:
    def test_digit_values(self) -> None:
        assert char_value("0") == 0
        assert char_value("5") == 5
        assert char_value("9") == 9

    def test_letter_values(self) -> None:
        assert char_value("A") == 10
        assert char_value("Z") == 35

    def test_filler_value(self) -> None:
        assert char_value("<") == 0

    def test_invalid_character(self) -> None:
        import pytest

        with pytest.raises(ValueError):
            char_value("@")


class TestComputeCheckDigit:
    def test_simple_value(self) -> None:
        result = compute_check_digit("12345678")
        assert isinstance(result, str)
        assert result.isdigit()

    def test_with_letters(self) -> None:
        result = compute_check_digit("AB123456")
        assert isinstance(result, str)
        assert result.isdigit()

    def test_with_filler(self) -> None:
        result = compute_check_digit("ABC<<<<<")
        assert isinstance(result, str)


class TestValidateCheckDigit:
    def test_valid_digit(self) -> None:
        value = "12345678"
        digit = compute_check_digit(value)
        assert validate_check_digit(value, digit) is True

    def test_invalid_digit(self) -> None:
        assert validate_check_digit("12345678", "9") is False

    def test_filler_digit_is_always_valid(self) -> None:
        assert validate_check_digit("12345678", "<") is True
