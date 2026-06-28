"""Find MRZ lines from cleaned OCR text."""

import re

from guestfill_ocr.passport.mrz_cleaner import clean_mrz_text, is_mrz_line

TARGET_LINE_LENGTH = 44
ALLOWED_LENGTH_VARIATION = 2


def find_mrz_lines(raw_text: str) -> list[str]:
    cleaned = clean_mrz_text(raw_text)
    mrz_like = [ln for ln in cleaned if is_mrz_line(ln)]
    if not mrz_like:
        return []
    scored: list[tuple[float, list[str]]] = []
    for i in range(len(mrz_like) - 1):
        pair = mrz_like[i : i + 2]
        score = score_line_pair(pair)
        scored.append((score, pair))
    if not scored:
        if mrz_like:
            return [mrz_like[0]]
        return []
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]


def score_line_pair(pair: list[str]) -> float:
    if len(pair) < 2:
        return -100.0
    score = 0.0
    line1, line2 = pair[0], pair[1]
    length_score1 = _length_score(line1)
    length_score2 = _length_score(line2)
    score += length_score1 + length_score2
    if line1.startswith("P<") or line1.startswith("PC") or line1.startswith("PN"):
        score += 20.0
    if len(line1) >= 3 and line1[2:].startswith(("<", "A", "V")):
        score += 5.0
    if re.search(r"\d{6}", line2):
        score += 10.0

    filler_count1 = line1.count("<")
    filler_count2 = line2.count("<")
    if filler_count1 >= 5:
        score += 5.0
    if filler_count2 >= 5:
        score += 5.0
    return score


def _length_score(line: str) -> float:
    diff = abs(len(line) - TARGET_LINE_LENGTH)
    if diff == 0:
        return 40.0
    if diff <= ALLOWED_LENGTH_VARIATION:
        return 20.0
    return max(0.0, 20.0 - diff * 5)
