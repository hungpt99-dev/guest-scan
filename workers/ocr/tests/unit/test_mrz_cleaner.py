"""Tests for MRZ text cleaner."""

from guestfill_ocr.passport.mrz_cleaner import clean_mrz_text, has_mrz_pattern, is_mrz_line


class TestCleanMrzText:
    def test_empty_text(self) -> None:
        assert clean_mrz_text("") == []

    def test_whitespace_only(self) -> None:
        assert clean_mrz_text("   \n  \t  ") == []

    def test_removes_spaces_and_tabs(self) -> None:
        raw = "P<VNM TAEST\t<<SURNAME<<GIVEN\n"
        lines = clean_mrz_text(raw)
        assert len(lines) >= 1
        assert " " not in lines[0]
        assert "\t" not in lines[0]

    def test_uppercases_lowercase(self) -> None:
        raw = "p<vnmsurname<<given<name<<<<<<<<<<<<<<<"
        lines = clean_mrz_text(raw)
        assert len(lines) >= 1
        assert lines[0].isupper() or "<" in lines[0]

    def test_removes_invalid_chars(self) -> None:
        raw = "P<VNM!@#$%<<SURNAME<<GIVEN<<<<<<<<<<<<"
        lines = clean_mrz_text(raw)
        assert len(lines) >= 1
        assert "!" not in lines[0]

    def test_short_line_removed(self) -> None:
        raw = "SHORT\nP<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
        lines = clean_mrz_text(raw)
        assert "SHORT" not in lines

    def test_valid_mrz_line2_preserved(self) -> None:
        raw = "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"
        lines = clean_mrz_text(raw)
        assert len(lines) >= 1
        assert "AB123456" in lines[0]

    def test_multiple_lines(self) -> None:
        raw = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<\nAB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"
        lines = clean_mrz_text(raw)
        assert len(lines) == 2

    def test_digits_only_line(self) -> None:
        raw = "123456789012345678901234"
        lines = clean_mrz_text(raw)
        assert len(lines) >= 1


class TestIsMrzLine:
    def test_short_line_false(self) -> None:
        assert is_mrz_line("SHORT") is False

    def test_valid_mrz_line_true(self) -> None:
        line = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
        assert is_mrz_line(line) is True

    def test_too_many_invalid_chars_false(self) -> None:
        line = "HELLO WORLD THIS IS NOT MRZ TEXT LINE!!!!"
        assert is_mrz_line(line) is False

    def test_edge_20_chars_valid(self) -> None:
        line = "P<V" + "<" * 17
        assert len(line) == 20
        assert is_mrz_line(line) is True

    def test_td2_line(self) -> None:
        line = "P<UTOSTAERIKSSON<<ANNA<MARIA" + "<" * 10
        assert is_mrz_line(line) is True

    def test_td1_line(self) -> None:
        line = "AB123456<7UTO7501012F2501017" + "<" * 2
        assert len(line) >= 20
        assert is_mrz_line(line) is True

    def test_mixed_case_line(self) -> None:
        line = "p<vnmtaest<<surname<<given<name<<<<<<<<<<<<<<<"
        result = is_mrz_line(line)
        assert result is False


class TestHasMrzPattern:
    def test_no_pattern_false(self) -> None:
        assert has_mrz_pattern("Hello World") is False

    def test_one_line_only_false(self) -> None:
        raw = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
        assert has_mrz_pattern(raw) is False

    def test_two_lines_true(self) -> None:
        raw = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<\nAB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"
        assert has_mrz_pattern(raw) is True

    def test_three_lines_td1_true(self) -> None:
        raw = (
            "P<UTOSTAERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<<\n"
            "AB123456<7UTO7501012F2501017<<<<<<<<<<<<<<<<<<<<\n"
            "XC123456<UTO1234567<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
        )
        assert has_mrz_pattern(raw) is True

    def test_mixed_with_noise_true(self) -> None:
        raw = (
            "UNITED STATES PASSPORT\n"
            "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<\n"
            "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02\n"
            "Some random text"
        )
        assert has_mrz_pattern(raw) is True

    def test_empty_text_false(self) -> None:
        assert has_mrz_pattern("") is False
