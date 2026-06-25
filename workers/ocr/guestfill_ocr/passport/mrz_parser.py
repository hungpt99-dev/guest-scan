"""Parse MRZ lines into guest fields."""

from datetime import datetime

from guestfill_ocr.passport.mrz_validator import validate_check_digits


def parse_mrz_lines(line1: str, line2: str) -> dict:
    validation = validate_check_digits(line1, line2)
    fields = {
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
        "check_digits": validation,
    }
    if len(line1) < 44 or len(line2) < 44:
        return fields

    fields["issuing_country"] = line1[2:5].replace("<", "")

    name_field = line1[5:44]
    name_parts = name_field.split("<<")
    if len(name_parts) >= 1:
        fields["surname"] = name_parts[0].replace("<", " ").strip()
    if len(name_parts) >= 2:
        given_raw = "<".join(name_parts[1:])
        fields["given_name"] = given_raw.replace("<", " ").strip()
    surname = fields["surname"]
    given = fields["given_name"]
    if surname and given:
        fields["full_name"] = f"{surname} {given}"
    elif surname:
        fields["full_name"] = surname

    fields["passport_number"] = line2[0:9].replace("<", "")

    fields["nationality"] = line2[10:13]

    dob_raw = line2[13:19]
    fields["date_of_birth"] = _parse_mrz_date(dob_raw)

    gender_raw = line2[20:21]
    if gender_raw == "M":
        fields["gender"] = "M"
    elif gender_raw == "F":
        fields["gender"] = "F"

    expiry_raw = line2[21:27]
    fields["passport_expiry_date"] = _parse_mrz_date(expiry_raw)

    fields["optional_data"] = line2[28:42].replace("<", "").strip()

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
