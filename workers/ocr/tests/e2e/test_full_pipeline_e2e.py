"""E2E integration tests for the full MRZ pipeline."""

from guestfill_ocr.extraction.confidence_engine import (
    calculate_id_card_confidence,
    calculate_passport_confidence,
    determine_status,
    get_confidence_level,
)
from guestfill_ocr.extraction.field_normalizer import (
    normalize_country,
    normalize_date,
    normalize_gender,
    normalize_id_number,
    normalize_name,
    normalize_passport_number,
)
from guestfill_ocr.passport.mrz_parser import parse_mrz_lines
from guestfill_ocr.passport.mrz_repair import try_repair_field, try_repair_mrz
from guestfill_ocr.passport.mrz_validator import (
    char_value,
    compute_check_digit,
    validate_check_digit,
    validate_full_mrz,
)

VALID_LINE1 = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
VALID_LINE2 = "AB123456<4VNM7501012M2501017<<<<<<<<<<<<<<02"


class TestFullMrzPipelineE2E:
    """End-to-end: MRZ lines -> parse -> validate -> repair -> confidence."""

    def test_full_valid_pipeline(self) -> None:
        parsed = parse_mrz_lines(VALID_LINE1, VALID_LINE2)
        assert parsed["document_type"] == "PASSPORT"
        assert parsed["issuing_country"] == "VNM"
        assert "SURNAME" in parsed["full_name"]
        assert "GIVEN" in parsed["full_name"]
        assert parsed["passport_number"] == "AB123456"
        assert parsed["nationality"] == "VNM"
        assert parsed["date_of_birth"] == "1975-01-01"
        assert parsed["gender"] == "M"
        assert parsed["passport_expiry_date"] == "2025-01-01"

        check_digits = parsed["check_digits"]
        assert check_digits["passport_number_valid"] is True
        assert check_digits["date_of_birth_valid"] is True
        assert check_digits["expiry_date_valid"] is True
        assert check_digits["final_composite_valid"] is True

        parsed_name = normalize_name(parsed["full_name"])
        assert "SURNAME" in parsed_name
        assert "GIVEN" in parsed_name
        assert "NAME" in parsed_name

        parsed_gender = normalize_gender(parsed["gender"])
        assert parsed_gender == "M"

        parsed_nationality = normalize_country(parsed["nationality"])
        assert parsed_nationality == "VNM"

        confidence = calculate_passport_confidence(
            has_mrz=True,
            lines_valid=True,
            check_digits=check_digits,
            image_quality={"quality_ok": True},
            warnings=[],
            repair_used=False,
            visual_used=False,
        )
        assert confidence >= 0.90
        assert get_confidence_level(confidence) == "HIGH"
        assert determine_status(confidence, []) == "READY"

    def test_pipeline_with_repair_correction(self) -> None:
        repaired_lines, warnings = try_repair_mrz(VALID_LINE1, VALID_LINE2)
        assert len(warnings) == 0
        assert repaired_lines == [VALID_LINE1, VALID_LINE2]

        corrupted = "OB123456<4VNM7501012M2501017<<<<<<<<<<<<<<02"
        repaired_lines, warnings = try_repair_mrz(VALID_LINE1, corrupted)
        assert len(warnings) > 0
        parsed = parse_mrz_lines(repaired_lines[0], repaired_lines[1])
        assert parsed["passport_number"] != ""

    def test_pipeline_low_confidence_scenario(self) -> None:
        line1 = "P<USASAMPLE<<SURNAME<<GIVEN<<<<<<<<<<<<<<<<<"
        line2 = "XY000000<0USA8201018F301231<<<<<<<<<<<<<<04"

        parsed = parse_mrz_lines(line1, line2)
        check_digits = parsed["check_digits"]
        confidence = calculate_passport_confidence(
            has_mrz=True,
            lines_valid=True,
            check_digits=check_digits,
            image_quality={"quality_ok": False, "warnings": ["LOW_IMAGE_SHARPNESS"]},
            warnings=["LOW_IMAGE_SHARPNESS"],
            repair_used=False,
            visual_used=True,
        )
        assert confidence < 0.90
        level = get_confidence_level(confidence)
        assert level in ("MEDIUM", "LOW")
        status = determine_status(confidence, [])
        assert status == "NEED_REVIEW"

    def test_pipeline_id_card_confidence(self) -> None:
        confidence = calculate_id_card_confidence(
            qr_found=True,
            ocr_fields_found=True,
            layout_recognized=True,
            date_valid=True,
            number_valid=True,
            image_quality={"quality_ok": True},
            warnings=[],
            qr_conflict=False,
        )
        assert confidence >= 0.90
        assert get_confidence_level(confidence) == "HIGH"

    def test_normalize_pipeline_e2e(self) -> None:
        assert normalize_name("  JOHN<<SMITH<") == "JOHN SMITH"
        assert normalize_name("") == ""
        assert normalize_gender("M") == "M"
        assert normalize_gender("FEMALE") == "F"
        assert normalize_gender("") == "UNKNOWN"
        assert normalize_gender("<") == "UNKNOWN"
        assert normalize_date("01011975") == "1975-01-01"
        assert normalize_date("19750101") == "1975-01-01"
        assert normalize_date("") == ""
        assert normalize_date("01/01/1975") == "1975-01-01"
        assert normalize_country("VNM") == "VNM"
        assert normalize_country("VN") == "VNM"
        assert normalize_country("US") == "USA"
        assert normalize_country("") == ""
        assert normalize_passport_number("AB123456<") == "AB123456"
        assert normalize_passport_number("") == ""
        assert normalize_id_number("ID123456 ") == "ID123456"

    def test_mrz_validator_edge_cases(self) -> None:
        assert char_value("0") == 0
        assert char_value("5") == 5
        assert char_value("A") == 10
        assert char_value("Z") == 35
        assert char_value("<") == 0

        import pytest

        with pytest.raises(ValueError):
            char_value("!")

        assert compute_check_digit("AB123456<") == "4"
        assert compute_check_digit("750101") == "2"
        assert validate_check_digit("750101", "2") is True
        assert validate_check_digit("750101", "8") is False
        assert validate_check_digit("750101", "<") is True

    def test_full_mrz_validation(self) -> None:
        result = validate_full_mrz(VALID_LINE1, VALID_LINE2)
        assert result["overall_valid"] is True
        assert len(result["errors"]) == 0
        assert result["passport_number_valid"] is True
        assert result["date_of_birth_valid"] is True
        assert result["expiry_date_valid"] is True
        assert result["final_composite_valid"] is True

    def test_mrz_validation_with_errors(self) -> None:
        result = validate_full_mrz(VALID_LINE1, VALID_LINE2[:10])
        assert result["overall_valid"] is False
        assert "LINE2_TOO_SHORT" in result["errors"]

    def test_repair_unchanged_valid_field(self) -> None:
        repaired, changed, warn = try_repair_field("750101", "2", "DOB")
        assert changed is False
        assert repaired == "750101"
        assert warn == ""

    def test_repair_fix_invalid_field(self) -> None:
        repaired, changed, warn = try_repair_field("75010I", "2", "DOB")
        if changed:
            assert "DOB_REPAIRED" in warn

    def test_confidence_score_bounds(self) -> None:
        score = calculate_passport_confidence(
            has_mrz=False,
            lines_valid=False,
            check_digits={},
            image_quality={"quality_ok": False},
            warnings=["MRZ_NOT_FOUND", "LOW_IMAGE_SHARPNESS"],
            repair_used=False,
            visual_used=True,
        )
        assert 0.0 <= score <= 1.0

    def test_determine_status_failed(self) -> None:
        assert determine_status(0.0, [], has_fatal_error=True) == "FAILED"

    def test_confidence_levels(self) -> None:
        assert get_confidence_level(0.95) == "HIGH"
        assert get_confidence_level(0.80) == "MEDIUM"
        assert get_confidence_level(0.50) == "LOW"
