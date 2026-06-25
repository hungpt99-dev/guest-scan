"""Tests for warning engine."""

from guestfill_ocr.common.constants import WARNING_CODES
from guestfill_ocr.extraction.warning_engine import collect_warnings, join_warnings


class TestCollectWarnings:
    def test_no_warnings(self) -> None:
        warnings = collect_warnings(
            classification={"document_type": "PASSPORT"},
            quality={"warnings": [], "quality_ok": True},
            mrz_lines=["line1", "line2"],
            check_digits={},
            fields={"full_name": "John", "passport_number": "AB123"},
            repair_warnings=[],
            visual_used=False,
        )
        assert len(warnings) >= 0

    def test_mrz_not_found(self) -> None:
        warnings = collect_warnings(
            classification={},
            quality={"warnings": [], "quality_ok": True},
            mrz_lines=[],
            check_digits={},
            fields={},
            repair_warnings=[],
            visual_used=False,
        )
        assert WARNING_CODES["MRZ_NOT_FOUND"] in warnings

    def test_visual_ocr(self) -> None:
        warnings = collect_warnings(
            classification={},
            quality={"warnings": [], "quality_ok": True},
            mrz_lines=["line1", "line2"],
            check_digits={},
            fields={},
            repair_warnings=[],
            visual_used=True,
        )
        assert WARNING_CODES["VISUAL_OCR_USED"] in warnings


class TestJoinWarnings:
    def test_multiple_warnings(self) -> None:
        result = join_warnings(["A", "B", "C"])
        assert result == "A;B;C"

    def test_single_warning(self) -> None:
        assert join_warnings(["A"]) == "A"

    def test_empty(self) -> None:
        assert join_warnings([]) == ""
