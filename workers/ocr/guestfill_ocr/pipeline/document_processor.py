"""Process a single document through the OCR pipeline."""

from guestfill_ocr.classification.document_classifier import classify_document
from guestfill_ocr.common.result import Err, Ok, Result
from guestfill_ocr.common.time_utils import Timer
from guestfill_ocr.extraction.confidence_engine import (
    calculate_id_card_confidence,
    calculate_passport_confidence,
    determine_status,
    get_confidence_level,
)
from guestfill_ocr.extraction.field_extractor import build_guest_row
from guestfill_ocr.extraction.warning_engine import collect_warnings, join_warnings
from guestfill_ocr.id_card.id_card_ocr import process_id_card
from guestfill_ocr.image.image_loader import load_image
from guestfill_ocr.image.orientation import fix_exif_orientation
from guestfill_ocr.image.paddleocr_preprocess import preprocess_for_paddleocr
from guestfill_ocr.image.preprocess import preprocess_pipeline, to_grayscale
from guestfill_ocr.image.quality_analyzer import analyze_quality
from guestfill_ocr.image.resize import resize_keep_ratio
from guestfill_ocr.ocr.ocr_candidate import generate_ocr_candidates
from guestfill_ocr.ocr.ocr_selector import (
    check_paddleocr_available,
    select_best_candidate_with_engine,
)
from guestfill_ocr.ocr.paddleocr_engine import SUPPORTED_PPOCR_LANGS
from guestfill_ocr.passport.mrz_cropper import generate_all_candidates
from guestfill_ocr.passport.mrz_parser import detect_mrz_format, parse_mrz_lines
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
    is_id_card = False
    engine_used = "tesseract"
    candidate_warnings: list[str] = []

    if doc_type == "PASSPORT":
        prefer_paddle = options.get("preferPaddleocr", True)
        paddle_avail = prefer_paddle and check_paddleocr_available()
        if paddle_avail:
            processed = preprocess_for_paddleocr(image)
            processed_gray = to_grayscale(processed)
            mrz_candidates = generate_all_candidates(processed_gray)
        else:
            processed = preprocess_pipeline(gray)
            mrz_candidates = generate_all_candidates(processed)
        ocr_candidate_inputs = [
            {
                "image": c.image,
                "preprocessing": c.preprocessing,
                "source": c.source,
                "crop_ratio": c.crop_ratio,
            }
            for c in mrz_candidates
        ]
        candidates = generate_ocr_candidates(ocr_candidate_inputs)
        paddle_languages: list[str] = ["ml"]
        paddle_languages.extend(lang for lang in SUPPORTED_PPOCR_LANGS if lang != "ml")
        best_candidate, candidate_warnings, engine_used = select_best_candidate_with_engine(
            candidates,
            timeout=options.get("perCandidateTimeoutSeconds", 8),
            languages=paddle_languages if paddle_avail else None,
        )

        if best_candidate and len(best_candidate.cleaned_lines) >= 2:
            raw_lines = best_candidate.cleaned_lines
            line1 = raw_lines[0] if len(raw_lines) >= 1 else ""
            line2 = raw_lines[1] if len(raw_lines) >= 2 else ""
            line3 = raw_lines[2] if len(raw_lines) >= 3 else None

            repaired = try_repair_mrz(line1, line2, line3)
            repaired_lines, repair_warnings = repaired

            line1 = repaired_lines[0] if len(repaired_lines) >= 1 else ""
            line2 = repaired_lines[1] if len(repaired_lines) >= 2 else ""
            line3 = repaired_lines[2] if len(repaired_lines) >= 3 else None

            mrz_lines = [ln for ln in [line1, line2, line3] if ln]

            format_type = detect_mrz_format(line1, line2, line3)
            if format_type == "TD1" and line3:
                mrz_fields = parse_mrz_lines(line1, line2, line3)
            else:
                mrz_fields = parse_mrz_lines(line1, line2)

            check_digits = mrz_fields.get("check_digits", {})
            has_valid_content = bool(mrz_fields.get("surname") or mrz_fields.get("passport_number"))
            if has_valid_content:
                has_mrz = True
                result_fields = build_guest_row(source_file=file_path, mrz_fields=mrz_fields)

        if result_fields is None:
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
        is_id_card = True
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
        engine_warnings=candidate_warnings,
    )

    if is_id_card:
        has_id_fields = bool(result_fields.get("id_number") or result_fields.get("full_name"))
        has_dob = bool(result_fields.get("date_of_birth"))
        has_number = bool(result_fields.get("id_number"))
        confidence_score = calculate_id_card_confidence(
            qr_found=False,
            ocr_fields_found=has_id_fields,
            layout_recognized=True,
            date_valid=has_dob,
            number_valid=has_number,
            image_quality=quality,
            warnings=warnings_list,
            qr_conflict=False,
        )
    elif has_mrz:
        lines_valid = len(mrz_lines) >= 2 and all(len(ln) in (30, 36, 44) for ln in mrz_lines)
        confidence_score = calculate_passport_confidence(
            has_mrz=has_mrz,
            lines_valid=lines_valid,
            check_digits=check_digits,
            image_quality=quality,
            warnings=warnings_list,
            repair_used=bool(repair_warnings),
            visual_used=visual_used,
            engine_used=engine_used,
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
        "selected_ocr_engine": engine_used,
        "selected_candidate": f"mrz_{engine_used}_{'found' if has_mrz else 'not_found'}",
        "candidate_score": confidence_score,
        "validation_summary": ";".join(check_digits.get("errors", [])),
        "warnings": result_fields["ocr_warning"],
    }

    return Ok({"row": result_fields, "diagnostic": diagnostic})
