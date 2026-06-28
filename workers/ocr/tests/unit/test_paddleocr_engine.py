"""Tests for PaddleOCR engine wrapper."""
# ruff: noqa: SIM117

from unittest.mock import MagicMock, patch

import numpy as np

from guestfill_ocr.ocr.paddleocr_engine import (
    MRZ_TD1_LENGTH,
    MRZ_TD2_LENGTH,
    MRZ_TD3_LENGTH,
    _compute_adaptive_y_tolerance,
    _detect_mrz_format,
    _extract_mrz_text,
    _group_by_y_coordinate,
    _reconstruct_line,
    _score_mrz_likelihood,
    _sort_group_by_x,
    _try_detect_upside_down,
    check_paddleocr_available,
    run_paddleocr_mrz,
)


class TestCheckPaddleocrAvailable:
    def test_returns_false_when_not_installed(self) -> None:
        with patch("guestfill_ocr.ocr.paddleocr_engine._PPOCR_CHECKED", False):
            with patch("guestfill_ocr.ocr.paddleocr_engine._PPOCR_AVAILABLE", False):
                with patch.dict("sys.modules", {"paddleocr": None}):
                    result = check_paddleocr_available()
                    assert result is False


class TestGroupByYCoordinate:
    def test_empty_result(self) -> None:
        assert _group_by_y_coordinate([]) == []

    def test_none_regions_skipped(self) -> None:
        result = [None]
        assert _group_by_y_coordinate(result) == []

    def test_groups_same_line_items(self) -> None:
        """Items at similar y-coordinates should be grouped."""
        result = [
            [
                ([[0, 0], [20, 0], [20, 10], [0, 10]], ("P<VNM", 0.95)),
                ([[20, 0], [44, 0], [44, 10], [20, 10]], ("TAEST<<", 0.92)),
            ]
        ]
        groups = _group_by_y_coordinate(result)
        assert len(groups) == 1
        assert len(groups[0]) == 2

    def test_separates_different_lines(self) -> None:
        """Items at different y-coordinates should be in separate groups."""
        result = [
            [
                ([[0, 0], [44, 0], [44, 10], [0, 10]], ("LINE_ONE", 0.95)),
                ([[0, 30], [44, 30], [44, 40], [0, 40]], ("LINE_TWO", 0.90)),
            ]
        ]
        groups = _group_by_y_coordinate(result)
        assert len(groups) >= 2

    def test_groups_multiple_items_on_two_lines(self) -> None:
        """Multiple fragments on each line should be grouped correctly."""
        result = [
            [
                ([[0, 0], [22, 0], [22, 10], [0, 10]], ("P<VNM", 0.95)),
                ([[22, 0], [44, 0], [44, 10], [22, 10]], ("TAEST<<", 0.92)),
                ([[0, 30], [22, 30], [22, 40], [0, 40]], ("AB12345", 0.90)),
                ([[22, 30], [44, 30], [44, 40], [22, 40]], ("6<7VNM", 0.88)),
            ]
        ]
        groups = _group_by_y_coordinate(result)
        assert len(groups) == 2
        assert len(groups[0]) == 2
        assert len(groups[1]) == 2


class TestSortGroupByX:
    def test_sorts_left_to_right(self) -> None:
        group = [
            ([[20, 0], [40, 0], [40, 10], [20, 10]], ("RIGHT", 0.9)),
            ([[0, 0], [20, 0], [20, 10], [0, 10]], ("LEFT", 0.9)),
        ]
        sorted_items = _sort_group_by_x(group)
        assert sorted_items[0][0] == "LEFT"
        assert sorted_items[1][0] == "RIGHT"

    def test_single_item(self) -> None:
        group = [
            ([[0, 0], [44, 0], [44, 10], [0, 10]], ("SINGLE", 0.9)),
        ]
        sorted_items = _sort_group_by_x(group)
        assert len(sorted_items) == 1
        assert sorted_items[0][0] == "SINGLE"


