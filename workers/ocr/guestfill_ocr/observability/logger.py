"""Observability logger."""

from guestfill_ocr.common.logging import setup_logging
from guestfill_ocr.security.safe_logging import SafeLogger

_logger_instance: SafeLogger | None = None


def get_logger() -> SafeLogger:
    global _logger_instance
    if _logger_instance is None:
        base_logger = setup_logging()
        _logger_instance = SafeLogger(base_logger)
    return _logger_instance
