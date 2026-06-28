"""E2E integration tests for Excel export."""
import tempfile
from pathlib import Path

from guestfill_ocr.excel.columns import GUEST_COLUMNS, ERROR_COLUMNS, DIAGNOSTIC_COLUMNS
from guestfill_ocr.excel.export_excel import export_to_excel


class TestExportExcelE2E:
    """End-to-end: build rows -> export to Excel -> verify output."""

    def create_sample_rows(self) -> list[dict]:
        return [
            {
                "row_id": "1",
                "full_name": "JOHN SMITH",
                "surname": "SMITH",
                "given_name": "JOHN",
                "passport_number": "AB123456",
                "id_number": "",
                "nationality": "USA",
                "date_of_birth": "1980-01-01",
                "gender": "M",
                "passport_expiry_date": "2030-01-01",
                "id_expiry_date": "",
                "issuing_country": "USA",
                "issuing_authority": "",
                "document_type": "PASSPORT",
                "room_number": "",
                "arrival_date": "",
                "departure_date": "",
                "reservation_code": "",
                "status": "READY",
                "confidence_score": 0.95,
                "confidence_level": "HIGH",
                "note": "",
                "ocr_warning": "",
                "source_file": "passport_01.jpg",
            },
            {
                "row_id": "2",
                "full_name": "JANE DOE",
                "surname": "DOE",
                "given_name": "JANE",
                "passport_number": "CD789012",
                "id_number": "",
                "nationality": "VNM",
                "date_of_birth": "1995-06-15",
                "gender": "F",
                "passport_expiry_date": "2035-06-15",
                "id_expiry_date": "",
                "issuing_country": "VNM",
                "issuing_authority": "",
                "document_type": "PASSPORT",
                "room_number": "101",
                "arrival_date": "2025-06-01",
                "departure_date": "2025-06-05",
                "reservation_code": "RES-001",
                "status": "READY",
                "confidence_score": 0.88,
                "confidence_level": "MEDIUM",
                "note": "",
                "ocr_warning": "LOW_IMAGE_SHARPNESS",
                "source_file": "passport_02.jpg",
            },
            {
                "row_id": "3",
                "full_name": "BOB WILLIAMS",
                "surname": "WILLIAMS",
                "given_name": "BOB",
                "passport_number": "",
                "id_number": "ID987654321",
                "nationality": "GBR",
                "date_of_birth": "1988-03-22",
                "gender": "M",
                "passport_expiry_date": "",
                "id_expiry_date": "2028-03-22",
                "issuing_country": "GBR",
                "issuing_authority": "UKVI",
                "document_type": "ID_CARD",
                "room_number": "",
                "arrival_date": "",
                "departure_date": "",
                "reservation_code": "",
                "status": "NEED_REVIEW",
                "confidence_score": 0.75,
                "confidence_level": "MEDIUM",
                "note": "ID card - manual review needed",
                "ocr_warning": "ID_CARD_QR_NOT_FOUND",
                "source_file": "id_card_01.jpg",
            },
        ]

    def create_sample_errors(self) -> list[dict]:
        return [
            {
                "row_id": "1",
                "source_file": "passport_01.jpg",
                "error_code": "LOW_CONFIDENCE",
                "error_message": "Confidence score below threshold",
                "technical_detail": "",
            },
        ]

    def create_sample_diagnostics(self) -> list[dict]:
        return [
            {
                "row_id": "1",
                "source_file": "passport_01.jpg",
                "document_type_detected": "PASSPORT",
                "processing_time_ms": 1250,
                "image_width": 1920,
                "image_height": 1080,
                "blur_score": 0.05,
                "brightness": 0.75,
                "contrast": 0.80,
                "selected_ocr_engine": "tesseract",
                "selected_candidate": "mrz",
                "candidate_score": 0.95,
                "validation_summary": "ALL_CHECKS_PASSED",
                "warnings": "",
            },
            {
                "row_id": "2",
                "source_file": "passport_02.jpg",
                "document_type_detected": "PASSPORT",
                "processing_time_ms": 980,
                "image_width": 1920,
                "image_height": 1080,
                "blur_score": 0.35,
                "brightness": 0.60,
                "contrast": 0.65,
                "selected_ocr_engine": "tesseract",
                "selected_candidate": "mrz",
                "candidate_score": 0.88,
                "validation_summary": "LOW_IMAGE_SHARPNESS",
                "warnings": "LOW_IMAGE_SHARPNESS",
            },
        ]

    def test_export_with_all_default_options(self) -> None:
        rows = self.create_sample_rows()
        errors = self.create_sample_errors()
        diagnostics = self.create_sample_diagnostics()

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            output_path = f.name

        try:
            export_to_excel(rows, errors, diagnostics, output_path, {})
            assert Path(output_path).exists()
            assert Path(output_path).stat().st_size > 0
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_export_with_explicit_options(self) -> None:
        rows = self.create_sample_rows()
        errors = self.create_sample_errors()
        diagnostics = self.create_sample_diagnostics()

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            output_path = f.name

        try:
            export_to_excel(rows, errors, diagnostics, output_path, {
                "includeErrorsSheet": True,
                "includeInstructionsSheet": True,
                "enableDiagnosticsSheet": True,
            })
            assert Path(output_path).exists()
            assert Path(output_path).stat().st_size > 0
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_export_without_optional_sheets(self) -> None:
        rows = self.create_sample_rows()

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            output_path = f.name

        try:
            export_to_excel(rows, [], [], output_path, {
                "includeErrorsSheet": False,
                "includeInstructionsSheet": False,
                "enableDiagnosticsSheet": False,
            })
            assert Path(output_path).exists()
            assert Path(output_path).stat().st_size > 0
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_export_with_empty_rows(self) -> None:
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            output_path = f.name

        try:
            export_to_excel([], [], [], output_path, {})
            assert Path(output_path).exists()
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_export_multiple_guests_various_statuses(self) -> None:
        rows = [
            {"row_id": str(i), "full_name": f"Guest {i}", "surname": "", "given_name": "",
             "passport_number": "", "id_number": "", "nationality": "", "date_of_birth": "",
             "gender": "M", "passport_expiry_date": "", "id_expiry_date": "",
             "issuing_country": "", "issuing_authority": "", "document_type": "PASSPORT",
             "room_number": "", "arrival_date": "", "departure_date": "",
             "reservation_code": "", "status": status,
             "confidence_score": score, "confidence_level": level,
             "note": "", "ocr_warning": "", "source_file": ""}
            for i, (status, score, level) in enumerate([
                ("READY", 0.95, "HIGH"),
                ("NEED_REVIEW", 0.65, "MEDIUM"),
                ("FAILED", 0.0, "LOW"),
                ("MISSING_DATA", 0.0, "LOW"),
            ], 1)
        ]

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            output_path = f.name

        try:
            export_to_excel(rows, [], [], output_path, {})
            assert Path(output_path).exists()
        finally:
            Path(output_path).unlink(missing_ok=True)

    def test_column_definitions_have_required_fields(self) -> None:
        assert "row_id" in GUEST_COLUMNS
        assert "full_name" in GUEST_COLUMNS
        assert "status" in GUEST_COLUMNS
        assert "confidence_score" in GUEST_COLUMNS
        assert "confidence_level" in GUEST_COLUMNS
        assert "ocr_warning" in GUEST_COLUMNS
        assert "source_file" in GUEST_COLUMNS
        assert len(GUEST_COLUMNS) >= 20

        assert "error_code" in ERROR_COLUMNS
        assert "error_message" in ERROR_COLUMNS

        assert "processing_time_ms" in DIAGNOSTIC_COLUMNS
        assert "blur_score" in DIAGNOSTIC_COLUMNS