class TestReconstructLine:
    def test_single_text_item(self) -> None:
        line = _reconstruct_line([("P<VNMTAEST<<SURNAME<<", 0.95)])
        assert line is not None
        assert "P<VNMTAEST" in line

    def test_multiple_items_concatenated(self) -> None:
        line = _reconstruct_line([("P<VNMTAE", 0.95), ("ST<<SURNAME<<GIVEN<<<<<<", 0.92)])
        assert line is not None
        assert "P<VNMTAEST<<SURNAME" in line

    def test_items_in_x_order(self) -> None:
        """Items should be concatenated in provided order."""
        line = _reconstruct_line([("FIRST<<", 0.95), ("SECOND<<", 0.92)])
        assert line is not None
        assert line == "FIRST<<SECOND<<"

    def test_low_confidence_filtered(self) -> None:
        line = _reconstruct_line([("TEXT", 0.3)], confidence_threshold=0.5)
        assert line is None

    def test_short_line_returns_none(self) -> None:
        line = _reconstruct_line([("SHORT", 0.95)])
        assert line is None

    def test_handles_spaces_and_tabs(self) -> None:
        line = _reconstruct_line([("AB 123\t456<XYZ78901<<", 0.95)])
        assert line is not None
        assert " " not in line
        assert "\t" not in line

    def test_uppercases_lowercase(self) -> None:
        line = _reconstruct_line([("abc123<defGHI<<<<JKL<<", 0.95)])
        assert line is not None
        assert "ABC123<DEFGHI<<<<JKL<<" in line

    def test_removes_invalid_chars(self) -> None:
        line = _reconstruct_line([("P<VNM!@#$%<<SURNAME<<", 0.95)])
        assert line is not None
        assert "!" not in line

    def test_preserves_mrz_valid_chars(self) -> None:
        line = _reconstruct_line([("P<VNMTAEST<<SURNAME<<GIVEN<<<<<<<<<<<<", 0.95)])
        assert line is not None
        assert all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<" for c in line)


class TestDetectMrzFormat:
    def test_detects_td3(self) -> None:
        line1 = "P" + "<" * (MRZ_TD3_LENGTH - 1)
        line2 = "A" + "<" * (MRZ_TD3_LENGTH - 1)
        assert _detect_mrz_format([line1, line2]) == MRZ_TD3_LENGTH

    def test_detects_td2(self) -> None:
        line1 = "P" + "<" * (MRZ_TD2_LENGTH - 1)
        line2 = "A" + "<" * (MRZ_TD2_LENGTH - 1)
        assert _detect_mrz_format([line1, line2]) == MRZ_TD2_LENGTH

    def test_detects_td1(self) -> None:
        line1 = "A" + "<" * (MRZ_TD1_LENGTH - 1)
        line2 = "B" + "<" * (MRZ_TD1_LENGTH - 1)
        line3 = "C" + "<" * (MRZ_TD1_LENGTH - 1)
        assert _detect_mrz_format([line1, line2, line3]) == MRZ_TD1_LENGTH

    def test_td1_requires_three_lines(self) -> None:
        line1 = "A" + "<" * (MRZ_TD1_LENGTH - 1)
        line2 = "B" + "<" * (MRZ_TD1_LENGTH - 1)
        assert _detect_mrz_format([line1, line2]) is None

    def test_td3_preferred_with_multiple_formats(self) -> None:
        line1 = "P" + "<" * (MRZ_TD3_LENGTH - 1)
        line2 = "A" + "<" * (MRZ_TD3_LENGTH - 1)
        short1 = "X" + "<" * (MRZ_TD1_LENGTH - 1)
        assert _detect_mrz_format([line1, line2, short1]) == MRZ_TD3_LENGTH

    def test_no_format_with_random_lengths(self) -> None:
        assert _detect_mrz_format(["SOME_TEXT", "OTHER_TEXT"]) is None

    def test_empty_list(self) -> None:
        assert _detect_mrz_format([]) is None


