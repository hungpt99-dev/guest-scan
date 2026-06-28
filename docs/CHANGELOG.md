# Changelog

All notable changes to GuestFill are documented in this file.

## [0.2.0] - 2026-06-28

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
