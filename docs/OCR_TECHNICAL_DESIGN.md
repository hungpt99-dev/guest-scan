# OCR Technical Design

> **Status: Implemented (PaddleOCR primary, Tesseract fallback)**

This document describes the OCR worker architecture, image processing pipeline, PaddleOCR (primary) and Tesseract (fallback) engine integration, and data extraction strategies.

## Architecture

The OCR worker is a Python CLI application organized into modular packages:

```
guestfill_ocr/
  cli/              CLI argument parsing, request/response/progress I/O
  config/           Default configuration, country codes, document rules
  input/            File discovery, validation, PDF rendering
  image/            Image loading, preprocessing, quality analysis, cropping, PaddleOCR preprocess
  classification/   Document type detection (passport, ID card)
  passport/         MRZ crop, OCR, cleaning, parsing, validation, repair, visual fallback
  id_card/          ID card detection, OCR, QR/barcode reading, field parsing
  ocr/              PaddleOCR engine wrapper, Tesseract engine wrapper, candidate scoring and selection
  extraction/       Field normalization, validation, confidence engine, warning engine
  excel/            Excel export with Guests, Errors, Instructions, Diagnostics sheets
  pipeline/         Job runner, batch processor, document processor, result builder
  storage/          Temporary file management, output path management
  security/         Sensitive data masking, privacy-safe logging
  observability/    Logging, metrics, diagnostic reporting
  common/           Shared utilities: errors, result type, constants, time utils
```

## Supported Input

- Images: `.jpg`, `.jpeg`, `.png`, `.webp`, `.tiff`, `.tif`, `.bmp`
- PDF: rendered to images at 300 DPI via pdf2image

## Processing Pipeline

1. File discovery and validation
2. PDF rendering (if applicable)
3. Image loading and EXIF orientation fix
4. Image quality analysis (blur, brightness, contrast, skew, glare)
5. Document type classification
6. Passport MRZ pipeline:
   - MRZ candidate generation (bottom crops, morphological band detection)
   - PaddleOCR as primary OCR engine with multi-language support (17 languages)
   - Multi-language fallback: tries multilingual model first, then specific country languages
   - Tesseract OCR as fallback when PaddleOCR is unavailable or produces poor results
   - Candidate scoring and selection with PaddleOCR confidence bonus
   - MRZ line finding and cleaning
   - MRZ parsing (TD3, TD2, TD1 formats)
   - Check digit validation (passport number, DOB, expiry, optional, final composite)
   - Safe MRZ repair using check digit verification
   - Field extraction
7. Passport visual OCR fallback (when MRZ fails)
8. ID card OCR pipeline (when ID card detected)
9. Field normalization and validation
10. Confidence scoring and warning generation
11. Excel export with formatted sheets

## MRZ Format (TD3)

- Line 1 length: 44 characters
- Line 2 length: 44 characters
- Character set: A-Z, 0-9, `<`

## Check Digit Validation

- Weights: [7, 3, 1]
- Character values: 0-9=0-9, A-Z=10-35, <=0
- Fields validated: passport number, DOB, expiry date, optional data, final composite

## Confidence System

- Range: 0.00 to 1.00
- Levels: HIGH >= 0.90, MEDIUM >= 0.70, LOW < 0.70
- Status: READY (high confidence, no warnings), NEED_REVIEW (any issue), FAILED (fatal error)

## Warning Codes

Join multiple warnings with semicolons. All warning codes defined in `common/constants.py`.

## Excel Export

Four sheets:

- **Guests:** Extracted data with status, confidence, warnings, source file
- **Errors:** Per-file error details
- **Instructions:** User review instructions
- **Diagnostics:** Per-file processing metrics

Formatting: frozen headers, filters, color-coded status, dropdown validation.

## Communication

The OCR worker communicates via JSON files:

- **Request JSON:** Input paths, output path, options
- **Response JSON:** Status, summary, error list
- **Progress JSON:** Per-file progress updates (optional)