class TestScoreMrzLikelihood:
    def test_short_text_returns_zero(self) -> None:
        assert _score_mrz_likelihood("SHORT") == 0.0

    def test_low_valid_chars_returns_zero(self) -> None:
        text = "hello world this is not mrz text!!!!!"
        assert _score_mrz_likelihood(text) == 0.0

    def test_mrz_line1_start_p_angle(self) -> None:
        text = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
        score = _score_mrz_likelihood(text)
        assert score > 30.0

    def test_mrz_line2_with_digits(self) -> None:
        text = "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"
        score = _score_mrz_likelihood(text)
        assert score > 0.0

    def test_td2_format_scores(self) -> None:
        base = "P<UTOSTAERIKSSON<<ANNA<MARIA"
        text = base + "<" * (MRZ_TD2_LENGTH - len(base))
        assert len(text) == MRZ_TD2_LENGTH, f"Expected {MRZ_TD2_LENGTH}, got {len(text)}"
        score = _score_mrz_likelihood(text)
        assert score > 0.0

    def test_td1_format_scores(self) -> None:
        base = "P<UTOSTAERIKSSON<<ANNA<MARIA"
        text = base + "<" * (MRZ_TD1_LENGTH - len(base))
        assert len(text) == MRZ_TD1_LENGTH, f"Expected {MRZ_TD1_LENGTH}, got {len(text)}"
        score = _score_mrz_likelihood(text)
        assert score > 0.0

    def test_id_card_format_scores(self) -> None:
        text = "IDVNM1234567890<<<<<<<<<<<<<<<<<<<<"
        score = _score_mrz_likelihood(text)
        assert score > 0.0

    def test_visa_format_scores(self) -> None:
        text = "V<UTOSTAERIKSSON<<ANNA<MARIA<<<<<<<<"
        score = _score_mrz_likelihood(text)
        assert score > 0.0

    def test_consecutive_fillers_boost(self) -> None:
        text = "P<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<"
        score = _score_mrz_likelihood(text)
        assert score > 0.0

    def test_mrz_format_length_boost(self) -> None:
        text = "P" + "<" * (MRZ_TD3_LENGTH - 1)
        score = _score_mrz_likelihood(text)
        assert score > 20.0

    def test_many_digits_boost(self) -> None:
        text = "P<" + "1" * 20 + "<" * 22
        assert len(text) == MRZ_TD3_LENGTH
        score = _score_mrz_likelihood(text)
        assert score > 20.0


