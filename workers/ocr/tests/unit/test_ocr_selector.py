"""Tests for OCR candidate selection with engine fallback."""
# ruff: noqa: SIM117

from unittest.mock import MagicMock, patch

from guestfill_ocr.ocr.ocr_candidate import OcrCandidate
from guestfill_ocr.ocr.ocr_selector import (
    get_select_best_candidate_engine,
    score_candidate,
    select_best_candidate_with_engine,
)


def _make_candidate(text: str = "", psm: int = 6) -> OcrCandidate:
    candidate = OcrCandidate(
        image=MagicMock(),
        psm=psm,
        preprocessing="grayscale",
        crop_source="bottom_25",
    )
    candidate.raw_text = text
    return candidate


class TestScoreCandidate:
    def test_no_lines_negative_score(self) -> None:
        candidate = _make_candidate()
        score = score_candidate(candidate, None, None)
        assert score < 0

    def test_perfect_mrz_scores_high(self) -> None:
        line1 = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
        line2 = "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"
        candidate = _make_candidate()
        candidate.cleaned_lines = [line1, line2]
        score = score_candidate(candidate, line1, line2)
        assert score > 100

    def test_no_line2_penalty(self) -> None:
        line1 = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
        candidate = _make_candidate()
        candidate.cleaned_lines = [line1]
        score = score_candidate(candidate, line1, None)
        assert score < 0

    def test_invalid_chars_penalty(self) -> None:
        candidate = _make_candidate()
        candidate.cleaned_lines = ["P<INVALID!!!CHARS@@@HERE<<<<<<<"]
        score = score_candidate(candidate, candidate.cleaned_lines[0], None)
        assert score < 0


class TestSelectBestCandidateWithEngine:
    def test_no_candidates_returns_none(self) -> None:
        best, warnings, engine = select_best_candidate_with_engine([], prefer_paddleocr=False)
        assert best is None
        assert "MRZ_NOT_FOUND" in warnings
        assert engine == "tesseract"

    def test_falls_back_to_tesseract_when_paddle_unavailable(self) -> None:
        with patch("guestfill_ocr.ocr.ocr_selector.check_paddleocr_available", return_value=False):
            candidate = _make_candidate()
            with patch("guestfill_ocr.ocr.ocr_selector._run_single_candidate_ocr", return_value=True):
                candidate.cleaned_lines = [
                    "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<",
                    "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02",
                ]
                best, warnings, engine = select_best_candidate_with_engine(
                    [candidate], timeout=8, prefer_paddleocr=True
                )
                assert engine == "tesseract"
                assert best is not None

    def test_uses_paddleocr_when_available(self) -> None:
        with patch("guestfill_ocr.ocr.ocr_selector.check_paddleocr_available", return_value=True):
            candidate = _make_candidate()
            with patch("guestfill_ocr.ocr.ocr_selector._run_single_candidate_ocr", return_value=True):
                candidate.cleaned_lines = [
                    "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<",
                    "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02",
                ]
                best, warnings, engine = select_best_candidate_with_engine(
                    [candidate], timeout=8, prefer_paddleocr=True
                )
                assert best is not None

    def test_selects_highest_scoring_candidate(self) -> None:
        low_candidate = _make_candidate()
        low_candidate.cleaned_lines = ["P<SHORT<<<<<"]
        high_candidate = _make_candidate()
        high_candidate.cleaned_lines = [
            "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<",
            "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02",
        ]
        with patch("guestfill_ocr.ocr.ocr_selector._run_single_candidate_ocr", return_value=True):
            with patch("guestfill_ocr.ocr.ocr_selector.check_paddleocr_available", return_value=False):
                best, _warnings, _engine = select_best_candidate_with_engine(
                    [low_candidate, high_candidate], timeout=8, prefer_paddleocr=False
                )
                assert best is high_candidate


class TestSelectBestCandidateSync:
    def test_sync_wrapper_returns_result(self) -> None:
        from guestfill_ocr.ocr.ocr_selector import select_best_candidate_sync

        with patch("guestfill_ocr.ocr.ocr_selector.check_paddleocr_available", return_value=False):
            candidate = _make_candidate()
            with patch("guestfill_ocr.ocr.ocr_selector._run_single_candidate_ocr", return_value=False):
                best, warnings = select_best_candidate_sync([candidate], timeout=8)
                assert best is None
                assert "MRZ_NOT_FOUND" in warnings


class TestPaddleOcrIntegration:
    def test_paddle_available_and_good_result_uses_paddle(self) -> None:
        candidate = _make_candidate()
        candidate.raw_text = (
            "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<\nAB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"
        )
        candidate.cleaned_lines = [
            "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<",
            "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02",
        ]
        with patch("guestfill_ocr.ocr.ocr_selector.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.ocr_selector._run_single_candidate_ocr", return_value=True):
                best, warnings, engine = select_best_candidate_with_engine(
                    [candidate], timeout=8, prefer_paddleocr=True
                )
                assert engine == "paddleocr"
                assert best is not None

    def test_paddle_available_but_poor_result_falls_back(self) -> None:
        paddle_candidate = _make_candidate()
        paddle_candidate.cleaned_lines = ["SHORT"]
        tesseract_candidate = _make_candidate()
        tesseract_candidate.cleaned_lines = [
            "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<",
            "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02",
        ]

        paddle_run = [True]
        tesseract_run = [False]

        def fake_run(candidate, _timeout, use_paddleocr, **_kwargs):
            if use_paddleocr:
                paddle_run[0] = True
                return True
            tesseract_run[0] = True
            return True

        with patch("guestfill_ocr.ocr.ocr_selector.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.ocr_selector._run_single_candidate_ocr", side_effect=fake_run):
                best, _warnings, engine = select_best_candidate_with_engine(
                    [paddle_candidate], timeout=8, prefer_paddleocr=True
                )
                assert paddle_run[0] is True

    def test_paddle_unavailable_uses_tesseract(self) -> None:
        candidate = _make_candidate()
        candidate.cleaned_lines = [
            "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<",
            "AB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02",
        ]
        with patch("guestfill_ocr.ocr.ocr_selector.check_paddleocr_available", return_value=False):
            with patch("guestfill_ocr.ocr.ocr_selector._run_single_candidate_ocr", return_value=True):
                best, _warnings, engine = select_best_candidate_with_engine(
                    [candidate], timeout=8, prefer_paddleocr=True
                )
                assert engine == "tesseract"
                assert best is not None

    def test_detect_engine_returns_tesseract_when_paddle_unavailable(self) -> None:
        with patch("guestfill_ocr.ocr.ocr_selector.check_paddleocr_available", return_value=False):
            with patch("guestfill_ocr.ocr.ocr_selector._run_single_candidate_ocr", return_value=False):
                engine = get_select_best_candidate_engine([_make_candidate()], timeout=8)
                assert engine == "tesseract"

    def test_paddle_upscale_parameter_passed_through(self) -> None:
        candidate = _make_candidate()
        with patch("guestfill_ocr.ocr.ocr_selector.check_paddleocr_available", return_value=True):
            with patch("guestfill_ocr.ocr.ocr_selector.run_paddleocr_mrz") as mock_paddle:
                mock_paddle.return_value.is_ok.return_value = True
                mock_paddle.return_value.unwrap.return_value = (
                    "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<\nAB123456<7VNM7501018M2501019<<<<<<<<<<<<<<02"
                )
                select_best_candidate_with_engine([candidate], timeout=8, prefer_paddleocr=True, paddle_upscale=2.0)
                assert mock_paddle.called
                _, kwargs = mock_paddle.call_args
                assert kwargs.get("upscale_factor") == 2.0
