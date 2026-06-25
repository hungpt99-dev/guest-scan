"""Test configuration and fixtures."""

import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def sample_request() -> dict:
    return {
        "jobId": "test_job_001",
        "inputPaths": ["test_data/test_passport.jpg"],
        "outputPath": str(Path(tempfile.gettempdir()) / "test_output.xlsx"),
        "progressPath": "",
        "options": {
            "documentMode": "auto",
            "enablePassportMrz": True,
            "enablePassportVisualOcr": True,
            "enableIdCardOcr": True,
            "deleteTempFiles": True,
        },
    }


@pytest.fixture
def temp_dir() -> Path:
    d = Path(tempfile.mkdtemp(prefix="guestfill_test_"))
    yield d
    import shutil

    shutil.rmtree(d, ignore_errors=True)