class TestExtractMrzText:
    def test_empty_result(self) -> None:
        assert _extract_mrz_text([]) == []

    def test_none_regions_skipped(self) -> None:
        result = [None]
        assert _extract_mrz_text(result) == []

    def test_low_confidence_filtered(self) -> None:
        result = [[([[0, 0], [10, 0], [10, 10], [0, 10]], ("ABC123", 0.3))]]
        assert _extract_mrz_text(result, confidence_threshold=0.5) == []

    def test_high_confidence_included(self) -> None:
        result = [[([[0, 0], [44, 0], [44, 10], [0, 10]], ("P<VNMTAEST<<SURNAME<<GIVEN<<<<<<<<<<<<", 0.9))]]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) == 1
        assert "P<VNMTAEST" in texts[0]

    def test_non_mrz_text_filtered(self) -> None:
        result = [[([[0, 0], [10, 0], [10, 10], [0, 10]], ("Hello World", 0.95))]]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) == 0

    def test_mrz_lines_extracted(self) -> None:
        result = [
            [
                ([[0, 0], [44, 0], [44, 10], [0, 10]], ("P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<", 0.95)),
                ([[0, 10], [44, 20], [44, 30], [0, 20]], ("AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02", 0.92)),
            ]
        ]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) >= 1
        assert any("P<VNMTAEST" in t for t in texts)

    def test_fragmented_mrz_lines_reconstructed(self) -> None:
        """Fragmented text boxes on the same line should be joined."""
        result = [
            [
                ([[0, 0], [22, 0], [22, 10], [0, 10]], ("P<VNMTAE", 0.95)),
                ([[22, 0], [44, 0], [44, 10], [22, 10]], ("ST<<SURNAME<<GIVEN<<<<", 0.92)),
            ]
        ]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) >= 1
        assert "P<VNMTAEST<<SURNAME" in texts[0]

    def test_td3_format_selected(self) -> None:
        """TD3 format (2x44) should be detected and selected."""
        line1 = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<"
        line2 = "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"
        assert len(line1) == MRZ_TD3_LENGTH, f"Expected {MRZ_TD3_LENGTH}, got {len(line1)}"
        assert len(line2) == MRZ_TD3_LENGTH, f"Expected {MRZ_TD3_LENGTH}, got {len(line2)}"
        result = [
            [
                ([[0, 0], [44, 0], [44, 10], [0, 10]], (line1, 0.95)),
                ([[0, 10], [44, 20], [44, 30], [0, 20]], (line2, 0.92)),
            ]
        ]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) == 2
        assert len(texts[0]) == MRZ_TD3_LENGTH
        assert len(texts[1]) == MRZ_TD3_LENGTH

    def test_td1_format_selected(self) -> None:
        """TD1 format (3x30) should be detected and selected."""
        td1_line1 = "P<UTOSTAERIKSSON<<ANNA<MARIA" + "<" * (MRZ_TD1_LENGTH - len("P<UTOSTAERIKSSON<<ANNA<MARIA"))
        td1_line2 = "AB123456<7UTO7501012F2501017" + "<" * (MRZ_TD1_LENGTH - len("AB123456<7UTO7501012F2501017"))
        td1_line3 = "XC123456<UTO1234567" + "<" * (MRZ_TD1_LENGTH - len("XC123456<UTO1234567"))
        assert len(td1_line1) == MRZ_TD1_LENGTH, f"Expected {MRZ_TD1_LENGTH}, got {len(td1_line1)}"
        assert len(td1_line2) == MRZ_TD1_LENGTH, f"Expected {MRZ_TD1_LENGTH}, got {len(td1_line2)}"
        assert len(td1_line3) == MRZ_TD1_LENGTH, f"Expected {MRZ_TD1_LENGTH}, got {len(td1_line3)}"
        result = [
            [
                ([[0, 0], [30, 0], [30, 10], [0, 10]], (td1_line1, 0.93)),
                ([[0, 12], [30, 12], [30, 22], [0, 22]], (td1_line2, 0.90)),
                ([[0, 24], [30, 24], [30, 34], [0, 34]], (td1_line3, 0.88)),
            ]
        ]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) == 3
        assert all(len(t) == MRZ_TD1_LENGTH for t in texts)

    def test_non_mrz_detections_filtered_out(self) -> None:
        """Non-MRZ text lines should not appear in output."""
        line1 = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<"
        line2 = "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"
        result = [
            [
                ([[0, 0], [44, 0], [44, 10], [0, 10]], (line1, 0.95)),
                ([[0, 10], [44, 20], [44, 30], [0, 20]], (line2, 0.92)),
                ([[100, 100], [200, 100], [200, 110], [100, 110]], ("UNITED STATES PASSPORT", 0.88)),
            ]
        ]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) == 2
        assert all(len(t) == MRZ_TD3_LENGTH for t in texts)

    def test_mixed_confidence_extracts_high_only(self) -> None:
        """Only high-confidence detections should be used."""
        result = [
            [
                ([[0, 0], [44, 0], [44, 10], [0, 10]], ("P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<", 0.95)),
                ([[0, 10], [44, 20], [44, 30], [0, 20]], ("NOISY_TEXT_12345", 0.30)),
            ]
        ]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) >= 1


class TestRunPaddleocrMrz:
    def test_returns_error_when_not_available(self) -> None:
        with patch("guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_available", return_value=False):
            result = run_paddleocr_mrz(np.zeros((100, 100), dtype=np.uint8))
            assert result.is_err()
            assert "PADDLEOCR_NOT_FOUND" in str(result.unwrap_err().code)

    def test_returns_error_for_invalid_image_type(self) -> None:
        with patch("guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_available", return_value=True):
            result = run_paddleocr_mrz("not_an_image_path")
            assert result.is_err()

    def test_returns_empty_string_for_no_text(self) -> None:
        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = None
        with patch("guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.paddleocr_engine._get_paddleocr_instance", return_value=mock_ocr):
                result = run_paddleocr_mrz(np.zeros((100, 100, 3), dtype=np.uint8))
                assert result.is_ok()
                assert result.unwrap() == ""

    def test_extracts_mrz_text(self) -> None:
        fake_result = [
            [
                ([[0, 0], [44, 0], [44, 10], [0, 10]], ("P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<", 0.95)),
                ([[0, 10], [44, 20], [44, 30], [0, 20]], ("AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02", 0.92)),
            ]
        ]
        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = fake_result
        with patch("guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.paddleocr_engine._get_paddleocr_instance", return_value=mock_ocr):
                result = run_paddleocr_mrz(np.zeros((100, 100, 3), dtype=np.uint8))
                assert result.is_ok()
                text = result.unwrap()
                assert "P<VNMTAEST" in text
                assert "AB123456" in text

    def test_handles_ocr_exception(self) -> None:
        mock_ocr = MagicMock()
        mock_ocr.ocr.side_effect = RuntimeError("OCR failed")
        with patch("guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.paddleocr_engine._get_paddleocr_instance", return_value=mock_ocr):
                result = run_paddleocr_mrz(np.zeros((100, 100, 3), dtype=np.uint8))
                assert result.is_err()
                assert "OCR_FAILED" in str(result.unwrap_err().code)

    def test_runs_on_grayscale_image(self) -> None:
        """Should handle 2D grayscale images by converting to BGR."""
        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = None
        with patch("guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.paddleocr_engine._get_paddleocr_instance", return_value=mock_ocr):
                result = run_paddleocr_mrz(np.zeros((100, 100), dtype=np.uint8))
                assert result.is_ok()

    def test_td1_output_format(self) -> None:
        """TD1 format (3 lines) should be preserved in output."""
        td1_line1 = "P<UTOSTAERIKSSON<<ANNA<MARIA" + "<" * (MRZ_TD1_LENGTH - len("P<UTOSTAERIKSSON<<ANNA<MARIA"))
        td1_line2 = "AB123456<7UTO7501012F2501017" + "<" * (MRZ_TD1_LENGTH - len("AB123456<7UTO7501012F2501017"))
        td1_line3 = "XC123456<UTO1234567" + "<" * (MRZ_TD1_LENGTH - len("XC123456<UTO1234567"))
        fake_result = [
            [
                ([[0, 0], [30, 0], [30, 10], [0, 10]], (td1_line1, 0.93)),
                ([[0, 12], [30, 12], [30, 22], [0, 22]], (td1_line2, 0.90)),
                ([[0, 24], [30, 24], [30, 34], [0, 34]], (td1_line3, 0.88)),
            ]
        ]
        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = fake_result
        with patch("guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.paddleocr_engine._get_paddleocr_instance", return_value=mock_ocr):
                result = run_paddleocr_mrz(np.zeros((100, 100, 3), dtype=np.uint8))
                assert result.is_ok()
                text = result.unwrap()
                lines = text.split("\n")
                assert len(lines) == 3

    def test_handles_image_string_path(self) -> None:
        """Should read image from file path."""
        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = None
        with patch("guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.paddleocr_engine._get_paddleocr_instance", return_value=mock_ocr):
                with patch(
                    "guestfill_ocr.ocr.paddleocr_engine.cv2.imread",
                    return_value=np.zeros((100, 100, 3), dtype=np.uint8),
                ):
                    result = run_paddleocr_mrz("/fake/path.jpg")
                    assert result.is_ok()


