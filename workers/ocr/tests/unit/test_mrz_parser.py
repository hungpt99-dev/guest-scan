"""Tests for MRZ line parser."""

from guestfill_ocr.passport.mrz_parser import (
    detect_mrz_format,
    parse_mrz_lines,
    parse_mrz_lines_result,
)

TD3_LINE1 = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
TD3_LINE2 = "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"

# TD1 format: 3 lines x 30 chars
_TD1_NAME_PART = "SURNAME<<GIVEN<NAME"
_TD1_PAD = 30 - 5 - len(_TD1_NAME_PART)
TD1_LINE1 = "I<VNM" + _TD1_NAME_PART + "<" * _TD1_PAD
_TD1_L2_PAD = 30 - 28
TD1_LINE2 = "AB123456<7VNM7501018M2501019" + "<" * _TD1_L2_PAD
_TD1_L3_PAD = 30 - 18
TD1_LINE3 = "XC123456XXXXXXXXXX" + "<" * _TD1_L3_PAD
assert len(TD1_LINE1) == 30, "TD1_LINE1 len " + str(len(TD1_LINE1))
assert len(TD1_LINE2) == 30, "TD1_LINE2 len " + str(len(TD1_LINE2))
assert len(TD1_LINE3) == 30, "TD1_LINE3 len " + str(len(TD1_LINE3))

# TD2 format: 2 lines x 36 chars
_TD2_NAME_PART = "SURNAME<<GIVEN<NAME"
_TD2_PAD = 36 - 5 - len(_TD2_NAME_PART)
TD2_LINE1 = "P<VNM" + _TD2_NAME_PART + "<" * _TD2_PAD
_TD2_L2_PAD = 36 - 28
TD2_LINE2 = "AB123456<7VNM7501018M2501019" + "<" * _TD2_L2_PAD
assert len(TD2_LINE1) == 36, "TD2_LINE1 len " + str(len(TD2_LINE1))
assert len(TD2_LINE2) == 36, "TD2_LINE2 len " + str(len(TD2_LINE2))


class TestParseMrzLines:
    def test_valid_td3(self) -> None:
        result = parse_mrz_lines(TD3_LINE1, TD3_LINE2)
        assert result["document_type"] == "PASSPORT"
        assert result["issuing_country"] == "VNM"
        assert "SURNAME" in result["full_name"]
        assert "GIVEN" in result["full_name"]

    def test_td3_extracts_all_fields(self) -> None:
        actual = parse_mrz_lines(
            "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<",
            "AB123456<4VNM7501012M2501017<<<<<<<<<<<<<<02",
        )
        assert actual["passport_number"] == "AB123456"
        assert actual["nationality"] == "VNM"
        assert actual["date_of_birth"] == "1975-01-01"
        assert actual["gender"] == "M"
        assert actual["passport_expiry_date"] == "2025-01-01"

    def test_short_lines(self) -> None:
        result = parse_mrz_lines("SHORT", "ALSO_SHORT")
        assert result["document_type"] == "PASSPORT"
        assert result["full_name"] == ""
        assert result["passport_number"] == ""

    def test_empty_lines(self) -> None:
        result = parse_mrz_lines("", "")
        assert result["document_type"] == "PASSPORT"
        assert result["full_name"] == ""

    def test_td1_valid(self) -> None:
        result = parse_mrz_lines(TD1_LINE1, TD1_LINE2, TD1_LINE3)
        assert result["issuing_country"] == "VNM"
        assert "SURNAME" in result["full_name"]
        assert "GIVEN" in result["full_name"]

    def test_td1_missing_line3_fallback(self) -> None:
        """With only 2 TD1 lines (30 chars each), name and fields should still be parsed."""
        result = parse_mrz_lines(TD1_LINE1, TD1_LINE2)
        assert "SURNAME" in result["full_name"]
        assert result["passport_number"] == "AB123456"
        assert result["nationality"] == "VNM"

    def test_td2_valid(self) -> None:
        result = parse_mrz_lines(TD2_LINE1, TD2_LINE2)
        assert result["issuing_country"] == "VNM"
        assert "SURNAME" in result["full_name"]
        assert "GIVEN" in result["full_name"]

    def test_td2_extracts_fields(self) -> None:
        result = parse_mrz_lines(TD2_LINE1, TD2_LINE2)
        assert result["passport_number"] == "AB123456"
        assert result["nationality"] == "VNM"
        assert result["date_of_birth"] == "1975-01-01"
        assert result["gender"] == "M"

    def test_detect_td3_format(self) -> None:
        assert detect_mrz_format(TD3_LINE1, TD3_LINE2) == "TD3"

    def test_detect_td1_format(self) -> None:
        assert detect_mrz_format(TD1_LINE1, TD1_LINE2, TD1_LINE3) == "TD1"

    def test_detect_td2_format(self) -> None:
        assert detect_mrz_format(TD2_LINE1, TD2_LINE2) == "TD2"

    def test_detect_unknown_format(self) -> None:
        assert detect_mrz_format("SHORT", "ALSO_SHORT") is None

    def test_parse_result_td3_ok(self) -> None:
        result = parse_mrz_lines_result(TD3_LINE1, TD3_LINE2)
        assert result.is_ok()
        fields = result.unwrap()
        assert fields["passport_number"] != ""

    def test_parse_result_unknown_err(self) -> None:
        result = parse_mrz_lines_result("SHORT", "ALSO_SHORT")
        assert result.is_err()

    def test_td3_date_of_birth_parsed(self) -> None:
        result = parse_mrz_lines(TD3_LINE1, TD3_LINE2)
        assert result["date_of_birth"] == "1975-01-01"

    def test_td3_expiry_date_parsed(self) -> None:
        result = parse_mrz_lines(TD3_LINE1, TD3_LINE2)
        assert result["passport_expiry_date"] == "2025-01-01"

    def test_td3_gender_male(self) -> None:
        result = parse_mrz_lines(TD3_LINE1, TD3_LINE2)
        assert result["gender"] == "M"

    def test_td3_gender_female(self) -> None:
        line2 = "AB123456<7VNM7501018F2501019<<<<<<<<<<<<<<02"
        result = parse_mrz_lines(TD3_LINE1, line2)
        assert result["gender"] == "F"

    def test_td3_passport_number_cleaned(self) -> None:
        result = parse_mrz_lines(TD3_LINE1, TD3_LINE2)
        assert result["passport_number"] == "AB123456"

    def test_td3_nationality(self) -> None:
        result = parse_mrz_lines(TD3_LINE1, TD3_LINE2)
        assert result["nationality"] == "VNM"

    def test_td3_optional_data(self) -> None:
        line2 = "AB123456<7VNM7501018M2501019<<<<<EXTRA<<<<<02"
        result = parse_mrz_lines(TD3_LINE1[:44], line2[:44])
        assert result["optional_data"] == "EXTRA"

    def test_td2_nationality(self) -> None:
        result = parse_mrz_lines(TD2_LINE1, TD2_LINE2)
        assert result["nationality"] == "VNM"

    def test_td2_optional_data(self) -> None:
        line2 = "AB123456<7VNM7501018M2501019<<EXTRA<"
        assert len(line2) == 36, f"Expected 36, got {len(line2)}"
        result = parse_mrz_lines(TD2_LINE1, line2)
        assert result["optional_data"] == "EXTRA"
