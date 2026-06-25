"""Privacy-safe logging wrapper that masks sensitive data."""

import logging

from guestfill_ocr.security.sensitive_masking import (
    mask_date_of_birth,
    mask_full_name,
    mask_id_number,
    mask_passport_number,
    mask_string,
)

SENSITIVE_KEYS = {
    "passport_number",
    "id_number",
    "full_name",
    "surname",
    "given_name",
    "date_of_birth",
    "passport_expiry_date",
    "id_expiry_date",
    "issuing_country",
    "issuing_authority",
    "nationality",
}


def sanitize_dict(data: dict) -> dict:
    sanitized = {}
    for key, value in data.items():
        if key in SENSITIVE_KEYS and isinstance(value, str) and value:
            if key in ("passport_number",):
                sanitized[key] = mask_passport_number(value)
            elif key in ("id_number",):
                sanitized[key] = mask_id_number(value)
            elif key in ("full_name", "surname", "given_name"):
                sanitized[key] = mask_full_name(value)
            elif key in ("date_of_birth", "passport_expiry_date", "id_expiry_date"):
                sanitized[key] = mask_date_of_birth(value)
            else:
                sanitized[key] = mask_string(value)
        else:
            sanitized[key] = value
    return sanitized


class SafeLogger:
    def __init__(self, logger: logging.Logger):
        self._logger = logger

    def info(self, message: str, sensitive_data: dict | None = None) -> None:
        if sensitive_data:
            self._logger.info("%s | data=%s", message, sanitize_dict(sensitive_data))
        else:
            self._logger.info(message)

    def warn(self, message: str, sensitive_data: dict | None = None) -> None:
        if sensitive_data:
            self._logger.warning("%s | data=%s", message, sanitize_dict(sensitive_data))
        else:
            self._logger.warning(message)

    def error(self, message: str, sensitive_data: dict | None = None) -> None:
        if sensitive_data:
            self._logger.error("%s | data=%s", message, sanitize_dict(sensitive_data))
        else:
            self._logger.error(message)

    def debug(self, message: str, sensitive_data: dict | None = None) -> None:
        if sensitive_data:
            self._logger.debug("%s | data=%s", message, sanitize_dict(sensitive_data))
        else:
            self._logger.debug(message)
