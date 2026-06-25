"""Logging setup for the OCR worker."""

import logging


def setup_logging(level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger("guestfill_ocr")
    logger.setLevel(level)

    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setLevel(level)
        formatter = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger
