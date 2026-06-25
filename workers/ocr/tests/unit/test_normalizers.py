"""Tests for field normalizers."""

from guestfill_ocr.extraction.field_normalizer import (
    normalize_country,
    normalize_date,
    normalize_gender,
    normalize_name,
    normalize_passport_number,
)


class TestNormalizeName:
    def test_simple_name(self) -> None:
        assert normalize_name("John Doe") == "JOHN DOE"

    def test_with_mrz_filler(self) -> None:
        assert normalize_name("SURNAME<<GIVEN") == "SURNAME GIVEN"

    def test_extra_spaces(self) -> None:
        assert normalize_name("  John   Doe  ") == "JOHN DOE"


class TestNormalizeGender:
    def test_male_variants(self) -> None:
        assert normalize_gender("M") == "M"
        assert normalize_gender("MALE") == "M"
        assert normalize_gender("NAM") == "M"

    def test_female_variants(self) -> None:
        assert normalize_gender("F") == "F"
        assert normalize_gender("FEMALE") == "F"

    def test_unknown(self) -> None:
        assert normalize_gender("X") == "UNKNOWN"
        assert normalize_gender("<") == "UNKNOWN"
        assert normalize_gender("") == "UNKNOWN"


class TestNormalizeDate:
    def test_yyyymmdd(self) -> None:
        assert normalize_date("750101") == "1975-01-01"

    def test_ddmmyyyy(self) -> None:
        assert normalize_date("01/01/1975") == "1975-01-01"

    def test_yyyy_mm_dd(self) -> None:
        assert normalize_date("1975-01-01") == "1975-01-01"

    def test_empty(self) -> None:
        assert normalize_date("") == ""


class TestNormalizeCountry:
    def test_iso3_preserved(self) -> None:
        assert normalize_country("VNM") == "VNM"

    def test_iso2_mapping(self) -> None:
        assert normalize_country("VN") == "VNM"
        assert normalize_country("US") == "USA"

    def test_empty(self) -> None:
        assert normalize_country("") == ""


class TestNormalizePassportNumber:
    def test_simple(self) -> None:
        assert normalize_passport_number("AB123456") == "AB123456"

    def test_trailing_fillers(self) -> None:
        assert normalize_passport_number("AB123456<<") == "AB123456"

    def test_lowercase(self) -> None:
        assert normalize_passport_number("ab123456") == "AB123456"
