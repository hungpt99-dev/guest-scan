"""Excel column definitions."""

GUEST_COLUMNS = [
    "row_id",
    "full_name",
    "surname",
    "given_name",
    "passport_number",
    "id_number",
    "nationality",
    "date_of_birth",
    "gender",
    "passport_expiry_date",
    "id_expiry_date",
    "issuing_country",
    "issuing_authority",
    "document_type",
    "room_number",
    "arrival_date",
    "departure_date",
    "reservation_code",
    "status",
    "confidence_score",
    "confidence_level",
    "note",
    "ocr_warning",
    "source_file",
]

ERROR_COLUMNS = ["row_id", "source_file", "error_code", "error_message", "technical_detail"]

DIAGNOSTIC_COLUMNS = [
    "row_id",
    "source_file",
    "document_type_detected",
    "processing_time_ms",
    "image_width",
    "image_height",
    "blur_score",
    "brightness",
    "contrast",
    "selected_ocr_engine",
    "selected_candidate",
    "candidate_score",
    "validation_summary",
    "warnings",
]
