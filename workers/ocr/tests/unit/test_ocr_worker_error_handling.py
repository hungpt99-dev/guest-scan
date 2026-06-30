"""Tests for OCR worker error handling and retry logic."""
# ruff: noqa: SIM117

import json
import os
import subprocess
import time
from pathlib import Path
from unittest.mock import MagicMock, PropertyMock, patch

import pytest

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Ok


# ── PaddleOCR retry logic ──────────────────────────────────────────────

class TestGetPaddleocrInstanceRetry:
    def test_succeeds_on_first_attempt(self) -> None:
        with patch("guestfill_ocr.ocr.paddleocr_engine._PPOCR_INSTANCES", {}):
            with patch("guestfill_ocr.ocr.paddleocr_engine.PPOCR_INIT_RETRY_ATTEMPTS", 3):
                with patch("guestfill_ocr.ocr.paddleocr_engine.time.sleep") as mock_sleep:
                    with patch(
                        "guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_has_gpu",
                        return_value=False,
                    ):
                        with patch(
                            "guestfill_ocr.ocr.paddleocr_engine.PaddleOCR"
                        ) as mock_paddle:
                            from guestfill_ocr.ocr.paddleocr_engine import (
                                _get_paddleocr_instance,
                            )

                            instance = _get_paddleocr_instance(lang="ml", use_gpu=False)
                            assert instance is mock_paddle.return_value
                            mock_paddle.assert_called_once()
                            mock_sleep.assert_not_called()

    def test_retries_on_failure_then_succeeds(self) -> None:
        with patch("guestfill_ocr.ocr.paddleocr_engine._PPOCR_INSTANCES", {}):
            with patch("guestfill_ocr.ocr.paddleocr_engine.PPOCR_INIT_RETRY_ATTEMPTS", 3):
                with patch("guestfill_ocr.ocr.paddleocr_engine.PPOCR_INIT_RETRY_BACKOFF", 1.0):
                    with patch("guestfill_ocr.ocr.paddleocr_engine.time.sleep") as mock_sleep:
                        with patch(
                            "guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_has_gpu",
                            return_value=False,
                        ):
                            mock_paddle = MagicMock()
                            mock_paddle.side_effect = [
                                RuntimeError("GPU OOM"),
                                RuntimeError("CUDA error"),
                                MagicMock(),
                            ]
                            with patch(
                                "guestfill_ocr.ocr.paddleocr_engine.PaddleOCR",
                                mock_paddle,
                            ):
                                from guestfill_ocr.ocr.paddleocr_engine import (
                                    _get_paddleocr_instance,
                                )

                                instance = _get_paddleocr_instance(lang="ml", use_gpu=False)
                                assert instance is mock_paddle.return_value
                                assert mock_paddle.call_count == 3
                                assert mock_sleep.call_count == 2
                                mock_sleep.assert_any_call(1.0)
                                mock_sleep.assert_any_call(2.0)

    def test_all_attempts_fail_raises_runtime_error(self) -> None:
        with patch("guestfill_ocr.ocr.paddleocr_engine._PPOCR_INSTANCES", {}):
            with patch("guestfill_ocr.ocr.paddleocr_engine._PPOCR_AVAILABLE", True):
                with patch("guestfill_ocr.ocr.paddleocr_engine._PPOCR_CHECKED", False):
                    with patch(
                        "guestfill_ocr.ocr.paddleocr_engine.PPOCR_INIT_RETRY_ATTEMPTS", 2
                    ):
                        with patch(
                            "guestfill_ocr.ocr.paddleocr_engine.PPOCR_INIT_RETRY_BACKOFF", 0.1
                        ):
                            with patch(
                                "guestfill_ocr.ocr.paddleocr_engine.time.sleep"
                            ):
                                with patch(
                                    "guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_has_gpu",
                                    return_value=False,
                                ):
                                    with patch(
                                        "guestfill_ocr.ocr.paddleocr_engine.PaddleOCR",
                                        side_effect=RuntimeError("Always fails"),
                                    ):
                                        from guestfill_ocr.ocr.paddleocr_engine import (
                                            _PPOCR_AVAILABLE,
                                            _get_paddleocr_instance,
                                        )

                                        with pytest.raises(
                                            RuntimeError,
                                            match="PaddleOCR initialization failed after 2 attempts",
                                        ):
                                            _get_paddleocr_instance(
                                                lang="ml", use_gpu=False
                                            )
                                        assert _PPOCR_AVAILABLE is False

    def test_exponential_backoff_delays(self) -> None:
        delays = []
        original_sleep = time.sleep

        def capture_sleep(secs: float) -> None:
            delays.append(secs)

        with patch("guestfill_ocr.ocr.paddleocr_engine._PPOCR_INSTANCES", {}):
            with patch("guestfill_ocr.ocr.paddleocr_engine.PPOCR_INIT_RETRY_ATTEMPTS", 4):
                with patch(
                    "guestfill_ocr.ocr.paddleocr_engine.PPOCR_INIT_RETRY_BACKOFF", 1.0
                ):
                    with patch(
                        "guestfill_ocr.ocr.paddleocr_engine.time.sleep",
                        side_effect=capture_sleep,
                    ):
                        with patch(
                            "guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_has_gpu",
                            return_value=False,
                        ):
                            with patch(
                                "guestfill_ocr.ocr.paddleocr_engine.PaddleOCR",
                                side_effect=RuntimeError("fail"),
                            ):
                                from guestfill_ocr.ocr.paddleocr_engine import (
                                    _get_paddleocr_instance,
                                )

                                with pytest.raises(RuntimeError):
                                    _get_paddleocr_instance(lang="ml", use_gpu=False)
                                assert delays == [1.0, 2.0, 3.0]

    def test_paddleocr_unavailable_marked_after_failure(self) -> None:
        with patch("guestfill_ocr.ocr.paddleocr_engine._PPOCR_INSTANCES", {}):
            with patch("guestfill_ocr.ocr.paddleocr_engine._PPOCR_AVAILABLE", True):
                with patch("guestfill_ocr.ocr.paddleocr_engine._PPOCR_CHECKED", False):
                    with patch(
                        "guestfill_ocr.ocr.paddleocr_engine.PPOCR_INIT_RETRY_ATTEMPTS", 1
                    ):
                        with patch(
                            "guestfill_ocr.ocr.paddleocr_engine.time.sleep"
                        ):
                            with patch(
                                "guestfill_ocr.ocr.paddleocr_engine.check_paddleocr_has_gpu",
                                return_value=False,
                            ):
                                with patch(
                                    "guestfill_ocr.ocr.paddleocr_engine.PaddleOCR",
                                    side_effect=RuntimeError("fail"),
                                ):
                                    from guestfill_ocr.ocr.paddleocr_engine import (
                                        check_paddleocr_available,
                                    )

                                    with pytest.raises(RuntimeError):
                                        from guestfill_ocr.ocr.paddleocr_engine import (
                                            _get_paddleocr_instance,
                                        )

                                        _get_paddleocr_instance(
                                            lang="ml", use_gpu=False
                                        )
                                    assert check_paddleocr_available() is False


