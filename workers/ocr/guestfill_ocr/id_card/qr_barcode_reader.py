"""QR and barcode reader interface."""

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Ok, Result


def read_qr_barcode(image_path: str) -> Result:
    try:
        from PIL import Image
        from pyzbar.pyzbar import decode

        pil_image = Image.open(image_path)
        decoded = decode(pil_image)
        results = []
        for obj in decoded:
            results.append(
                {
                    "type": str(obj.type),
                    "data": obj.data.decode("utf-8", errors="replace"),
                    "rect": {
                        "left": obj.rect.left,
                        "top": obj.rect.top,
                        "width": obj.rect.width,
                        "height": obj.rect.height,
                    },
                }
            )
        if not results:
            return Err(
                OcrError(
                    "QR_BARCODE_NOT_FOUND",
                    "No QR or barcode found in image",
                    source_file=image_path,
                )
            )
        return Ok(results)
    except ImportError:
        return Err(
            OcrError(
                "QR_BARCODE_READ_FAILED",
                "pyzbar is not installed. Install with: pip install pyzbar",
                source_file=image_path,
            )
        )
    except Exception as e:
        return Err(OcrError("QR_BARCODE_READ_FAILED", f"QR/barcode read failed: {e}", source_file=image_path))
