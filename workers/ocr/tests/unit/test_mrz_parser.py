"""Tests for MRZ line parser."""

from guestfill_ocr.passport.mrz_parser import parse_mrz_lines


class TestParseMrzLines:
    def test_valid_mrz(self) -> None:
        line1 = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
        line2 = "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"
        result = parse_mrz_lines(line1, line2)
        assert result["document_type"] == "PASSPORT"
        assert result["issuing_country"] == "VNM"
        assert "SURNAME" in result["full_name"]
        assert "GIVEN" in result["full_name"]

    def test_short_lines(self) -> None:
        result = parse_mrz_lines("SHORT", "ALSO_SHORT")
        assert result["document_type"] == "PASSPORT"
        assert result["full_name"] == ""
        assert result["passport_number"] == ""

    def test_empty_lines(self) -> None:
        result = parse_mrz_lines("", "")
        assert result["document_type"] == "PASSPORT"
        assert result["full_name"] == ""