# ── Tesseract retry logic ─────────────────────────────────────────────

class TestCheckTesseractAvailableRetry:
    def test_succeeds_on_first_attempt(self) -> None:
        with patch("guestfill_ocr.ocr.tesseract_engine._TESSERACT_CHECKED", False):
            with patch("guestfill_ocr.ocr.tesseract_engine._TESSERACT_AVAILABLE", False):
                with patch("guestfill_ocr.ocr.tesseract_engine.time.sleep") as mock_sleep:
                    with patch(
                        "guestfill_ocr.ocr.tesseract_engine.subprocess.run"
                    ) as mock_run:
                        mock_proc = MagicMock()
                        mock_proc.returncode = 0
                        mock_run.return_value = mock_proc

                        from guestfill_ocr.ocr.tesseract_engine import (
                            check_tesseract_available,
                        )

                        result = check_tesseract_available()
                        assert result is True
                        mock_run.assert_called_once()
                        mock_sleep.assert_not_called()

    def test_retries_on_nonzero_returncode_then_succeeds(self) -> None:
        with patch("guestfill_ocr.ocr.tesseract_engine._TESSERACT_CHECKED", False):
            with patch("guestfill_ocr.ocr.tesseract_engine._TESSERACT_AVAILABLE", False):
                with patch(
                    "guestfill_ocr.ocr.tesseract_engine._TESSERACT_RETRY_ATTEMPTS", 3
                ):
                    with patch(
                        "guestfill_ocr.ocr.tesseract_engine._TESSERACT_RETRY_BACKOFF", 1.0
                    ):
                        with patch(
                            "guestfill_ocr.ocr.tesseract_engine.time.sleep"
                        ) as mock_sleep:
                            with patch(
                                "guestfill_ocr.ocr.tesseract_engine.subprocess.run"
                            ) as mock_run:
                                mock_run.side_effect = [
                                    MagicMock(returncode=1),
                                    MagicMock(returncode=1),
                                    MagicMock(returncode=0),
                                ]

                                from guestfill_ocr.ocr.tesseract_engine import (
                                    check_tesseract_available,
                                )

                                result = check_tesseract_available()
                                assert result is True
                                assert mock_run.call_count == 3
                                assert mock_sleep.call_count == 2

    def test_all_attempts_fail_returns_false(self) -> None:
        with patch("guestfill_ocr.ocr.tesseract_engine._TESSERACT_CHECKED", False):
            with patch("guestfill_ocr.ocr.tesseract_engine._TESSERACT_AVAILABLE", False):
                with patch(
                    "guestfill_ocr.ocr.tesseract_engine._TESSERACT_RETRY_ATTEMPTS", 2
                ):
                    with patch(
                        "guestfill_ocr.ocr.tesseract_engine._TESSERACT_RETRY_BACKOFF", 0.1
                    ):
                        with patch(
                            "guestfill_ocr.ocr.tesseract_engine.time.sleep"
                        ):
                            with patch(
                                "guestfill_ocr.ocr.tesseract_engine.subprocess.run",
                                return_value=MagicMock(returncode=1),
                            ):
                                from guestfill_ocr.ocr.tesseract_engine import (
                                    check_tesseract_available,
                                )

                                result = check_tesseract_available()
                                assert result is False

    def test_retries_on_exception_then_succeeds(self) -> None:
        with patch("guestfill_ocr.ocr.tesseract_engine._TESSERACT_CHECKED", False):
            with patch("guestfill_ocr.ocr.tesseract_engine._TESSERACT_AVAILABLE", False):
                with patch(
                    "guestfill_ocr.ocr.tesseract_engine._TESSERACT_RETRY_ATTEMPTS", 2
                ):
                    with patch(
                        "guestfill_ocr.ocr.tesseract_engine._TESSERACT_RETRY_BACKOFF", 0.5
                    ):
                        with patch(
                            "guestfill_ocr.ocr.tesseract_engine.time.sleep"
                        ) as mock_sleep:
                            with patch(
                                "guestfill_ocr.ocr.tesseract_engine.subprocess.run"
                            ) as mock_run:
                                mock_run.side_effect = [
                                    subprocess.TimeoutExpired(
                                        ["tesseract"], timeout=5
                                    ),
                                    MagicMock(returncode=0),
                                ]

                                from guestfill_ocr.ocr.tesseract_engine import (
                                    check_tesseract_available,
                                )

                                result = check_tesseract_available()
                                assert result is True
                                assert mock_run.call_count == 2
                                mock_sleep.assert_called_once_with(0.5)

    def test_all_exceptions_fail_returns_false(self) -> None:
        with patch("guestfill_ocr.ocr.tesseract_engine._TESSERACT_CHECKED", False):
            with patch("guestfill_ocr.ocr.tesseract_engine._TESSERACT_AVAILABLE", False):
                with patch(
                    "guestfill_ocr.ocr.tesseract_engine._TESSERACT_RETRY_ATTEMPTS", 2
                ):
                    with patch(
                        "guestfill_ocr.ocr.tesseract_engine.time.sleep"
                    ):
                        with patch(
                            "guestfill_ocr.ocr.tesseract_engine.subprocess.run",
                            side_effect=subprocess.TimeoutExpired(
                                ["tesseract"], timeout=5
                            ),
                        ):
                            from guestfill_ocr.ocr.tesseract_engine import (
                                check_tesseract_available,
                            )

                            result = check_tesseract_available()
                            assert result is False

    def test_tesseract_backoff_delays(self) -> None:
        delays = []

        def capture_sleep(secs: float) -> None:
            delays.append(secs)

        with patch("guestfill_ocr.ocr.tesseract_engine._TESSERACT_CHECKED", False):
            with patch("guestfill_ocr.ocr.tesseract_engine._TESSERACT_AVAILABLE", False):
                with patch(
                    "guestfill_ocr.ocr.tesseract_engine._TESSERACT_RETRY_ATTEMPTS", 3
                ):
                    with patch(
                        "guestfill_ocr.ocr.tesseract_engine._TESSERACT_RETRY_BACKOFF", 1.0
                    ):
                        with patch(
                            "guestfill_ocr.ocr.tesseract_engine.time.sleep",
                            side_effect=capture_sleep,
                        ):
                            with patch(
                                "guestfill_ocr.ocr.tesseract_engine.subprocess.run",
                                return_value=MagicMock(returncode=1),
                            ):
                                from guestfill_ocr.ocr.tesseract_engine import (
                                    check_tesseract_available,
                                )

                                check_tesseract_available()
                                assert delays == [1.0, 2.0]


