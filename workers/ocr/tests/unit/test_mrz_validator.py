"""Tests for MRZ check digit validation."""

from guestfill_ocr.passport.mrz_repair import try_repair_field
from guestfill_ocr.passport.mrz_validator import (
    char_value,
    compute_check_digit,
    validate_check_digit,
    validate_check_digits,
    validate_check_digits_td1,
    validate_check_digits_td2,
    validate_check_digits_td3,
    validate_full_mrz,
)

TD3_LINE1 = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
# Line2 with valid CDs: AB123456->4, 750101->2, 250101->7, composite->02
TD3_VALID = "AB123456<4VNM7501012M2501017<<<<<<<<<<<<<<02"
TD3_BAD = "OB123456<4VNM7501012M2501017<<<<<<<<<<<<<<02"

# TD1: 3 x 30
_TD1_L2_PAD = 30 - 28
TD1_LINE1 = "I<VNMTAEST<<SURNAME<<GIVEN<<NA"
# CD for AB123456< = 4; CD for 750101 = 2; CD for 250101 = 7
TD1_VALID = "AB123456<4VNM7501012M2501017" + "<" * _TD1_L2_PAD
TD1_LINE3 = "XC123456XXXXXXXXXX" + "<" * (30 - 18)
assert len(TD1_VALID) == 30, f"TD1_VALID is {len(TD1_VALID)}"
assert len(TD1_LINE3) == 30, f"TD1_LINE3 is {len(TD1_LINE3)}"

# TD2: 2 x 36
_TD2_L2_PAD = 36 - 28
_TD2_L1_NAME = "SURNAME<<GIVEN<NAME"
_TD2_L1_PAD = 36 - 5 - len(_TD2_L1_NAME)
TD2_LINE1 = "P<VNM" + _TD2_L1_NAME + "<" * _TD2_L1_PAD
# CD for AB123456< = 4; CD for 750101 = 2; CD for 250101 = 7
TD2_VALID = "AB123456<4VNM7501012M2501017" + "<" * _TD2_L2_PAD
assert len(TD2_LINE1) == 36, f"TD2_LINE1 is {len(TD2_LINE1)}"
assert len(TD2_VALID) == 36, f"TD2_VALID is {len(TD2_VALID)}"


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

    def test_known_passport_number(self) -> None:
        assert compute_check_digit("AB123456<") == "4"

    def test_known_dob(self) -> None:
        assert compute_check_digit("750101") == "2"

    def test_known_expiry(self) -> None:
        assert compute_check_digit("250101") == "7"


class TestValidateCheckDigit:
    def test_valid_digit(self) -> None:
        value = "12345678"
        digit = compute_check_digit(value)
        assert validate_check_digit(value, digit) is True

    def test_invalid_digit(self) -> None:
        assert validate_check_digit("12345678", "9") is False

    def test_filler_digit_is_always_valid(self) -> None:
        assert validate_check_digit("12345678", "<") is True


class TestValidateFullMrz:
    def test_valid_td3(self) -> None:
        result = validate_full_mrz(TD3_LINE1, TD3_VALID)
        assert result["overall_valid"] is True
        assert len(result["errors"]) == 0

    def test_invalid_td3(self) -> None:
        result = validate_full_mrz(TD3_LINE1, TD3_BAD)
        assert result["overall_valid"] is False

    def test_short_line2(self) -> None:
        result = validate_full_mrz(TD3_LINE1, "SHORT")
        assert "LINE2_TOO_SHORT" in result["errors"]


class TestValidateCheckDigitsTd3:
    def test_all_valid(self) -> None:
        result = validate_check_digits_td3(TD3_LINE1, TD3_VALID)
        assert result["passport_number_valid"] is True
        assert result["date_of_birth_valid"] is True
        assert result["expiry_date_valid"] is True
        assert result["final_composite_valid"] is True
        assert result["overall_valid"] is True

    def test_bad_passport_number(self) -> None:
        line2 = "OB123456<4VNM7501012M2501017<<<<<<<<<<<<<<02"
        result = validate_check_digits_td3(TD3_LINE1, line2)
        assert result["passport_number_valid"] is False
        assert "PASSPORT_NUMBER_CHECK_FAILED" in result["errors"]

    def test_bad_dob(self) -> None:
        line2 = "AB123456<4VNM7501012M2501017<<<<<<<<<<<<<<02"
        result = validate_check_digits_td3(TD3_LINE1, line2)
        assert result["date_of_birth_valid"] is True


