"""Process a single document through the OCR pipeline."""

from guestfill_ocr.classification.document_classifier import classify_document
from guestfill_ocr.common.result import Err, Ok, Result
from guestfill_ocr.common.time_utils import Timer
from guestfill_ocr.extraction.confidence_engine import (
    calculate_passport_confidence,
    determine_status,
    get_confidence_level,
)
from guestfill_ocr.extraction.field_extractor import build_guest_row
from guestfill_ocr.extraction.warning_engine import collect_warnings, join_warnings
from guestfill_ocr.id_card.id_card_ocr import process_id_card
from guestfill_ocr.image.image_loader import load_image
from guestfill_ocr.image.orientation import fix_exif_orientation
from guestfill_ocr.image.preprocess import preprocess_pipeline, to_grayscale
from guestfill_ocr.image.quality_analyzer import analyze_quality
from guestfill_ocr.image.resize import resize_keep_ratio
from guestfill_ocr.ocr.ocr_selector import select_best_candidate_sync
from guestfill_ocr.passport.mrz_cropper import generate_all_candidates
from guestfill_ocr.passport.mrz_parser import parse_mrz_lines
from guestfill_ocr.passport.mrz_repair import try_repair_mrz
from guestfill_ocr.passport.passport_visual_ocr import run_passport_visual_ocr


def process_document(file_path: str, options: dict) -> Result:
    timer = Timer()
    timer.start()

    img_result = load_image(file_path)
    if img_result.is_err():
        return Err(img_result.unwrap_err())

    image = img_result.unwrap()
    image = fix_exif_orientation(image, file_path)
    image = resize_keep_ratio(image, max_width=options.get("maxImageWidth", 1800))
    gray = to_grayscale(image)

    quality = analyze_quality(gray)
    classification = classify_document(gray, mode=options.get("documentMode", "auto"))

    doc_type = classification.get("document_type", "UNKNOWN")
    result_fields = None
    mrz_lines = []
    check_digits = {}
    repair_warnings: list[str] = []
    visual_used = False
    has_mrz = False

    if doc_type == "PASSPORT":
        processed = preprocess_pipeline(gray)
        candidates = generate_all_candidates(processed)
        best_candidate, candidate_warnings = select_best_candidate_sync(
            candidates, timeout=options.get("perCandidateTimeoutSeconds", 8)
        )

        if best_candidate and len(best_candidate.cleaned_lines) >= 2:
            has_mrz = True
            raw_lines = best_candidate.cleaned_lines
            line1 = raw_lines[0] if len(raw_lines) >= 1 else ""
            line2 = raw_lines[1] if len(raw_lines) >= 2 else ""
            repaired_lines, repair_warnings = try_repair_mrz(line1, line2)
            line1, line2 = repaired_lines[0], repaired_lines[1]
            mrz_lines = [line1, line2]
            mrz_fields = parse_mrz_lines(line1, line2)
            check_digits = mrz_fields.get("check_digits", {})
            result_fields = build_guest_row(source_file=file_path, mrz_fields=mrz_fields)
        else:
            if options.get("enablePassportVisualOcr", True):
                visual_result = run_passport_visual_ocr(file_path)
                if visual_result.is_ok():
                    visual_used = True
                    visual_fields = visual_result.unwrap()
                    result_fields = build_guest_row(source_file=file_path, visual_fields=visual_fields)
            if result_fields is None:
                result_fields = build_guest_row(source_file=file_path)
                result_fields["status"] = "FAILED"

    elif doc_type == "ID_CARD" and options.get("enableIdCardOcr", True):
        id_result = process_id_card(gray, file_path)
        if id_result.is_ok():
            id_fields = id_result.unwrap()
            result_fields = build_guest_row(source_file=file_path, id_fields=id_fields)

    if result_fields is None:
        result_fields = build_guest_row(source_file=file_path)
        result_fields["status"] = "FAILED"

    warnings_list = collect_warnings(
        classification=classification,
        quality=quality,
        mrz_lines=mrz_lines,
        check_digits=check_digits,
        fields=result_fields,
        repair_warnings=repair_warnings,
        visual_used=visual_used,
    )

    if has_mrz:
        lines_valid = len(mrz_lines) >= 2 and all(len(l) == 44 for l in mrz_lines)
        confidence_score = calculate_passport_confidence(
            has_mrz=has_mrz,
            lines_valid=lines_valid,
            check_digits=check_digits,
            image_quality=quality,
            warnings=warnings_list,
            repair_used=bool(repair_warnings),
            visual_used=visual_used,
        )
    else:
        confidence_score = 0.0

    result_fields["confidence_score"] = round(confidence_score, 2)
    result_fields["confidence_level"] = get_confidence_level(confidence_score)

    has_fatal = any(
        w in warnings_list for w in ["IMAGE_LOAD_FAILED", "IMAGE_UNREADABLE", "OCR_FAILED", "PDF_RENDER_FAILED"]
    )
    status = determine_status(confidence_score, warnings_list, has_fatal_error=has_fatal)
    result_fields["status"] = status
    result_fields["ocr_warning"] = join_warnings(warnings_list)

    processing_time_ms = timer.stop()

    diagnostic = {
        "row_id": result_fields["row_id"],
        "source_file": file_path,
        "document_type_detected": doc_type,
        "processing_time_ms": processing_time_ms,
        "image_width": quality["width"],
        "image_height": quality["height"],
        "blur_score": quality["blur_score"],
        "brightness": quality["brightness"],
        "contrast": quality["contrast"],
        "selected_ocr_engine": "tesseract",
        "selected_candidate": f"mrz_psm6_{'found' if has_mrz else 'not_found'}",
        "candidate_score": confidence_score,
        "validation_summary": ";".join(check_digits.get("errors", [])),
        "warnings": result_fields["ocr_warning"],
    }

    return Ok({"row": result_fields, "diagnostic": diagnostic})