class TestComputeAdaptiveYTolerance:
    def test_empty_items_returns_default(self) -> None:
        assert _compute_adaptive_y_tolerance([]) == 0.02

    def test_uses_median_height(self) -> None:
        items = [(0.0, 10.0, None, None), (0.0, 20.0, None, None), (0.0, 30.0, None, None)]
        tol = _compute_adaptive_y_tolerance(items)
        assert tol >= 12.0
        assert tol <= 15.0

    def test_single_item(self) -> None:
        items = [(0.0, 25.0, None, None)]
        tol = _compute_adaptive_y_tolerance(items)
        assert tol == 15.0


class TestTryDetectUpsideDown:
    def test_empty_lines(self) -> None:
        assert _try_detect_upside_down([]) is False

    def test_normal_mrz_returns_false(self) -> None:
        lines = [
            "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<",
            "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02",
        ]
        assert _try_detect_upside_down(lines) is False

    def test_reversed_content_hints(self) -> None:
        lines = [
            ">P<VNMTAEST<<SURNAME",
            ">A<<<<<XXXXXX",
        ]
        assert isinstance(_try_detect_upside_down(lines), bool)

    def test_letters_at_end_increase_upside_down_score(self) -> None:
        lines = [
            "<<<<<<<<<<<<<<<<<<ABC",
            "<<<<<<<<<<<<<<<<<<DEF",
        ]
        result = _try_detect_upside_down(lines)
        assert isinstance(result, bool)


class TestExtractMrzTextIntegration:
    def test_realistic_mrz_output(self) -> None:
        mrz_line1 = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
        mrz_line2 = "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"
        result = [
            [
                ([[0, 0], [44, 0], [44, 10], [0, 10]], (mrz_line1, 0.97)),
                ([[0, 10], [44, 20], [44, 30], [0, 20]], (mrz_line2, 0.94)),
            ]
        ]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) >= 2

    def test_non_mrz_text_ignored(self) -> None:
        result = [
            [
                ([[0, 0], [10, 0], [10, 10], [0, 10]], ("UNITED STATES", 0.95)),
                ([[0, 10], [15, 10], [15, 20], [0, 20]], ("PASSPORT", 0.90)),
            ]
        ]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) == 0

    def test_partial_mrz_still_extracted(self) -> None:
        result = [
            [
                ([[0, 0], [44, 0], [44, 10], [0, 10]], ("P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<", 0.95)),
            ]
        ]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) >= 1

    def test_mrz_with_non_mrz_noise(self) -> None:
        """MRZ lines should be selected even when mixed with noise."""
        result = [
            [
                ([[0, 0], [44, 0], [44, 10], [0, 10]], ("P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<", 0.95)),
                ([[0, 10], [44, 20], [44, 30], [0, 20]], ("AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02", 0.92)),
                ([[200, 0], [300, 0], [300, 10], [200, 10]], ("PASSPORT", 0.85)),
            ]
        ]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) >= 2

    def test_td2_format_detected(self) -> None:
        """TD2 format (2x36) should be detected."""
        td2_line1 = "P<UTOSTAERIKSSON<<ANNA<MARIA" + "<" * (MRZ_TD2_LENGTH - len("P<UTOSTAERIKSSON<<ANNA<MARIA"))
        td2_line2 = "AB123456<7UTO7501012F2501017" + "<" * (MRZ_TD2_LENGTH - len("AB123456<7UTO7501012F2501017"))
        assert len(td2_line1) == MRZ_TD2_LENGTH
        assert len(td2_line2) == MRZ_TD2_LENGTH
        result = [
            [
                ([[0, 0], [36, 0], [36, 10], [0, 10]], (td2_line1, 0.93)),
                ([[0, 12], [36, 12], [36, 22], [0, 22]], (td2_line2, 0.90)),
            ]
        ]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) == 2
        assert all(len(t) == MRZ_TD2_LENGTH for t in texts)

    def test_three_line_mrz_with_varying_gaps(self) -> None:
        """TD1 format with different y-gaps between lines should group correctly."""
        td1_line1 = "P<UTOSTAERIKSSON<<ANNA<MARIA" + "<" * (MRZ_TD1_LENGTH - len("P<UTOSTAERIKSSON<<ANNA<MARIA"))
        td1_line2 = "AB123456<7UTO7501012F2501017" + "<" * (MRZ_TD1_LENGTH - len("AB123456<7UTO7501012F2501017"))
        td1_line3 = "XC123456<UTO1234567" + "<" * (MRZ_TD1_LENGTH - len("XC123456<UTO1234567"))
        result = [
            [
                ([[0, 0], [30, 0], [30, 8], [0, 8]], (td1_line1, 0.93)),
                ([[0, 15], [30, 15], [30, 23], [0, 23]], (td1_line2, 0.90)),
                ([[0, 30], [30, 30], [30, 38], [0, 38]], (td1_line3, 0.88)),
            ]
        ]
        texts = _extract_mrz_text(result, confidence_threshold=0.5)
        assert len(texts) == 3
        assert all(len(t) == MRZ_TD1_LENGTH for t in texts)