# ── Response writer retry logic ───────────────────────────────────────

class TestWriteResponseRetry:
    def test_succeeds_on_first_attempt(self, temp_dir: Path) -> None:
        path = str(temp_dir / "response.json")
        data = {"status": "COMPLETED"}

        from guestfill_ocr.cli.response_writer import write_response

        write_response(path, data)

        with open(path, encoding="utf-8") as f:
            loaded = json.load(f)
        assert loaded["status"] == "COMPLETED"

    def test_retries_on_oserror_then_succeeds(self, temp_dir: Path) -> None:
        path = str(temp_dir / "response.json")

        from guestfill_ocr.cli.response_writer import write_response

        original_open = __builtins__["open"]

        open_call_count = [0]

        def flaky_open(*args, **kwargs):
            open_call_count[0] += 1
            if open_call_count[0] == 1:
                msg = "Permission denied"
                raise PermissionError(msg)
            return original_open(*args, **kwargs)

        with patch("builtins.open", flaky_open):
            with patch("guestfill_ocr.cli.response_writer.time.sleep") as mock_sleep:
                write_response(path, {"status": "COMPLETED"})
                assert open_call_count[0] == 2
                mock_sleep.assert_called_once_with(0.5)

    def test_retries_on_oserror_oserror(self, temp_dir: Path) -> None:
        path = str(temp_dir / "response.json")

        from guestfill_ocr.cli.response_writer import write_response

        open_call_count = [0]

        def flaky_open(*args, **kwargs):
            open_call_count[0] += 1
            msg = "Disk full"
            raise OSError(msg)

        with patch("builtins.open", flaky_open):
            with patch("guestfill_ocr.cli.response_writer.time.sleep"):
                with pytest.raises(OSError, match="Failed to write response after 3 attempts"):
                    write_response(path, {"status": "FAILED"})
                assert open_call_count[0] == 3

    def test_exponential_backoff_on_oserror(self, temp_dir: Path) -> None:
        path = str(temp_dir / "response.json")
        delays = []

        def capture_sleep(secs: float) -> None:
            delays.append(secs)

        from guestfill_ocr.cli.response_writer import write_response

        with patch("builtins.open", side_effect=PermissionError("locked")):
            with patch(
                "guestfill_ocr.cli.response_writer.time.sleep",
                side_effect=capture_sleep,
            ):
                with pytest.raises(OSError):
                    write_response(path, {"status": "FAILED"}, max_retries=3, retry_delay=0.5)
                assert delays == [0.5, 2.0]

    def test_retry_on_osreplace_failure(self, temp_dir: Path) -> None:
        path = str(temp_dir / "response.json")

        from guestfill_ocr.cli.response_writer import write_response

        replace_call_count = [0]

        original_replace = os.replace

        def flaky_replace(src, dst):
            replace_call_count[0] += 1
            if replace_call_count[0] == 1:
                msg = "Cross-device link"
                raise OSError(msg)
            return original_replace(src, dst)

        with patch("guestfill_ocr.cli.response_writer.os.replace", flaky_replace):
            with patch("guestfill_ocr.cli.response_writer.time.sleep") as mock_sleep:
                write_response(path, {"status": "COMPLETED"})
                assert replace_call_count[0] == 2
                mock_sleep.assert_called_once_with(0.5)

    def test_directory_created_when_missing(self, temp_dir: Path) -> None:
        nested = temp_dir / "subdir" / "nested"
        path = str(nested / "response.json")

        from guestfill_ocr.cli.response_writer import write_response

        write_response(path, {"status": "COMPLETED"})
        assert nested.exists()
        assert (nested / "response.json").exists()


