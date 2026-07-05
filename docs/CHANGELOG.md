# Changelog

All notable changes to GuestFill are documented in this file.

## [0.5.0] - 2026-07-05

### Added

- **Dual OCR provider architecture (Local OCR + Azure OCR):**
  - `OcrController` — orchestrates OCR processing with provider abstraction, status tracking, and data mapping
  - `LocalOCRProvider` — free/offline OCR using Tesseract.js with MRZ parsing and visual field extraction
  - `AzureOCRProvider` — production OCR using Azure Document Intelligence for structured passport/ID extraction
  - `OCRProviderSelector` — UI component for choosing between Local and Azure OCR at runtime
- **Comprehensive OCR E2E test suite (771 lines):**
  - `tests/e2e/ocr-feature.test.ts` — provider selection, Local/Azure flows, provider switching, data review/correction, privacy safeguards, edge cases (expired documents, low confidence, ID cards)
- **OCR Privacy and Security:**
  - `docs/ocr-privacy.md` — data handling policies, logging restrictions, API key security
  - `OcrController.clearExtractedData()` — clears all OCR data and temp files on demand
  - `OcrController.sanitizeLogContext()` — redacts sensitive fields (passport numbers, names, DOB) from logs
  - `maskPassportNumber()` and `maskFullName()` — utilities for masking sensitive data in logs and UI
- **Field-level confidence scoring** — each extracted field carries a confidence score; low-confidence fields trigger warnings
- **Document expiry detection** — warns when documents are expired or expiring within 3 months
- **MRZ parsing and validation** — full TD1/TD3 MRZ support with check digit validation
- **Retry and cancellation** — users can retry OCR or cancel in-progress processing via AbortSignal
- **`OCRProviderSelector`** component with processing status display, error messages, and retry button

### Changed

- `packages/shared/src/types/ocr.ts` — added `OcrProviderType`, `ExtractedField`, `ExtractedFields`, `OcrResult`, `OcrProvider` interface, `OcrWarningCode`, `OcrProcessingOptions`
- `apps/desktop/src/features/ocr/` — added `ocrTypes.ts`, `ocrConstants.ts`, `ocrStore.ts`, `ocrApi.ts`
- `apps/desktop/src/services/ocr_provider.ts` — expanded with full provider abstraction, PaddleOCR integration, Tesseract fallback
- `apps/desktop/src/services/ocr_pipeline_service.ts` — 11-stage pipeline from quality check to staff review
- `apps/desktop/src/services/ocr_confidence_service.ts` — per-field confidence scoring with check digit, date, country, and document type validation
- `apps/desktop/src/services/ocr_warning_service.ts` — 18 warning codes with severity and categorization
- `apps/desktop/src/services/mrz_ocr_service.ts` — MRZ variant-based OCR with multi-engine fallback and validation scoring
- `apps/desktop/src/services/visual_ocr_service.ts` — visual zone OCR with field conflict resolution between MRZ and visual data
- `apps/desktop/src/ocr/` — engine wrappers for PaddleOCR, Tesseract.js, EasyOCR, and OcrEngineManager with multi-pass fallback
- `apps/desktop/src-tauri/src/commands/ocr_commands.rs` — Rust OCR command with Python worker orchestration
- `.env.example` — added `GUESTFILL_ENABLE_ONLINE_OCR` and `GUESTFILL_LOCAL_BRIDGE_PORT` variables

### Security

- Azure API keys are never exposed to frontend code — stored in Rust backend only
- Document images are temporary — cleaned up immediately after processing
- Sensitive fields redacted from all log output via key-name pattern matching
- Users must review and confirm extracted data before saving

## [0.4.0] - 2026-06-28

### Added

- **Autofill accuracy enhancement with confidence-aware safety checks:**
  - `safetyEngine.getFieldAccuracyInfo()` — per-field accuracy scoring with HIGH/MEDIUM/LOW levels, actionable issues
  - `safetyEngine.checkConfidence()` — gates on confidenceScore/confidenceLevel (HIGH ≥0.90 passes, MEDIUM/LOW fail with warnings)
  - `safetyEngine.checkFieldAccuracy()` — validates field formats: name length, passport/ID pattern, date validity/range, gender values, nationality/issuing country consistency, expired document detection
  - `copyAssistant.copyFieldWithWarning()` — pre-checks field accuracy before copy, returns warning if accuracy <70%
  - `copyAssistant.getFieldAccuracyLevel()` — returns per-field accuracy level, score, and issues
  - `copyAssistant.getAccuracySummary()` — aggregates accuracy into total/high/low counts with actionable warnings
  - `copyAssistant.getFieldsInOrder()` — each field now includes `accuracyLevel` and `accuracyScore` for UI rendering
- **Transform engine expansion:**
  - `strip` transform — removes non-alphanumeric characters (configurable character set)
  - `phone_format` transform — formats as local (last 10 digits) or international (+country code)
  - `country_format` expansion — 60+ ISO2↔ISO3 mappings, ISO3→country name via NAME format
  - Auto-detect compact date (yyyyMMdd) to target format
  - Date format conversions: yyyy-MM-dd↔dd/MM/yyyy, yyyy-MM-dd↔MM/dd/yyyy, dd/MM/yyyy↔MM/dd/yyyy