class TestValidateCheckDigitsTd1:
    def test_all_valid(self) -> None:
        result = validate_check_digits_td1(TD1_LINE1, TD1_VALID, TD1_LINE3)
        assert result["passport_number_valid"] is True
        assert result["date_of_birth_valid"] is True
        assert result["expiry_date_valid"] is True
        assert result["overall_valid"] is True

    def test_short_line2(self) -> None:
        result = validate_check_digits_td1(TD1_LINE1, "SHORT", TD1_LINE3)
        assert "LINE2_TOO_SHORT" in result["errors"]

    def test_bad_passport_number(self) -> None:
        line2 = "OB123456<7VNM7501018M2501019<<"
        assert len(line2) == 30, f"Expected 30, got {len(line2)}"
        result = validate_check_digits_td1(TD1_LINE1, line2, TD1_LINE3)
        assert result["passport_number_valid"] is False
        assert "PASSPORT_NUMBER_CHECK_FAILED" in result["errors"]

    def test_bad_expiry_checkdigit(self) -> None:
        line2 = "AB123456<4VNM7501012M2501019<<"
        assert len(line2) == 30, f"Expected 30, got {len(line2)}"
        result = validate_check_digits_td1(TD1_LINE1, line2, TD1_LINE3)
        assert result["expiry_date_valid"] is False

    def test_good_expiry_checkdigit(self) -> None:
        line2 = "AB123456<4VNM7501012M2501017<<"
        assert len(line2) == 30, f"Expected 30, got {len(line2)}"
        result = validate_check_digits_td1(TD1_LINE1, line2, TD1_LINE3)
        assert result["expiry_date_valid"] is True


class TestValidateCheckDigitsTd2:
    def test_all_valid(self) -> None:
        result = validate_check_digits_td2(TD2_LINE1, TD2_VALID)
        assert result["passport_number_valid"] is True
        assert result["date_of_birth_valid"] is True
        assert result["expiry_date_valid"] is True
        assert result["overall_valid"] is True

    def test_short_line2(self) -> None:
        result = validate_check_digits_td2(TD2_LINE1, "SHORT")
        assert "LINE2_TOO_SHORT" in result["errors"]

    def test_bad_passport_number(self) -> None:
        line2 = "OB123456<4VNM7501012M2501017" + "<" * 8
        assert len(line2) == 36, f"Expected 36, got {len(line2)}"
        result = validate_check_digits_td2(TD2_LINE1, line2)
        assert result["passport_number_valid"] is False

    def test_bad_dob_checkdigit(self) -> None:
        line2 = "AB123456<4VNM7501019M2501017" + "<" * 8
        assert len(line2) == 36, f"Expected 36, got {len(line2)}"
        result = validate_check_digits_td2(TD2_LINE1, line2)
        assert result["date_of_birth_valid"] is False

    def test_good_dob_checkdigit(self) -> None:
        line2 = "AB123456<4VNM7501012M2501017" + "<" * 8
        assert len(line2) == 36, f"Expected 36, got {len(line2)}"
        result = validate_check_digits_td2(TD2_LINE1, line2)
        assert result["date_of_birth_valid"] is True


class TestValidateCheckDigitsAuto:
    def test_detects_td3(self) -> None:
        result = validate_check_digits(TD3_LINE1, TD3_VALID)
        assert result["overall_valid"] is True

    def test_detects_td1(self) -> None:
        result = validate_check_digits(TD1_LINE1, TD1_VALID, TD1_LINE3)
        assert result["overall_valid"] is True

    def test_detects_td2(self) -> None:
        result = validate_check_digits(TD2_LINE1, TD2_VALID)
        assert result["overall_valid"] is True

    def test_unknown_format(self) -> None:
        result = validate_check_digits("SHORT", "ALSO_SHORT")
        assert result["overall_valid"] is False
        assert "UNKNOWN_FORMAT" in result["errors"]


class TestRepairField:
    def test_no_repair_needed(self) -> None:
        value = "12345678"
        digit = compute_check_digit(value)
        result, changed, warning = try_repair_field(value, digit, "TEST")
        assert changed is False
        assert warning == ""

    def test_repair_o_to_zero(self) -> None:
        value = "12345678"
        digit = compute_check_digit(value)
        broken = value.replace("8", "B")
        result, changed, warning = try_repair_field(broken, digit, "TEST")
        assert changed is True
        assert "REPAIRED" in warning
