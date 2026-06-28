"""Passport visual zone OCR fallback when MRZ is unavailable."""

from guestfill_ocr.common.errors import OcrError
from guestfill_ocr.common.result import Err, Ok, Result
from guestfill_ocr.ocr.tesseract_engine import run_tesseract_ocr
from guestfill_ocr.passport.mrz_parser import parse_mrz_lines
from guestfill_ocr.passport.mrz_repair import try_repair_mrz


def _clean_ocr_line(raw: str) -> str:
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<")
    cleaned = raw.strip().upper()
    cleaned = cleaned.replace(" ", "").replace("\t", "")
    cleaned = "".join(ch for ch in cleaned if ch in allowed)
    return cleaned


def _find_mrz_from_text(text: str) -> list[str]:
    lines = text.splitlines()
    candidates: list[tuple[float, str, str]] = []

    for i in range(len(lines) - 1):
        l1 = _clean_ocr_line(lines[i])
        l2 = _clean_ocr_line(lines[i + 1])
        if len(l1) < 20 or len(l2) < 20:
            continue
        score = 0.0
        if l1.startswith("P<"):
            score += 30.0
        elif l1.startswith("P") and len(l1) > 2:
            score += 10.0
        if l1.count("<") >= 5:
            score += 10.0
        if len(l1) >= 40:
            score += 20.0
        if len(l2) >= 40:
            score += 20.0
        digit_count = sum(1 for ch in l2 if ch.isdigit())
        if digit_count >= 10:
            score += 15.0
        if score > 0:
            candidates.append((score, l1, l2))

    candidates.sort(key=lambda x: x[0], reverse=True)

    if candidates:
        _, l1, l2 = candidates[0]
        l1 = _pad_mrz_line(l1, 44)
        l2 = _pad_mrz_line(l2, 44)
        return [l1, l2]
    return []


def _pad_mrz_line(line: str, target: int) -> str:
    if len(line) == target:
        return line
    if len(line) > target:
        trailing_noise = line[target:]
        if all(ch.isalpha() for ch in trailing_noise):
            return line[:target]
        return line[:target]
    if len(line) < target:
        return line + "<" * (target - len(line))
    return line


def _clean_mrz_field(value: str) -> str:
    cleaned = value.replace("<", " ").strip()
    cleaned = " ".join(cleaned.split())
    parts = cleaned.split()
    clean_parts = []
    for p in parts:
        if not p.isalpha():
            continue
        if len(p) > 15:
            continue
        distinct = len(set(p))
        if distinct < 3 and len(p) > 3:
            continue
        if all(c == p[0] for c in p):
            continue
        clean_parts.append(p)
    return " ".join(clean_parts) if clean_parts else ""


def run_passport_visual_ocr(image_path: str) -> Result:
    try:
        ocr_result = run_tesseract_ocr(image_path, psm=3)
        if ocr_result.is_err():
            return Err(ocr_result.unwrap_err())
        text = ocr_result.unwrap()
        fields = _extract_visual_fields(text)

        mrz_lines = _find_mrz_from_text(text)
        if len(mrz_lines) >= 2:
            repaired, _warnings = try_repair_mrz(mrz_lines[0], mrz_lines[1])
            l1 = _pad_mrz_line(repaired[0], 44)
            l2 = _pad_mrz_line(repaired[1], 44)
            mrz_fields = parse_mrz_lines(l1, l2)
            if mrz_fields.get("surname") or mrz_fields.get("passport_number"):
                for key in (
                    "surname",
                    "given_name",
                    "full_name",
                    "passport_number",
                    "nationality",
                    "date_of_birth",
                    "gender",
                    "passport_expiry_date",
                ):
                    if mrz_fields.get(key):
                        val = mrz_fields[key]
                        if key in ("surname", "given_name", "full_name"):
                            val = _clean_mrz_field(val)
                        fields[key] = val

        return Ok(fields)
    except Exception as e:
        return Err(OcrError("OCR_FAILED", f"Visual OCR failed: {e}", source_file=image_path))


def _extract_visual_fields(text: str) -> dict:
    import re

    fields: dict = {
        "surname": "",
        "given_name": "",
        "full_name": "",
        "passport_number": "",
        "nationality": "",
        "date_of_birth": "",
        "gender": "UNKNOWN",
        "passport_expiry_date": "",
        "issuing_country": "",
    }
    lines = text.splitlines()
    for i, line in enumerate(lines):
        line_upper = line.strip().upper()

        m = re.search(r"PASSPORT\s*(?:NO|N[.:]?|#)?\s*[A-Z]?\s*[A-Z]{3}\s*([A-Z0-9]+)", line_upper)
        if m:
            raw = m.group(1)
            cleaned = re.sub(r"[^A-Z0-9]", "", raw)
            if len(cleaned) >= 6:
                fields["passport_number"] = cleaned

        m = re.search(r"(?:SURNAME|SUR\b)\s*[.:]?\s*(.+)", line_upper)
        if m:
            val = m.group(1).strip()
            val = re.sub(r"[^A-Z ]", "", val)
            if val and val.upper() not in ("S", "NAME", "NAMES", ""):
                fields["surname"] = val

        m = re.search(r"GIVEN\s*NAMES?[.:]?\s*(.+)", line_upper)
        if m:
            val = m.group(1).strip()
            val = re.sub(r"[^A-Z ]", "", val)
            if val and val.upper() not in ("S", "NAME", "NAMES", ""):
                fields["given_name"] = val

        if not fields["surname"] and i + 1 < len(lines):
            m = re.search(r"(?:HO|SURNAME)\s*/?\s*(?:SURNAME)?\s*$", line_upper)
            if m:
                next_line = lines[i + 1].strip().upper()
                next_val = re.sub(r"[^A-Z ]", "", next_line)
                if next_val and len(next_val) <= 30:
                    fields["surname"] = next_val

        if not fields["given_name"] and i + 1 < len(lines):
            m = re.search(r"GIVEN\s*NAMES?\s*$", line_upper)
            if not m:
                m = re.search(r"TEN\s*/?\s*GIVEN", line_upper)
            if m:
                next_line = lines[i + 1].strip().upper()
                next_val = re.sub(r"[^A-Z ]", "", next_line)
                if next_val and len(next_val) <= 30:
                    fields["given_name"] = next_val

        m = re.search(r"NATIONALITY[.:]?\s*([A-Z]+)", line_upper)
        if m:
            val = m.group(1)
            if len(val) <= 5:
                fields["nationality"] = val

        m = re.search(r"DATE\s*OF\s*BIRTH[.:]?\s*([\d/.-]+)", line_upper)
        if m:
            fields["date_of_birth"] = m.group(1).strip()
        if not fields["date_of_birth"]:
            m = re.search(r"DATE\s*OF\s*BIRTH", line_upper)
            if m and i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                dm = re.search(r"(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})", next_line)
                if dm:
                    fields["date_of_birth"] = dm.group(1)

        m = re.search(r"\bSEX[.:]?\s*([MF])", line_upper)
        if m:
            fields["gender"] = m.group(1)

        m = re.search(r"DATE\s*OF\s*EXPIRY[.:]?\s*([\d/.-]+)", line_upper)
        if m:
            fields["passport_expiry_date"] = m.group(1).strip()

    if fields["surname"] and fields["given_name"]:
        fields["full_name"] = f"{fields['surname']} {fields['given_name']}"
    elif fields["surname"]:
        fields["full_name"] = fields["surname"]
    return fields
