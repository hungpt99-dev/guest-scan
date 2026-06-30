"""Parse MRZ lines into guest fields.

Supports TD1 (3x30), TD2 (2x36), and TD3 (2x44) formats.
"""

from datetime import datetime

from guestfill_ocr.common.result import Err, Ok, Result
from guestfill_ocr.passport.mrz_validator import (
    validate_check_digits_td1,
    validate_check_digits_td2,
    validate_check_digits_td3,
)


def _pad_line(line: str, length: int) -> str:
    """Pad a line to the expected length with < characters."""
    if len(line) >= length:
        return line
    return line + "<" * (length - len(line))


def _try_parse_all(line1: str, line2: str, line3: str | None) -> dict:
    """Try all MRZ formats and return the one with the most data."""
    candidates: list[tuple[str, dict]] = []

    padded_td3_l1 = _pad_line(line1, 44)
    padded_td3_l2 = _pad_line(line2, 44)
    fields_td3 = _parse_td3(padded_td3_l1, padded_td3_l2)
    candidates.append(("TD3", fields_td3))

    padded_td2_l1 = _pad_line(line1, 36)
    padded_td2_l2 = _pad_line(line2, 36)
    fields_td2 = _parse_td2(padded_td2_l1, padded_td2_l2)
    candidates.append(("TD2", fields_td2))

    padded_td1_l1 = _pad_line(line1, 30)
    padded_td1_l2 = _pad_line(line2, 30)
    padded_td1_l3 = _pad_line(line3 if isinstance(line3, str) else "", 30)
    fields_td1 = _parse_td1(padded_td1_l1, padded_td1_l2, padded_td1_l3)
    candidates.append(("TD1", fields_td1))

    def score_fields(f: dict) -> int:
        score = 0
        if f.get("passport_number"):
            score += 10
        if f.get("surname"):
            score += 5
        if f.get("given_name"):
            score += 5
        if f.get("date_of_birth"):
            score += 5
        if f.get("passport_expiry_date"):
            score += 5
        if f.get("gender", "UNKNOWN") != "UNKNOWN":
            score += 3
        if f.get("nationality"):
            score += 3
        cd = f.get("check_digits", {})
        if cd.get("overall_valid"):
            score += 20
        return score

    best = max(candidates, key=lambda c: score_fields(c[1]))
    return best[1]


def parse_mrz_lines(line1: str, line2: str, line3: str | None = None) -> dict:
    format_type, _detected = _detect_format(line1, line2, line3)

    if format_type == "TD3":
        return _parse_td3(line1, line2)
    if format_type == "TD1":
        fields = _parse_td1(line1, line2, line3 if isinstance(line3, str) else "")
        has_data = bool(fields.get("passport_number") or fields.get("surname"))
        if has_data and fields.get("date_of_birth"):
            return fields
        all_fields = _try_parse_all(line1, line2, line3)
        td3_date = all_fields.get("date_of_birth", "")
        if td3_date or not has_data:
            return all_fields
        return fields
    if format_type == "TD2":
        return _parse_td2(line1, line2)

    return _try_parse_all(line1, line2, line3)


def parse_mrz_lines_result(line1: str, line2: str, line3: str | None = None) -> Result:
    format_type, detected = _detect_format(line1, line2, line3)

    if format_type == "TD3":
        fields = _parse_td3(line1, line2)
        return Ok(fields)
    if format_type == "TD1" and line3 is not None:
        fields = _parse_td1(line1, line2, line3)
        return Ok(fields)
    if format_type == "TD2":
        fields = _parse_td2(line1, line2)
        return Ok(fields)

    if format_type is None:
        fields = _try_parse_all(line1, line2, line3)
        has_data = bool(fields.get("passport_number") or fields.get("surname"))
        if has_data:
            return Ok(fields)
        return Err({"code": "MRZ_FORMAT_UNKNOWN", "message": "Could not determine MRZ format"})

    return Err({"code": "MRZ_FORMAT_UNKNOWN", "message": "Could not determine MRZ format"})


def detect_mrz_format(line1: str, line2: str, line3: str | None = None) -> str | None:
    fmt, _detected = _detect_format(line1, line2, line3)
    return fmt


def _detect_format(line1: str, line2: str, line3: str | None = None) -> tuple[str | None, str | None]:
    l1 = len(line1) if line1 else 0
    l2 = len(line2) if line2 else 0
    l3 = len(line3) if line3 else 0

    if l1 >= 44 and l2 >= 44:
        return "TD3", "TD3"
    if l1 >= 30 and l2 >= 30 and l3 >= 30:
        return "TD1", "TD1"
    if l1 >= 36 and l2 >= 36:
        return "TD2", "TD2"
    if l1 >= 30 and l2 >= 30:
        return "TD1", "TD1_INCOMPLETE"
    return None, None


