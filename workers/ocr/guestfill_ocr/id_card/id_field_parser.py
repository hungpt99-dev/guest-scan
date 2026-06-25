"""Parse ID card fields from OCR text."""

import re


def parse_id_card_fields(text: str) -> dict:
    fields = {
        "full_name": "",
        "id_number": "",
        "nationality": "",
        "date_of_birth": "",
        "gender": "UNKNOWN",
        "address": "",
        "issue_date": "",
        "expiry_date": "",
        "issuing_authority": "",
        "document_type": "ID_CARD",
    }
    lines = text.splitlines()
    for line in lines:
        upper = line.strip().upper()
        m = re.search(r"(?:ID|IDENTITY|CITIZEN|NATIONAL)\s*(?:CARD|NO|NUMBER|ID)[\s:#.]*([A-Z0-9]+)", upper)
        if m:
            fields["id_number"] = m.group(1)
        m = re.search(r"(?:FULL\s*)?NAME[\s:#.]*(.+)", upper)
        if m:
            fields["full_name"] = m.group(1).strip()
        m = re.search(r"DOB[\s:#.]*([\d/.-]+)", upper)
        if m:
            fields["date_of_birth"] = m.group(1).strip()
        m = re.search(r"SEX[\s:#.]*([MF])", upper)
        if m:
            fields["gender"] = m.group(1)
        m = re.search(r"NATIONALITY[\s:#.]*([A-Z]+)", upper)
        if m:
            fields["nationality"] = m.group(1)
        m = re.search(r"(?:ISSUE|ISSUED|DATE\s*OF\s*ISSUE)[\s:#.]*([\d/.-]+)", upper)
        if m:
            fields["issue_date"] = m.group(1).strip()
        m = re.search(r"(?:EXPIRY|EXPIRES|DATE\s*OF\s*EXPIRY)[\s:#.]*([\d/.-]+)", upper)
        if m:
            fields["expiry_date"] = m.group(1).strip()

    return fields
