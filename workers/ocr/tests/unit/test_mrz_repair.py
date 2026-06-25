"""Tests for safe MRZ repair."""

from guestfill_ocr.passport.mrz_repair import try_repair_field, try_repair_mrz


class TestTryRepairField:
    def test_no_repair_needed(self) -> None:
        from guestfill_ocr.passport.mrz_validator import compute_check_digit

        value = "12345678"
        digit = compute_check_digit(value)
        result, changed, warning = try_repair_field(value, digit, "TEST")
        assert changed is False
        assert warning == ""

    def test_repair_o_to_zero(self) -> None:
        from guestfill_ocr.passport.mrz_validator import compute_check_digit

        value = "12345678"
        digit = compute_check_digit(value)
        broken = value.replace("8", "B")
        result, changed, warning = try_repair_field(broken, digit, "TEST")
        assert changed is True
        assert "REPAIRED" in warning


class TestTryRepairMrz:
    def test_reasonable_mrz(self) -> None:
        line1 = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
        line2 = "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"
        repaired, warnings = try_repair_mrz(line1, line2)
        assert isinstance(repaired, list)
        assert len(repaired) == 2
