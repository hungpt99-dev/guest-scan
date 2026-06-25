"""Fix EXIF orientation and detect image orientation."""

import cv2
import numpy as np


def fix_exif_orientation(image: np.ndarray, source_path: str | None = None) -> np.ndarray:
    try:
        import io

        from PIL import Image

        if source_path:
            with open(source_path, "rb") as f:
                buf = f.read()
            pil_image = Image.open(io.BytesIO(buf))
            exif = pil_image.getexif()
            orientation = exif.get(0x0112, 1)
            if orientation == 3:
                image = cv2.rotate(image, cv2.ROTATE_180)
            elif orientation == 6:
                image = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
            elif orientation == 8:
                image = cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    except Exception:
        pass
    return image
