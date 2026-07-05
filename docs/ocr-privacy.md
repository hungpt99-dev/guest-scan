# OCR Privacy and Security

This document describes privacy and security practices for the OCR feature in Guest Fill.

## Overview

The OCR feature can extract guest information from passport/ID document images. Because passport and ID data is highly sensitive, the feature is designed with privacy and security as core requirements.

## Data Handling

### Images

- **Not stored persistently.** Document images are used only for OCR processing and discarded afterward.
- **Temporary files** are created in the system temp directory during processing and cleaned up immediately after:
  - On success: cleaned when `clearExtractedData()` is called or a new OCR job starts.
  - On error: cleaned on the next `clearExtractedData()` call.
- **Not uploaded.** Images are NOT uploaded to any third-party service by default.
- **Azure OCR:** When Azure OCR is selected, the image is sent to Azure Document Intelligence for processing. This requires explicit user action and is not the default.

### Extracted Data

- **In-memory only.** Extracted fields (name, passport number, etc.) exist in application state and are never persisted to disk by the OCR feature itself.
- **User review required.** Extracted data must be reviewed and confirmed before it is saved to any guest record.
- **Cleared on demand.** Users can clear all extracted data at any time via the "Clear" button in the UI.

## Logging and Telemetry

### What is NOT logged

The following are NEVER written to logs:

- Full passport numbers
- Full ID numbers
- Full names
- Date of birth values
- MRZ codes
- Raw OCR text
- Source document images
- API keys

### What IS logged

Log entries contain only:

- OCR provider type (local / azure)
- Number of fields extracted
- Overall confidence score
- Warning codes (expired document, low confidence, etc.)
- Processing time in milliseconds

### Masking

All sensitive values are masked before logging:

```
A12345678 → A123****
John Smith → John S****
1990-01-01 → [REDACTED]
```

The masking is applied via the `sanitizeLogContext` method in `OcrController` (`src/ocr/ocr-controller.ts`) and by the `maskPassportNumber`/`maskFullName` utilities used directly in provider log calls. Sensitive fields are recognized by key name pattern and replaced before logging.

## API Key Security

### Azure OCR

- **Azure API keys are NEVER exposed in frontend code.**
- The Azure OCR provider communicates with the Rust backend via Tauri's `invoke` API, sending only the image path.
- The Rust backend reads the Azure API key from secure environment variables or OS keychain - the key never crosses the JavaScript/Rust boundary.
- The frontend only knows whether a key is configured (`azureApiKeyStored: boolean`), never the key value itself.

### Local OCR

- No API keys are needed. All processing happens locally using Tesseract.js.

## User Controls

| Control             | Description                                                                   |
| ------------------- | ----------------------------------------------------------------------------- |
| **Clear Data**      | Removes all extracted OCR data and the temp image file from application state |
| **Retry OCR**       | Re-processes the same image (useful after adjusting camera/lighting)          |
| **Edit Fields**     | Each extracted field can be manually edited before confirmation               |
| **Provider Switch** | User can choose between Local OCR and Azure OCR at processing time            |
| **Cancel OCR**      | Aborts an ongoing OCR operation                                               |

## Provider Comparison

| Aspect      | Local OCR                | Azure OCR                      |
| ----------- | ------------------------ | ------------------------------ |
| Network     | None (fully offline)     | Sends image to Azure           |
| Key storage | N/A                      | Backend env / keychain only    |
| Accuracy    | Lower (must be reviewed) | Higher (structured extraction) |
| Default     | Yes                      | No (opt-in only)               |
| Data sent   | Nothing                  | Document image only            |

## Recommended Practices

1. Use **Local OCR** as the default for speed and privacy.
2. Switch to **Azure OCR** only when higher accuracy is needed.
3. Always review extracted data before saving.
4. Clear OCR data after use.
5. Do not store document images outside the app.
6. Configure Azure credentials via environment variables, never in frontend config files.

## Related Documents

- [Privacy Policy](PRIVACY.md) — General privacy practices for the full application
- [Security](SECURITY.md) — Security rules and environment variable reference
- [OCR Feature Design](ocr-feature-design.md) — Technical architecture of the OCR feature
