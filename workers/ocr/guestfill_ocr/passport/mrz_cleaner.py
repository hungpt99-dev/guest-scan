"""Clean MRZ OCR text."""

import re

MRZ_ALLOWED = re.compile(r"[^A-Z0-9<]")
MRZ_VALID_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<")


def clean_mrz_text(raw_text: str) -> list[str]:
    lines: list[str] = []
    for line in raw_text.splitlines():
        cleaned = line.strip().upper()
        cleaned = cleaned.replace(" ", "")
        cleaned = cleaned.replace("\t", "")
        cleaned = MRZ_ALLOWED.sub("", cleaned)
        if len(cleaned) >= 20:
            lines.append(cleaned)
    return lines


def is_mrz_line(line: str) -> bool:
    if len(line) < 20:
        return False
    valid_count = sum(1 for ch in line if ch in MRZ_VALID_CHARS)
    return valid_count / len(line) >= 0.9


def has_mrz_pattern(text: str) -> bool:
    cleaned = clean_mrz_text(text)
    mrz_like = [ln for ln in cleaned if is_mrz_line(ln)]
    return len(mrz_like) >= 2
