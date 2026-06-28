"""Extract and normalize fields from raw OCR data."""

from datetime import UTC, datetime

from guestfill_ocr.extraction.field_normalizer import (
    normalize_country,
    normalize_date,
    normalize_gender,
    normalize_id_number,
    normalize_name,
    normalize_passport_number,
)


def build_guest_row(
    source_file: str,
    mrz_fields: dict | None = None,
    visual_fields: dict | None = None,
    id_fields: dict | None = None,
) -> dict:
    row_id = f"ROW_{datetime.now(UTC).strftime('%Y%m%d_%H%M%S_%f')}"
    row = {
        "row_id": row_id,
        "full_name": "",
        "surname": "",
        "given_name": "",
        "passport_number": "",
        "id_number": "",
        "nationality": "",
        "date_of_birth": "",
        "gender": "UNKNOWN",
        "passport_expiry_date": "",
        "id_expiry_date": "",
        "issuing_country": "",
        "issuing_authority": "",
        "document_type": "UNKNOWN",
        "room_number": "",
        "arrival_date": "",
        "departure_date": "",
        "reservation_code": "",
        "status": "NEED_REVIEW",
        "confidence_score": 0.0,
        "confidence_level": "LOW",
        "note": "",
        "ocr_warning": "",
        "source_file": source_file,
    }

    if mrz_fields:
        row["document_type"] = "PASSPORT"
        row["surname"] = normalize_name(mrz_fields.get("surname", ""))
        row["given_name"] = normalize_name(mrz_fields.get("given_name", ""))
        row["full_name"] = normalize_name(mrz_fields.get("full_name", ""))
        row["passport_number"] = normalize_passport_number(mrz_fields.get("passport_number", ""))
        row["nationality"] = normalize_country(mrz_fields.get("nationality", ""))
        row["date_of_birth"] = normalize_date(mrz_fields.get("date_of_birth", ""))
        row["gender"] = normalize_gender(mrz_fields.get("gender", ""))
        row["passport_expiry_date"] = normalize_date(mrz_fields.get("passport_expiry_date", ""))
        row["issuing_country"] = normalize_country(mrz_fields.get("issuing_country", ""))

    elif visual_fields:
        row["document_type"] = "PASSPORT"
        row["surname"] = normalize_name(visual_fields.get("surname", ""))
        row["given_name"] = normalize_name(visual_fields.get("given_name", ""))
        row["full_name"] = normalize_name(visual_fields.get("full_name", ""))
        row["passport_number"] = normalize_passport_number(visual_fields.get("passport_number", ""))
        row["nationality"] = normalize_country(visual_fields.get("nationality", ""))
        row["date_of_birth"] = normalize_date(visual_fields.get("date_of_birth", ""))
        row["gender"] = normalize_gender(visual_fields.get("gender", ""))
        row["passport_expiry_date"] = normalize_date(visual_fields.get("passport_expiry_date", ""))

    elif id_fields:
        row["document_type"] = "ID_CARD"
        row["full_name"] = normalize_name(id_fields.get("full_name", ""))
        row["id_number"] = normalize_id_number(id_fields.get("id_number", ""))
        row["nationality"] = normalize_country(id_fields.get("nationality", ""))
        row["date_of_birth"] = normalize_date(id_fields.get("date_of_birth", ""))
        row["gender"] = normalize_gender(id_fields.get("gender", ""))
        row["id_expiry_date"] = normalize_date(id_fields.get("expiry_date", ""))

    return row
