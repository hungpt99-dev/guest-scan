"""Privacy guard to prevent sensitive data leakage."""

import re

SENSITIVE_PATTERNS = [
    re.compile(r"\b[A-Z]{1}\d{8}\b"),
    re.compile(r"\b\d{9,12}\b"),
    re.compile(r"\b\d{2}[/-]\d{2}[/-]\d{4}\b"),
    re.compile(r"\b\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\b"),
]


def contains_sensitive_data(text: str) -> bool:
    for pattern in SENSITIVE_PATTERNS:
        if pattern.search(text):
            return True
    return False


def strip_sensitive_data(text: str) -> str:
    for pattern in SENSITIVE_PATTERNS:
        text = pattern.sub("***REDACTED***", text)
    return text
