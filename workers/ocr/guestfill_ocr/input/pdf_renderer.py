"""Render PDF pages to images for OCR processing."""

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Ok, Result
from guestfill_ocr.storage.temp_manager import get_temp_dir


def render_pdf(pdf_path: str, dpi: int = 300) -> Result:
    try:
        from pdf2image import convert_from_path
    except ImportError:
        return Err(
            OcrError(
                "PDF_RENDER_FAILED",
                "pdf2image is not installed. Install with: pip install pdf2image",
            )
        )

    try:
        temp_dir = get_temp_dir()
        images: list[str] = []

        pages = convert_from_path(
            pdf_path,
            dpi=dpi,
            output_folder=str(temp_dir),
            fmt="png",
            prefix="pdf_page_",
        )

        for i, page in enumerate(pages):
            page_path = str(temp_dir / f"pdf_page_{i}.png")
            page.save(page_path, "PNG")
            images.append(page_path)

        return Ok(images)

    except Exception as e:
        return Err(OcrError("PDF_RENDER_FAILED", f"Failed to render PDF: {e}", source_file=pdf_path))
