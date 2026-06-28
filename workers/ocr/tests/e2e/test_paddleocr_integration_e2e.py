"""E2E integration tests for PaddleOCR in the full MRZ pipeline.

Tests the integration between PaddleOCR engine, OCR selector,
and the full extraction pipeline with mock PaddleOCR results.
"""

from unittest.mock import MagicMock, patch

import numpy as np

from guestfill_ocr.extraction.confidence_engine import (
    calculate_passport_confidence,
    determine_status,
    get_confidence_level,
)
from guestfill_ocr.extraction.field_extractor import build_guest_row
from guestfill_ocr.extraction.field_normalizer import (
    normalize_country,
    normalize_date,
    normalize_gender,
    normalize_name,
    normalize_passport_number,
)
from guestfill_ocr.extraction.warning_engine import collect_warnings
from guestfill_ocr.ocr.ocr_candidate import OcrCandidate
from guestfill_ocr.ocr.ocr_selector import select_best_candidate_with_engine
from guestfill_ocr.passport.mrz_cleaner import clean_mrz_text
from guestfill_ocr.passport.mrz_parser import parse_mrz_lines
from guestfill_ocr.passport.mrz_repair import try_repair_mrz
from guestfill_ocr.passport.mrz_validator import validate_full_mrz

VALID_LINE1 = "P<VNMTAEST<<SURNAME<<GIVEN<NAME<<<<<<<<<<<<<<<"
VALID_LINE2 = "AB123456<4VNM7501012M2501017<<<<<<<<<<<<<<02"

FAKE_PADDLE_RESULT_TD3 = [
    [
        ([[0, 0], [44, 0], [44, 10], [0, 10]], (VALID_LINE1, 0.96)),
        ([[0, 10], [44, 20], [44, 30], [0, 20]], (VALID_LINE2, 0.93)),
    ]
]

FAKE_PADDLE_RESULT_TD1 = {
    "line1": "P<UTOSTAERIKSSON<<ANNA<MARIA" + "<" * (30 - len("P<UTOSTAERIKSSON<<ANNA<MARIA")),
    "line2": "AB123456<7UTO7501012F2501017" + "<" * (30 - len("AB123456<7UTO7501012F2501017")),
    "line3": "XC123456<UTO1234567" + "<" * (30 - len("XC123456<UTO1234567")),
}


class TestPipelineWithPaddleOcr:
    """Full pipeline integration with PaddleOCR as primary engine."""

    def _make_paddle_candidate(self) -> OcrCandidate:
        candidate = OcrCandidate(
            image=MagicMock(),
            psm=6,
            preprocessing="grayscale",
            crop_source="bottom_25",
        )
        raw = VALID_LINE1 + "\n" + VALID_LINE2
        candidate.raw_text = raw
        candidate.cleaned_lines = clean_mrz_text(raw)
        return candidate

    def test_paddle_to_parse_to_confidence_full_flow(self) -> None:
        """PaddleOCR result -> parse -> validate -> confidence -> status."""
        candidate = self._make_paddle_candidate()
        assert len(candidate.cleaned_lines) >= 2

        line1 = candidate.cleaned_lines[0]
        line2 = candidate.cleaned_lines[1]

        repaired, repair_warnings = try_repair_mrz(line1, line2)
        line1, line2 = repaired[0], repaired[1]

        mrz_fields = parse_mrz_lines(line1, line2)
        check_digits = mrz_fields.get("check_digits", {})

        assert mrz_fields["surname"] != ""
        assert mrz_fields["passport_number"] == "AB123456"

        validation_result = validate_full_mrz(line1, line2)
        assert validation_result["overall_valid"] is True
        assert len(validation_result["errors"]) == 0

        warnings = collect_warnings(
            classification={"document_type": "PASSPORT"},
            quality={"quality_ok": True},
            mrz_lines=[line1, line2],
            check_digits=check_digits,
            fields=mrz_fields,
            repair_warnings=repair_warnings,
            visual_used=False,
        )

        lines_valid = all(len(ln) == 44 for ln in [line1, line2])
        confidence = calculate_passport_confidence(
            has_mrz=True,
            lines_valid=lines_valid,
            check_digits=check_digits,
            image_quality={"quality_ok": True},
            warnings=warnings,
            repair_used=bool(repair_warnings),
            visual_used=False,
        )

        assert confidence >= 0.90
        assert get_confidence_level(confidence) == "HIGH"
        assert determine_status(confidence, warnings) in ("READY", "NEED_REVIEW")

    def test_paddle_result_goes_to_guest_row(self) -> None:
        """Extracted MRZ fields should produce a valid guest row."""
        candidate = self._make_paddle_candidate()
        line1 = candidate.cleaned_lines[0]
        line2 = candidate.cleaned_lines[1]

        mrz_fields = parse_mrz_lines(line1, line2)
        guest_row = build_guest_row(source_file="test_passport.jpg", mrz_fields=mrz_fields)

        assert guest_row["document_type"] == "PASSPORT"
        assert guest_row["full_name"] != ""
        assert guest_row["passport_number"] == "AB123456"
        assert guest_row["status"] in ("READY", "NEED_REVIEW")

    def test_paddle_mrz_with_normalized_fields(self) -> None:
        """MRZ data parsed via PaddleOCR should normalize correctly."""
        candidate = self._make_paddle_candidate()
        line1 = candidate.cleaned_lines[0]
        line2 = candidate.cleaned_lines[1]

        mrz_fields = parse_mrz_lines(line1, line2)

        assert "SURNAME" in normalize_name(mrz_fields["full_name"])
        assert "GIVEN" in normalize_name(mrz_fields["full_name"])
        assert "NAME" in normalize_name(mrz_fields["full_name"])
        assert normalize_country(mrz_fields["nationality"]) == "VNM"
        assert normalize_date(mrz_fields["date_of_birth"]) == "1975-01-01"
        assert normalize_gender(mrz_fields["gender"]) == "M"
        assert normalize_passport_number(mrz_fields["passport_number"]) == "AB123456"


