"""Tests for file validation."""

from guestfill_ocr.input.file_validator import is_supported_extension, validate_file


class TestIsSupportedExtension:
    def test_jpg_is_supported(self) -> None:
        assert is_supported_extension("test.jpg")

    def test_png_is_supported(self) -> None:
        assert is_supported_extension("test.png")

    def test_pdf_is_supported(self) -> None:
        assert is_supported_extension("test.pdf")

    def test_webp_is_supported(self) -> None:
        assert is_supported_extension("test.webp")

    def test_exe_is_not_supported(self) -> None:
        assert not is_supported_extension("test.exe")

    def test_txt_is_not_supported(self) -> None:
        assert not is_supported_extension("test.txt")


class TestValidateFile:
    def test_nonexistent_file(self) -> None:
        result = validate_file("C:/nonexistent/file.jpg")
        assert result.is_err()
        assert result.unwrap_err().code == "FILE_NOT_FOUND"

    def test_directory_is_not_a_file(self) -> None:
        result = validate_file("C:/")
        assert result.is_err()