def _empty_fields() -> dict:
    return {
        "document_type": "PASSPORT",
        "issuing_country": "",
        "surname": "",
        "given_name": "",
        "full_name": "",
        "passport_number": "",
        "nationality": "",
        "date_of_birth": "",
        "gender": "UNKNOWN",
        "passport_expiry_date": "",
        "optional_data": "",
        "check_digits": {},
    }


def _parse_name_field(name_field: str) -> tuple[str, str, str]:
    surname = ""
    given_name = ""
    name_parts = name_field.split("<<")
    if len(name_parts) >= 1:
        surname = name_parts[0].replace("<", " ").strip()
    if len(name_parts) >= 2:
        given_raw = "<".join(name_parts[1:])
        given_name = given_raw.replace("<", " ").strip()
    full_name = ""
    if surname and given_name:
        full_name = f"{surname} {given_name}"
    elif surname:
        full_name = surname
    return surname, given_name, full_name


def _parse_td3(line1: str, line2: str) -> dict:
    validation = validate_check_digits_td3(line1, line2)
    fields = _empty_fields()
    fields["check_digits"] = validation
    if len(line1) < 44 or len(line2) < 44:
        return fields

    fields["issuing_country"] = line1[2:5].replace("<", "")
    name_field = line1[5:44]
    surname, given_name, full_name = _parse_name_field(name_field)
    fields["surname"] = surname
    fields["given_name"] = given_name
    fields["full_name"] = full_name

    fields["passport_number"] = line2[0:9].replace("<", "")
    fields["nationality"] = line2[10:13]
    fields["date_of_birth"] = _parse_mrz_date(line2[13:19])
    gender_raw = line2[20:21]
    fields["gender"] = "M" if gender_raw == "M" else ("F" if gender_raw == "F" else "UNKNOWN")
    fields["passport_expiry_date"] = _parse_mrz_date(line2[21:27])
    fields["optional_data"] = line2[28:42].replace("<", "").strip()
    return fields


def _parse_td1(line1: str, line2: str, line3: str) -> dict:
    validation = validate_check_digits_td1(line1, line2, line3)
    fields = _empty_fields()
    fields["check_digits"] = validation

    if len(line1) < 30 or len(line2) < 30:
        return fields

    if line1.startswith("I<") or line1.startswith("ID"):
        fields["document_type"] = "ID_CARD"

    fields["issuing_country"] = line1[2:5].replace("<", "")
    name_field = line1[5:30]
    surname, given_name, full_name = _parse_name_field(name_field)
    fields["surname"] = surname
    fields["given_name"] = given_name
    fields["full_name"] = full_name

    fields["passport_number"] = line2[0:9].replace("<", "")
    fields["nationality"] = line2[10:13]
    fields["date_of_birth"] = _parse_mrz_date(line2[13:19])
    gender_raw = line2[20:21]
    fields["gender"] = "M" if gender_raw == "M" else ("F" if gender_raw == "F" else "UNKNOWN")
    fields["passport_expiry_date"] = _parse_mrz_date(line2[21:27])
    fields["optional_data"] = (line2[28:30] + line3[0:30]).replace("<", " ").strip()

    return fields


def _parse_td2(line1: str, line2: str) -> dict:
    validation = validate_check_digits_td2(line1, line2)
    fields = _empty_fields()
    fields["check_digits"] = validation

    if len(line1) < 36 or len(line2) < 36:
        return fields

    if line1.startswith("I<") or line1.startswith("ID"):
        fields["document_type"] = "ID_CARD"

    fields["issuing_country"] = line1[2:5].replace("<", "")
    name_field = line1[5:36]
    surname, given_name, full_name = _parse_name_field(name_field)
    fields["surname"] = surname
    fields["given_name"] = given_name
    fields["full_name"] = full_name

    fields["passport_number"] = line2[0:9].replace("<", "")
    fields["nationality"] = line2[10:13]
    fields["date_of_birth"] = _parse_mrz_date(line2[13:19])
    gender_raw = line2[20:21]
    fields["gender"] = "M" if gender_raw == "M" else ("F" if gender_raw == "F" else "UNKNOWN")
    fields["passport_expiry_date"] = _parse_mrz_date(line2[21:27])
    fields["optional_data"] = line2[28:35].replace("<", "").strip()
    return fields


def _parse_mrz_date(mrz_date: str) -> str:
    if not mrz_date or mrz_date.count("<") > 2:
        return ""
    clean = mrz_date.replace("<", "0")
    if len(clean) != 6:
        return ""
    try:
        dt = datetime.strptime(clean, "%y%m%d")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return ""