- **fillConstants.ts** — centralized field definitions, keyboard shortcuts, and error codes
- **Comprehensive E2E integration test suite (21 test files, 310+ TypeScript tests):**
  - `fullPipelineE2e.test.ts` (30 tests) — full import-to-fill E2E workflow with accuracy checks
  - `safetyEngineE2e.test.ts` (37 tests) — accuracy validation, confidence gating, expired doc detection
  - `fillStoreE2e.test.ts` (13 tests) — fill session lifecycle and event persistence
  - `ocrE2e.test.ts` (9 tests) — OCR job lifecycle simulation
  - `excelImportE2e.test.ts` (13 tests) — import validation, duplicate detection, hash computation
  - `settingsE2e.test.ts` (7 tests) — settings persistence lifecycle
  - `templateManagerE2e.test.ts` (8 tests) — template import/export E2E
  - `diagnosticsE2e.test.ts` (4 tests) — diagnostic export flow
  - `browserExtensionE2e.test.ts` (13 tests) — extension messaging bridge
- **Python E2E integration tests (2 test files, 19 tests):**
  - `test_full_pipeline_e2e.py` (13 tests) — end-to-end OCR-to-Excel pipeline
  - `test_export_excel_e2e.py` (6 tests) — Excel export with all sheets, formatting, and edge cases

### Changed

- `safetyEngine.ts` — added `getFieldAccuracyInfo()`, `checkConfidence()`, `checkFieldAccuracy()`, per-field accuracy helpers; now 437 lines with comprehensive validation
- `copyAssistant.ts` — added `copyFieldWithWarning()`, `getFieldAccuracyLevel()`, `getAccuracySummary()`, accuracy-annotated field listing
- `transformEngine.ts` — added `strip`, `phone_format`, expanded `country_format` (60+ countries), more date format conversions; now 259 lines
- `packages/shared/src/types/transform.ts` — added `strip` and `phone_format` transform rule types
- `apps/desktop/vite.config.ts` — configured Vitest with jsdom environment for E2E tests

## [0.3.0] - 2026-06-28

### Fixed

- **`formatDate`**: Implemented actual date formatting (was returning input unchanged)
- **`maskFullName`**: Now returns full name with masked last name (was returning only the masked last name)
- **`safetyEngine.checkGuestRow`**: Removed useless `|| false` coercion
- **`safetyEngine.matchPattern`**: Fixed regex escaping bug that caused incorrect URL pattern matching
- **`exportFillLogCsv`**: Now includes actual guest names and masked document numbers (was empty)
- **`excelImport`**: Added SHA-256 file hash computation for `excelFileHash` (was always empty)
- **`db.ts`**: Added proper error handling for `put()` operations
- **`SettingsScreen`**: Now persists settings to IndexedDB (was using local state only)
- **`OcrScreen`**: Fixed React key usage (was using array index instead of filename)

### Added

- **Comprehensive test suite with 119 tests across 12 test files:**
  - `result.test.ts` — 10 tests for Result type (ok, err, isOk, isErr, unwrapOr)
  - `fileUtils.test.ts` — 14 tests for file extension/type utilities
  - `date.test.ts` — 10 tests for shared date formatting/parsing
  - `dateUtils.test.ts` — 2 tests for app-level date utilities
  - `masking.test.ts` — 10 tests for sensitive data masking
  - `transformEngine.test.ts` — 16 tests for all transform rule types
  - `safetyEngine.test.ts` — 21 tests for all safety check functions
  - `templateManager.test.ts` — 6 tests for template CRUD and JSON import/export
  - `copyAssistant.test.ts` — 14 tests for field navigation and value retrieval
  - `excelValidation.test.ts` — 6 tests for guest row validation
  - `fillWorkflow.test.ts` — 6 E2E integration tests for complete fill workflow
  - `excelIntegration.test.ts` — 4 E2E integration tests for import-to-display flow
- **Vitest** test runner configured for the desktop app

### Changed

- `settingsStore.ts` rewritten to use IndexedDB for persistence (was Tauri-only)

## [0.1.0] - 2026-06-25

### Added

- Initial release
- OCR pipeline for passport MRZ extraction
- Passport visual OCR fallback
- ID card OCR structure
- QR/barcode reader interface
- Excel export with Guests, Errors, Instructions, Diagnostics sheets
- Reviewed Excel import with validation
- Copy Assistant for manual fill
- Keyboard Assistant with navigation shortcuts
- Fill status tracking
- Fill event logging and export
- Target system template manager
- Safety engine with pre-fill checks
- Auto Save configuration (disabled by default)
- Settings screen
- Browser extension foundation (Chrome Manifest V3)
- Desktop automation agent foundation
- Comprehensive documentation
- Quality tooling (ESLint, Prettier, Ruff, mypy, Lefthook, Commitlint)
- GitHub Actions CI workflow
- PyInstaller packaging support for OCR worker