class TestPaddleOcrFallbackScenarios:
    """Tests for PaddleOCR fallback to Tesseract in various scenarios."""

    def test_paddle_empty_result_falls_to_tesseract(self) -> None:
        """When PaddleOCR returns empty, Tesseract should be tried."""
        candidate = OcrCandidate(
            image=np.zeros((100, 100, 3), dtype=np.uint8),
            psm=6,
            preprocessing="grayscale",
            crop_source="test",
        )

        mock_paddle_result = MagicMock()
        mock_paddle_result.is_ok.return_value = True
        mock_paddle_result.unwrap.return_value = ""
        mock_tess_result = MagicMock()
        mock_tess_result.is_ok.return_value = True
        mock_tess_result.unwrap.return_value = VALID_LINE1 + "\n" + VALID_LINE2
        with (
            patch("guestfill_ocr.ocr.ocr_selector.check_paddleocr_available", return_value=True),
            patch("guestfill_ocr.ocr.ocr_selector.run_paddleocr_mrz", return_value=mock_paddle_result),
            patch("guestfill_ocr.ocr.ocr_selector.run_mrz_ocr", return_value=mock_tess_result),
        ):
            best, _warnings, engine = select_best_candidate_with_engine([candidate], timeout=8, prefer_paddleocr=True)
            assert best is not None
            assert len(best.cleaned_lines) >= 2

    def test_paddle_unavailable_uses_tesseract(self) -> None:
        """When PaddleOCR is not installed, Tesseract handles everything."""
        candidate = OcrCandidate(
            image=np.zeros((100, 100, 3), dtype=np.uint8),
            psm=6,
            preprocessing="grayscale",
            crop_source="test",
        )

        mock_tess_result = MagicMock()
        mock_tess_result.is_ok.return_value = True
        mock_tess_result.unwrap.return_value = VALID_LINE1 + "\n" + VALID_LINE2
        with (
            patch("guestfill_ocr.ocr.ocr_selector.check_paddleocr_available", return_value=False),
            patch("guestfill_ocr.ocr.ocr_selector.run_mrz_ocr", return_value=mock_tess_result),
        ):
            best, _warnings, engine = select_best_candidate_with_engine([candidate], timeout=8, prefer_paddleocr=True)
            assert engine == "tesseract"
            assert best is not None

    def test_paddle_exception_triggers_tesseract_fallback(self) -> None:
        """When PaddleOCR raises an exception, Tesseract fallback should activate."""
        candidate = OcrCandidate(
            image=np.zeros((100, 100, 3), dtype=np.uint8),
            psm=6,
            preprocessing="grayscale",
            crop_source="test",
        )

        mock_paddle_result = MagicMock()
        mock_paddle_result.is_ok.return_value = False
        mock_tess_result = MagicMock()
        mock_tess_result.is_ok.return_value = True
        mock_tess_result.unwrap.return_value = VALID_LINE1 + "\n" + VALID_LINE2
        with (
            patch("guestfill_ocr.ocr.ocr_selector.check_paddleocr_available", return_value=True),
            patch("guestfill_ocr.ocr.ocr_selector.run_paddleocr_mrz", return_value=mock_paddle_result),
            patch("guestfill_ocr.ocr.ocr_selector.run_mrz_ocr", return_value=mock_tess_result),
        ):
            best, _warnings, engine = select_best_candidate_with_engine([candidate], timeout=8, prefer_paddleocr=True)
            assert best is not None