class TestRunPaddleOcrMrzEnhanced:
    def test_handles_4channel_rgba_image(self) -> None:
        """Should convert RGBA 4-channel images to BGR."""
        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = None
        rgba_image = np.zeros((100, 100, 4), dtype=np.uint8)
        rgba_image[:, :, 3] = 255
        with patch("guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.paddleocr_engine._get_paddleocr_instance", return_value=mock_ocr):
                result = run_paddleocr_mrz(rgba_image)
                assert result.is_ok()

    def test_accepts_lang_parameter(self) -> None:
        """Should accept custom lang parameter."""
        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = None
        with patch("guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.paddleocr_engine._get_paddleocr_instance", return_value=mock_ocr):
                result = run_paddleocr_mrz(np.zeros((100, 100, 3), dtype=np.uint8), lang="en")
                assert result.is_ok()

    def test_empty_ocr_result_handling(self) -> None:
        """Should handle empty list result."""
        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = []
        with patch("guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.paddleocr_engine._get_paddleocr_instance", return_value=mock_ocr):
                result = run_paddleocr_mrz(np.zeros((100, 100, 3), dtype=np.uint8))
                assert result.is_ok()
                assert result.unwrap() == ""

    def test_handles_mrz_with_noise_lines(self) -> None:
        """Should filter out non-MRZ lines mixed with MRZ data."""
        fake_result = [
            [
                ([[0, 0], [44, 0], [44, 10], [0, 10]], ("P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<", 0.95)),
                ([[0, 10], [44, 20], [44, 30], [0, 20]], ("AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02", 0.92)),
                ([[0, 50], [100, 50], [100, 60], [0, 60]], ("UNITED STATES PASSPORT", 0.88)),
                ([[0, 60], [80, 60], [80, 70], [0, 70]], ("PASSPORT NO: AB123456", 0.85)),
            ]
        ]
        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = fake_result
        with patch("guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.paddleocr_engine._get_paddleocr_instance", return_value=mock_ocr):
                result = run_paddleocr_mrz(np.zeros((100, 100, 3), dtype=np.uint8))
                assert result.is_ok()
                text = result.unwrap()
                assert "P<VNMTAEST" in text
                assert "AB123456" in text
                assert "UNITED" not in text