# ── Main process_ocr_job error handling ───────────────────────────────

class TestProcessOcrJobErrorHandling:
    def test_permission_error_returns_output_file_locked(self) -> None:
        with patch("guestfill_ocr.main.run_job", side_effect=PermissionError("locked")):
            from guestfill_ocr.main import process_ocr_job

            result = process_ocr_job({"jobId": "test_job"})
            assert result.is_ok()
            response = result.unwrap()
            assert response["status"] == "FAILED"
            assert response["errors"][0]["code"] == "OUTPUT_FILE_LOCKED"
            assert "open in another program" in response["errors"][0]["message"]

    def test_file_not_found_returns_file_not_found(self) -> None:
        with patch(
            "guestfill_ocr.main.run_job",
            side_effect=FileNotFoundError("missing.xlsx"),
        ):
            from guestfill_ocr.main import process_ocr_job

            result = process_ocr_job({"jobId": "test_job"})
            assert result.is_ok()
            response = result.unwrap()
            assert response["status"] == "FAILED"
            assert response["errors"][0]["code"] == "FILE_NOT_FOUND"

    def test_memory_error_returns_ocr_failed(self) -> None:
        with patch("guestfill_ocr.main.run_job", side_effect=MemoryError("OOM")):
            from guestfill_ocr.main import process_ocr_job

            result = process_ocr_job({"jobId": "test_job"})
            assert result.is_ok()
            response = result.unwrap()
            assert response["status"] == "FAILED"
            assert response["errors"][0]["code"] == "OCR_FAILED"
            assert "out of memory" in response["errors"][0]["message"].lower()

    def test_timeout_error_returns_ocr_timeout(self) -> None:
        with patch("guestfill_ocr.main.run_job", side_effect=TimeoutError("timed out")):
            from guestfill_ocr.main import process_ocr_job

            result = process_ocr_job({"jobId": "test_job"})
            assert result.is_ok()
            response = result.unwrap()
            assert response["status"] == "FAILED"
            assert response["errors"][0]["code"] == "OCR_TIMEOUT"

    def test_os_error_returns_os_error(self) -> None:
        with patch(
            "guestfill_ocr.main.run_job",
            side_effect=OSError(28, "No space left on device"),
        ):
            from guestfill_ocr.main import process_ocr_job

            result = process_ocr_job({"jobId": "test_job"})
            assert result.is_ok()
            response = result.unwrap()
            assert response["status"] == "FAILED"
            assert response["errors"][0]["code"] == "OS_ERROR"

    def test_generic_exception_returns_unknown_error(self) -> None:
        with patch(
            "guestfill_ocr.main.run_job",
            side_effect=ValueError("unexpected value"),
        ):
            from guestfill_ocr.main import process_ocr_job

            result = process_ocr_job({"jobId": "test_job"})
            assert result.is_ok()
            response = result.unwrap()
            assert response["status"] == "FAILED"
            assert response["errors"][0]["code"] == "UNKNOWN_ERROR"

    def test_build_fatal_error_structure(self) -> None:
        from guestfill_ocr.main import _build_fatal_error

        error = OcrError("TEST_CODE", "Test message", technical_detail="detail")
        request = {"jobId": "job_001"}
        response = _build_fatal_error(request, error)

        assert response["jobId"] == "job_001"
        assert response["status"] == "FAILED"
        assert response["outputPath"] is None
        assert response["summary"]["totalFiles"] == 0
        assert response["summary"]["totalDocuments"] == 0
        assert response["summary"]["ready"] == 0
        assert response["summary"]["needReview"] == 0
        assert response["summary"]["failed"] == 0
        assert response["summary"]["averageConfidence"] == 0
        assert len(response["errors"]) == 1
        assert response["errors"][0]["code"] == "TEST_CODE"
        assert response["errors"][0]["technical_detail"] == "detail"
