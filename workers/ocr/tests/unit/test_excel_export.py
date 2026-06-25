"""Tests for Excel export."""

import tempfile
from pathlib import Path

from guestfill_ocr.excel.columns import DIAGNOSTIC_COLUMNS, ERROR_COLUMNS, GUEST_COLUMNS


class TestExcelColumns:
    def test_guest_columns_have_required_fields(self) -> None:
        assert "row_id" in GUEST_COLUMNS
        assert "full_name" in GUEST_COLUMNS
        assert "status" in GUEST_COLUMNS
        assert "confidence_score" in GUEST_COLUMNS
        assert "confidence_level" in GUEST_COLUMNS
        assert "ocr_warning" in GUEST_COLUMNS
        assert "source_file" in GUEST_COLUMNS

    def test_error_columns_have_required_fields(self) -> None:
        assert "source_file" in ERROR_COLUMNS
        assert "error_code" in ERROR_COLUMNS
        assert "error_message" in ERROR_COLUMNS

    def test_diagnostic_columns_have_required_fields(self) -> None:
        assert "source_file" in DIAGNOSTIC_COLUMNS
        assert "processing_time_ms" in DIAGNOSTIC_COLUMNS
        assert "blur_score" in DIAGNOSTIC_COLUMNS

    def test_guest_columns_count(self) -> None:
        assert len(GUEST_COLUMNS) >= 20


class TestExportToExcel:
    def test_export_creates_file(self) -> None:
        from guestfill_ocr.excel.export_excel import export_to_excel

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            output_path = f.name

        try:
            rows = [
                {
                    "row_id": "1",
                    "full_name": "John Smith",
                    "surname": "Smith",
                    "given_name": "John",
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
                    "source_file": "test.jpg",
                }
            ]
            export_to_excel(
                rows,
                [],
                [],
                output_path,
                {
                    "includeErrorsSheet": True,
                    "includeInstructionsSheet": True,
                    "enableDiagnosticsSheet": True,
                },
            )
            assert Path(output_path).exists()
            assert Path(output_path).stat().st_size > 0
        finally:
            Path(output_path).unlink(missing_ok=True)
