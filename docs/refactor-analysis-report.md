# Guest Fill App — Comprehensive Refactor Analysis Report

> **Generated:** 2026-07-05 | **Scope:** Full codebase (TypeScript + Python + Rust) | **Status:** Complete

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview & Patterns](#2-architecture-overview--patterns)
3. [Critical Architecture Issues](#3-critical-architecture-issues)
4. [Frontend Issues: Screens & Components](#4-frontend-issues-screens--components)
5. [Services Layer Issues](#5-services-layer-issues)
6. [OCR Module Issues](#6-ocr-module-issues)
7. [State Management Issues](#7-state-management-issues)
8. [Tauri Rust Backend Issues](#8-tauri-rust-backend-issues)
9. [Shared Package Issues](#9-shared-package-issues)
10. [Python OCR Worker Issues](#10-python-ocr-worker-issues)
11. [Configuration & Environment Issues](#11-configuration--environment-issues)
12. [Security & Privacy Issues](#12-security--privacy-issues)
13. [Test Coverage Analysis](#13-test-coverage-analysis)
14. [Prioritized Refactor Recommendations](#14-prioritized-refactor-recommendations)
15. [Migration Strategy](#15-migration-strategy)

---

## 1. Executive Summary

### Codebase at a Glance

| Metric                      | Value                    |
| --------------------------- | ------------------------ |
| Total source files          | ~300+                    |
| Total lines of code         | ~68,186                  |
| TypeScript source (desktop) | ~40,791 lines (99 files) |
| Python OCR worker           | ~6,619 lines (60 files)  |
| Rust backend                | ~639 lines (10 files)    |
| Shared package              | ~488 lines (15 files)    |
| Test files                  | 102 (across TS + Python) |
| Documentation               | 24 markdown files        |

### Architecture

Guest Fill is a **local-first desktop application** built as a **pnpm monorepo** with three language ecosystems:

- **Desktop app:** Tauri v1 + React 18 + TypeScript + Vite + Tailwind CSS
- **Python OCR worker:** PaddleOCR/Tesseract with a JSON-file IPC bridge
- **Rust backend:** Tauri commands orchestrated through `invoke()`

### Key Findings by Severity

| Severity     | Count | Categories                                                                       |
| ------------ | ----- | -------------------------------------------------------------------------------- |
| **Critical** | 7     | Data loss risk, dead code paths, security gaps, cross-language type drift        |
| **High**     | 18    | Massive code duplication, mixed concerns, circular dependencies, untestable code |
| **Medium**   | 25+   | Type safety erosion, naming chaos, configuration redundancy, stub commands       |
| **Low**      | 30+   | Hardcoded strings, inline SVGs, parameter shadowing, missing docstrings          |

---

## 2. Architecture Overview & Patterns

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Tauri Desktop App (Rust + React)                 │
│                                                                     │
│  screens/ ──▶ features/ ──▶ services/ ──▶ ocr/ ──▶ api/           │
│     │             │              │            │        │            │
│     │        ┌────┴────┐   ┌────┴────┐  ┌────┴────┐  │            │
│     │        │ Stores  │   │ Engines │  │Utils/Svc│  │            │
│     ▼        ▼         ▼   ▼         ▼  ▼         ▼  ▼             │
│  UI ────▶ Zustand ──▶ Tauri invoke() ──▶ Python Worker (subprocess)│
└─────────────────────────────────────────────────────────────────────┘
```

### Positive Patterns Already Present

1. **Interface + Factory pattern** in services layer (e.g., `ConfidenceScoringService` interface + `createConfidenceScoringService()` factory)
2. **Dependency injection through constructor parameters** (e.g., `DefaultOcrPipelineService` takes 11 dependencies)
3. **Store abstraction** with IndexedDB and in-memory implementations
4. **Result monad** in `lib/result.ts` (though largely unused)
5. **Clean route separation** in `routes.tsx`
6. **Comprehensive test infrastructure** with 102 test files
7. **Lefthook quality gates** (format, lint, typecheck, secret scan pre-commit)

### Critical Architectural Problems

#### C1. Circular Dependency Between `services/` and `ocr/`

**Severity: CRITICAL**

```
services/ ──imports──▶ ocr/ (engines, utils)
ocr/ ──imports──▶ services/ (pipeline, services via ocr_pipeline.ts)
```

- `ocr/ocr_pipeline.ts` imports 13 modules from `services/`
- `services/` imports engines from `ocr/`
- This creates a circular dependency that violates clean architecture principles

**Impact:** Impossible to extract `ocr/` as a standalone module. Tests in either directory have implicit dependencies on the other.

#### C2. Two Competing OCR Abstractions (OcrEngine vs OcrProvider × 2)

**Severity: CRITICAL**

Three separate OCR abstractions exist:

1. **`OcrEngine` interface** in `ocr/ocr_engine.ts` — simple `extractText(input)` contract
2. **`OcrProvider` interface** in `@guestfill/shared` — `processImage()`, `cancel()` contract
3. **`OcrProvider` interface** in `services/ocr_provider.ts` — DIFFERENT `extractMrzText()`, `extractVisualField()`, `extractText()` contract

All three have different method signatures. A manual `ProviderOcrEngineAdapter` in `ocr_pipeline.ts` bridges #2 to #1, but #3 (PaddleOcrProvider) remains separate.

**Impact:** Adding a new OCR provider requires implementing 3 interfaces. The adapter pattern adds complexity without clear benefit.

#### C3. Massive MRZ Parser Duplication

**Severity: CRITICAL**

Three near-identical MRZ parser implementations:

| File                             | Lines | Status                              |
| -------------------------------- | ----- | ----------------------------------- |
| `services/mrz_parser.ts`         | 942   | **Appears dead** — no imports found |
| `services/mrz_parser_service.ts` | 264   | Used by pipeline                    |
| `ocr/mrz_parser.ts`              | 849   | Used by local OCR provider          |

All three parse TD1/TD2/TD3 formats with near-identical field extraction, check digit computation, and repair logic. The check digit logic is duplicated in a **4th location**: `services/mrz_checksum_validator.ts` (177 lines).

**Impact:** ~2,000 lines of dead or duplicated code. Bug fixes in one parser never propagate to the others. Cross-language MRZ logic in both TypeScript and Python.

#### C4. Settings Data Loss — No Persistence Between Sessions

**Severity: CRITICAL**

- **Rust `AppSettings`** (in `app_state.rs`) has `ocr_worker_path`, `ocr_language`, `output_directory`, `temp_directory`, `theme`
- **TypeScript `AppSettings`** (in `types/settings.ts`) has entirely different fields: `defaultExcelFolder`, `maskDocumentNumberInLogs`, `fieldOrder`, `keyboardShortcuts`
- **Rust commands** store settings in an in-memory `Mutex<AppSettings>` — **never persisted to disk**
- **TypeScript stores** settings in IndexedDB via `settingsStore`

These two structs share **zero fields in common**. The frontend and backend are saving/loading entirely different configurations.

**Impact:** User settings are silently lost on application restart. Frontend and backend operate on independent, incompatible configuration models.

---

## 3. Critical Architecture Issues

### C5. TypeScript ↔ Python ↔ Rust Type Drift

Multiple type definitions are duplicated across all three languages with inconsistent enum values:

| Concept       | TypeScript                       | Python                      | Rust     | Drift                                     |
| ------------- | -------------------------------- | --------------------------- | -------- | ----------------------------------------- |
| `Gender`      | `"M" \| "F" \| "X" \| "UNKNOWN"` | Male/Female (boolean-ish)   | -        | Python missing `X`, Rust missing entirely |
| `GuestStatus` | 6 values incl. `MISSING_DATA`    | 5 values, no `MISSING_DATA` | -        | Python enum stale                         |
| Warning codes | 15 codes in types                | 50+ in constants            | -        | Massive drift                             |
| `AppSettings` | 15+ fields                       | -                           | 5 fields | Zero overlap                              |

### C6. IndexedDB Connection Per Call

`lib/db.ts:openDb()` opens a new IndexedDB connection on every CRUD call. Browsers limit per-origin connections (~20 in Chrome). Rapid operations (e.g., saving 100 guest rows) exhaust the connection pool.

### C7. Excel Import Unsafe Cast

`features/excel/excelImport.ts:141` uses `as unknown as ArrayBuffer` — a double cast that bypasses all type safety. If the data structure is incompatible, SHA-256 silently produces incorrect results.

---

## 4. Frontend Issues: Screens & Components

### 4.1 Monolithic Components

| Component                   | Lines   | Problem                                                                |
| --------------------------- | ------- | ---------------------------------------------------------------------- |
| `FillAssistantScreen.tsx`   | **801** | UI + keyboard handling + business logic + state management + clipboard |
| `SettingsPage.tsx` (ui/)    | **494** | 7 setting sections in one component                                    |
| `SetupWizard.tsx` (ui/)     | **463** | 5 wizard steps in one component                                        |
| `GuestForm.tsx`             | **357** | Form rendering + field tracking + confidence calculation               |
| `TemplateManagerScreen.tsx` | **285** | CRUD + import/export + clipboard                                       |

### 4.2 Duplicated Field Labels

The same 14 field labels defined in **at least 5 locations**:

1. `GuestForm.tsx` — `GUEST_FIELDS` (lines 13-28)
2. `ReviewScreen.tsx` — via `AUTOFILL_FIELD_META` from `ocr/autofill.ts`
3. `ExtractedResultReviewScreen.tsx` — `FIELD_LABELS` (lines 16-31)
4. `ManualCorrectionScreen.tsx` — `FIELD_META` (lines 16-31)
5. `FinalConfirmationScreen.tsx` — `SUMMARY_LABELS` (lines 14-27)

### 4.3 Triplicated Field-Editing Pattern

Three components implement the same `edits` state map + `getCurrentValue` + `handleChange` pattern:

1. `ReviewScreen.tsx` (255 lines)
2. `ManualCorrectionScreen.tsx` (155 lines)
3. `GuestForm.tsx` (357 lines)

### 4.4 Duplicated Status/Confidence Functions

- `STATUS_LABELS` object identical in `GuestForm.tsx` (lines 48-54) and `OCRProviderSelector.tsx` (lines 27-33)
- Confidence color functions duplicated across `GuestForm.tsx`, `ExtractedResultReviewScreen.tsx`, `ReviewScreen.tsx`, `FillAssistantScreen.tsx`
- Engine/language labels duplicated in `SetupWizard.tsx` and `SettingsPage.tsx`

### 4.5 Inconsistent Tauri IPC Access

Three patterns co-exist:

1. **Through feature layer** (OcrScreen → `features/ocr/ocrApi.ts` → `invoke()`)
2. **Direct import in screen** (`ImportExcelScreen.tsx` imports `@tauri-apps/api/dialog` directly)
3. **Through api/ layer with Result monad** (`api/ocr_api.ts`)

### 4.6 Missing Error Boundaries

No React `ErrorBoundary` wrapping the route tree. Any unhandled render error crashes the full app.

### 4.7 Misleading Button Behavior

In `ReviewScreen.tsx`, both "Confirm & Autofill" and "Skip Review" buttons call `onConfirm(mergedFields)` — identical behavior. "Skip Review" is a misnomer.

---

## 5. Services Layer Issues

### 5.1 Naming Inconsistency

Three naming conventions in the same directory:

| Convention | Files                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| snake_case | `audit_logger.ts`, `mrz_parser.ts`, `ocr_pipeline_service.ts` (majority) |
| camelCase  | `loggingService.ts`                                                      |
| kebab-case | `audit-log-service.ts`, `settings-service.ts`                            |

### 5.2 Partially Overlapping Service Files

**`audit_logger.ts` (320 lines) vs `audit-log-service.ts` (494 lines) vs `loggingService.ts` (18 lines):**

- `audit_logger.ts` — in-memory debug session artifacts
- `audit-log-service.ts` — IndexedDB persistent event logging + CSV/JSON export (presentation concern in a service!)
- `loggingService.ts` — in-lined log collector, **redundant** with Logger class in `lib/logging.ts`

### 5.3 Mixed Concerns in Services

- `auto-fill-execution-service.ts:494-557` contains **DOM/clipboard/platform-specific I/O** (fillWebField, fillDesktopField, copyToClipboard) — belongs in an infrastructure/adapter layer
- `document_detector.ts:245-252` creates `<canvas>` elements — DOM code in a service
- `mrz_cropper.ts` contains pixel-level image processing algorithms (CLAHE, sharpen, denoise, adaptive threshold) — belongs in `ocr/`
- `image_quality_service.ts:200-570` has pixel-level analysis code duplicated with `image_quality.ts` in `ocr/`

### 5.4 Duplicate MRZ Detection

`computeHorizontalProjection()`, `smoothProjection()`, `findTextBands()`, `selectMrzBand()`, `estimateLineCount()`, `detectMrzFormat()` appear in **both**:

1. `mrz_cropper.ts` (projection algorithms)
2. `mrz_detection_service.ts` (same algorithms, different signatures)

### 5.5 Dual Field Validator

**`services/field_validator.ts` (868 lines)** vs **`ocr/field_validator.ts` (576 lines)**:

- Both have `validateField()`, `validateExtractedFields()`, per-field validators
- Both define `FieldValidationResult`, `FieldIssue`, `ValidationConfig` — but with **different shapes**
- The `services/` version has country code repair logic; the `ocr/` version does not

### 5.6 Error Handling Inconsistencies

- **No shared `AppError` or `ServiceError` type** — each service defines its own error union
- **Dual paradigm**: Some services throw typed Errors (via `Object.assign(error, { type })`), others return Result objects, others throw plain Errors
- **`Result` monad from `lib/result.ts` is used in exactly one file** (`api/ocr_api.ts`) — all services throw exceptions instead
- **Error type serialization**: `Object.assign(error, { type })` loses the `type` property across IPC boundaries

---

## 6. OCR Module Issues

### 6.1 `ocr/autofill.ts` Contains UI Code

`ocr/autofill.ts:91` exports `confidenceBorder()`, `confidenceBadge()`, `severityBorder()`, `severityBadge()` — functions that return **Tailwind CSS class strings**. This is presentation logic in the OCR module.

### 6.2 `ocr/confidence_scoring.ts` (24 Lines) — Trivially Small

Contains `needsReview()`, `fieldsRequiringReview()`, `getOverallConfidence()`, `isReadyForAutofill()` — all of which duplicate concepts in:

- `services/ocr_confidence_service.ts` (596 lines)
- `services/confidence-scoring-service.ts` (171 lines)

### 6.3 `ocr-controller.ts` — Parallel Implementation

Uses a completely different abstraction set (shared `OcrProvider` interface, its own state machine, its own `mapToGuestRow()`) that does NOT integrate with `ocr_pipeline.ts` or any services. Appears to be an older/alternate entry point.

### 6.4 `services/ocr_provider.ts` — Third OcrProvider Interface

Defines a **third** `OcrProvider` interface (with `extractMrzText`, `extractVisualField`, `extractText`) separate from the shared package's `OcrProvider`. Only `PaddleOcrProvider` implements this.

---

## 7. State Management Issues

### 7.1 Global Mutable State

- `ocrStore.ts` — in-memory `Map` for OCR jobs (lost on refresh)
- `fillStore.ts` — in-memory session state
- `ocr_api.ts:71` — mutable `state` property

### 7.2 Zustand Stores Without Persistence

Feature stores (`ocrStore.ts`, `fillStore.ts`, `settingsStore.ts`) use Zustand but do not use `persist` middleware. State is lost on page refresh.

### 7.3 SettingsStore Duplication

`features/settings/` and `services/settings-service.ts` both define `AppSettings` type — two parallel, drifting type hierarchies.

---

## 8. Tauri Rust Backend Issues

### 8.1 Settings Persistence is a Stub

`load_settings` / `save_settings` operate on an in-memory `Mutex<AppSettings>` — **never written to disk**. Settings lost on every restart.

### 8.2 OCR Commands Have Placeholder

`run_ocr_placeholder` (line 149) returns hardcoded zero-filled data. Still registered as a real Tauri command.

### 8.3 Excel Commands Are Stubs

`export_excel_placeholder` and `import_excel_placeholder` are no-ops returning empty data.

### 8.4 Auto-Fill Commands Are macOS-Only

- `focus_app_window`, `fill_desktop_field`, `fill_web_field` use AppleScript (`osascript`)
- Silent failures on Windows/Linux
- `fill_web_field` ignores the selector parameter and always uses Cmd+V

### 8.5 Clipboard Data Never Auto-Cleared

`copy_to_clipboard` has no auto-clear mechanism despite `clearClipboardAfterSeconds` existing in the settings type. Passport numbers remain on the system clipboard indefinitely.

### 8.6 Error Handling Is String-Based

`AppError` uses `code: String` — no typed enum variants. Frontend must do fragile string comparison.

### 8.7 Concurrency Concerns

- `AppState.settings` uses `std::sync::Mutex` (blocking) but Tauri commands are `async`
- No OCR job queuing — concurrent `run_ocr` calls launch independent subprocesses

### 8.8 Blocking Dialog API

`file_commands.rs` uses `tauri::api::dialog::blocking` (synchronous), blocking the async runtime.

---

## 9. Shared Package Issues

### 9.1 Type-Level Bugs

- `GENDER` constant missing `"X"` while `Gender` type includes it. Any code referencing `GENDER.X` gets a compilation error.
- `GuestStatus` type has `"MISSING_DATA"` but Python's `GuestStatus` enum does not. Cross-language status values silently dropped.
- `FillAction` and `FillEventType` are near-identical string unions that will inevitably drift.

### 9.2 Weakly Typed Types

- `FillState.copiedFields` and `filledFields` are `Record<string, boolean>` — no key constraint linking to `OcrFieldKey`
- `SafetyRule.config` is `Record<string, string>` — completely untyped
- `OcrProcessingOptions` is anemic — no language, confidence threshold, or tuning parameters

### 9.3 Masking Utility Gaps

`packages/shared/src/utils/masking.ts`:

- `maskFullName` only masks the **last** name, exposing given names
- No `maskDateOfBirth`, `maskPhoneNumber`, or `maskEmail` functions
- `maskString` shows first 4 chars by default — for short values like `"M"` (gender), full value is exposed

### 9.4 Date Utility Bugs

- `parseDate()` uses `new Date(dateString)` — browser-inconsistent parsing
- `isValidDate` returns `true` for invalid dates like `"2021-02-30"` because `new Date()` auto-corrects

---

## 10. Python OCR Worker Issues

### 10.1 OCR Engine Selection — Deeply Nested Logic

`ocr_selector.py:200-263` has multiple levels of if/else for PaddleOCR success/failure, multi-language fallback, and Tesseract fallback. The `_try_multi_lang_candidates` (line 266) and `try_multi_lang_paddleocr` (line 318) share ~80% code.

### 10.2 TD1 Composite Check Digit Never Scored

`_score_td1_check_digits` in `ocr_selector.py:72-90` never scores the TD1 composite check digit (`line2[29:30]`), even though `TD1_LAYOUT` defines it. TD1 candidates get inflated scores vs TD2/TD3.

### 10.3 `validate_full_mrz` Always Validates as TD3

`mrz_validator.py:171-172` calls `validate_check_digits_td3` regardless of the actual MRZ format.

### 10.4 Global PaddleOCR Instance Caching

`_PPOCR_INSTANCES` dict caches instances with no cleanup mechanism. Corrupted models require a full process restart.

### 10.5 Bare `except Exception`

`passport_visual_ocr.py:195` catches all exceptions, masking `KeyboardInterrupt`, `SystemExit`, `GeneratorExit`.

### 10.6 Two Configuration Systems

`config_loader.py:load_options()` returns a plain dict while `load_ocr_config()` returns an `OcrConfig` dataclass. These represent overlapping config but use different types. `DEFAULT_OPTIONS` is duplicated in `config_loader.py` and `cli/request_reader.py`.

### 10.7 Visual OCR Name Filter Discards Valid Names

`passport_visual_ocr.py:131-141` rejects names with hyphens, apostrophes, or fewer than 3 distinct characters. Names like "Le" or "O'Brien" are silently discarded.

---

## 11. Configuration & Environment Issues

### 11.1 `.env.example` is Minimal

Only 3 variables, none for API keys, worker path, or storage locations. `GUESTFILL_ENABLE_ONLINE_OCR` is never read by the worker. `GUESTFILL_LOCAL_BRIDGE_PORT` references a feature that doesn't exist.

### 11.2 Hardcoded Thresholds Everywhere

| Location                                      | Values     | Issue                               |
| --------------------------------------------- | ---------- | ----------------------------------- |
| `services/ocr_pipeline_service.ts:74`         | `0.6`      | Confidence threshold hardcoded      |
| `services/mrz_detection_service.ts:32-38`     | 7 values   | MRZ detection params hardcoded      |
| `services/ocr_confidence_service.ts:38-47`    | 10 values  | Scoring thresholds hardcoded        |
| `services/auto-fill-execution-service.ts:122` | `100` ms   | Field delay hardcoded               |
| `config/constants.ts`                         | 65+ values | Many should come from user settings |

### 11.3 No API Key Management

No secure storage mechanism for API keys. No documentation of how Azure/online OCR keys would be provided. The `.env.example` deliberately avoids defining API keys.

### 11.4 Configuration Redundancy

- Excel columns in 3 places: `columns.ts` (TS), `columns.py` (Python), `excel_columns.json` (JSON)
- Country codes in 2 places: `ISO3_COUNTRIES` (TS) + `country_codes.json` (Python)
- Warning codes: 15 in TS types, 50+ in Python constants — no single source of truth

---

## 12. Security & Privacy Issues

### 12.1 Clipboard Data Never Cleared (Repeated)

`clipboard_commands.rs:copy_to_clipboard` has no auto-clear timer. Although `clearClipboardAfterSeconds` exists in the settings model, it is never enforced. Passport numbers and ID data persist on the system clipboard.

### 12.2 Five Separate PII Masking Implementations

| File                   | Lines   | Scope                  |
| ---------------------- | ------- | ---------------------- |
| `lib/logging.ts`       | 28-63   | Logger context masking |
| `audit_logger.ts`      | 178-213 | Debug artifacts        |
| `audit-log-service.ts` | 67-107  | Persistent audit logs  |
| `ocr-controller.ts`    | 188-202 | Controller logging     |
| `api/ocr_api.ts`       | 282-303 | API layer logging      |

All five have different key lists and masking strategies. Sensitive data may leak through the least comprehensive implementation.

### 12.3 Nested Arrays Not Masked

`audit-log-service.ts:98-110` only masks top-level object keys. Arrays of objects are passed through unmasked.

### 12.4 Python Masking Gaps

- `safe_logging.py:SENSITIVE_KEYS` is hardcoded (11 keys) — new sensitive fields are not auto-detected
- `sanitize_dict` does not recurse into nested dicts or arrays
- `privacy_guard.py` only checks 4 regex patterns — no email, phone, or address patterns

### 12.5 Cross-Language Masking Inconsistency

Python masks 11 key types; TypeScript masks 14 patterns. No single source of truth for what constitutes sensitive data. Removing a sensitive field from one does not remove it from the other.

### 12.6 No Error Boundaries

No React `ErrorBoundary` means unhandled errors could expose internal state in the UI.

### 12.7 Rust Error Codes Expose Internals

String-based `AppError.code` values like `"IO_ERROR"`, `"SERIALIZATION_ERROR"` expose implementation details to the frontend.

---

## 13. Test Coverage Analysis

### 13.1 Overall Quality

**Strong test infrastructure** with 102 test files across TypeScript and Python:

| Layer                 | Files | Quality   |
| --------------------- | ----- | --------- |
| Desktop unit tests    | ~21   | Excellent |
| Desktop service tests | ~18   | Excellent |
| Desktop integration   | 2     | Very good |
| Desktop feature/E2E   | ~15   | Excellent |
| Python unit tests     | 24    | Very good |
| Python E2E            | 3     | Good      |
| Root-level E2E        | 4     | Excellent |

### 13.2 Critical Gaps

| Gap                                     | Severity   | Detail                                                          |
| --------------------------------------- | ---------- | --------------------------------------------------------------- |
| **No real OCR engine tests**            | **HIGH**   | All OCR tests use MockOcrEngine or mocked Tauri IPC             |
| **No performance/benchmark tests**      | **HIGH**   | No throughput, memory, or stress tests                          |
| **No UI component tests**               | **MEDIUM** | Only 2 component test files (ReviewScreen, OCRProviderSelector) |
| **No Tauri backend tests**              | **MEDIUM** | Rust backend (10 files) has zero tests                          |
| **No security penetration tests**       | **MEDIUM** | Only basic masking/sanitization tests                           |
| **Browser extension untested**          | **MEDIUM** | Minimal coverage                                                |
| **image-quality test duplicates logic** | **MEDIUM** | Thresholds copied from source, not imported                     |

### 13.3 Test Anti-Patterns Found

- `image_quality_service.test.ts:` re-implements the warning detection logic locally instead of importing from the source
- `ocr_pipeline_service.test.ts:` tests the orchestrator with all sub-services mocked — only verifies orchestration, not actual pipeline behavior
- MockOcrEngine contract is implicit — no contract test ensuring it stays in sync with real engines

---

## 14. Prioritized Refactor Recommendations

### Phase 1: Foundation (Critical — Must Fix First)

| #    | Area                         | Action                                                                                                                                | Rationale                                   |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| P1.1 | Circular dependency          | Break `ocr/ ←→ services/` cycle. Move `ocr_pipeline.ts` into `services/` or extract shared orchestration types                        | Unblocks all other refactoring              |
| P1.2 | Triple MRZ parser            | Consolidate `services/mrz_parser.ts` (dead), `services/mrz_parser_service.ts`, and `ocr/mrz_parser.ts` into one shared implementation | Eliminates ~2,000 lines of duplicated logic |
| P1.3 | Settings persistence         | Unify Rust + TypeScript settings models. Implement IndexedDB persistence with Tauri sync                                              | Fixes silent data loss                      |
| P1.4 | Dual field validator         | Merge `services/field_validator.ts` and `ocr/field_validator.ts` into one canonical validator                                         | Eliminates conflicting validation logic     |
| P1.5 | Clipboard security           | Implement auto-clear timer for clipboard                                                                                              | Closes security gap                         |
| P1.6 | Unified OCR interface        | Merge 3 competing OCR abstractions into one `OcrProvider` interface with adapter implementations. Remove `OcrEngine` interface        | Enables extensible provider architecture    |
| P1.7 | IndexedDB connection pooling | Implement singleton connection manager in `lib/db.ts`                                                                                 | Fixes connection exhaustion                 |

### Phase 2: High Priority (Architecture & Maintainability)

| #     | Area                        | Action                                                                           | Rationale                           |
| ----- | --------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| P2.1  | God components              | Split `FillAssistantScreen.tsx` (801 lines) into custom hooks + sub-components   | Enables testing, reduces complexity |
| P2.2  | Split `SettingsPage.tsx`    | Extract each setting section into its own component                              | Follows single-responsibility       |
| P2.3  | Split `SetupWizard.tsx`     | Extract each wizard step into its own component                                  | Same as P2.2                        |
| P2.4  | Duplicate field labels      | Create single `fieldDefinitions.ts` in `config/`                                 | Single source of truth              |
| P2.5  | Triplicated field editor    | Extract reusable `FieldEditor` component                                         | Eliminates pattern duplication      |
| P2.6  | Duplicate confidence/status | Create shared `ConfidenceBadge` and `StatusBadge` components                     | Eliminates color logic duplication  |
| P2.7  | Inline SVGs                 | Extract shared SVG icon set                                                      | Reduces code, enables theming       |
| P2.8  | Naming cleanup              | Unify snake_case → camelCase in all TypeScript                                   | Consistency                         |
| P2.9  | Merge audit loggers         | Consolidate `audit_logger.ts`, `audit-log-service.ts`, `loggingService.ts`       | Single audit module                 |
| P2.10 | Merge confidence scorers    | Merge `confidence-scoring-service.ts` into `ocr_confidence_service.ts`           | Eliminates overlap                  |
| P2.11 | PII masking unification     | Single `masking.ts` utility used consistently across all layers                  | No sensitive data leaks             |
| P2.12 | MRZ detection consolidation | Merge projection algorithms from `mrz_cropper.ts` and `mrz_detection_service.ts` | Eliminates algorithmic duplication  |

### Phase 3: Medium Priority (Code Quality & UX)

| #     | Area                                | Action                                                                                | Rationale                  |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| P3.1  | Error boundaries                    | Add React `ErrorBoundary` wrapping routes                                             | Prevents full-app crashes  |
| P3.2  | Fix "Skip Review" button            | Make it actually skip review (pass original fields)                                   | Fixes misleading UX        |
| P3.3  | Global error handling               | Create shared `AppError` class hierarchy                                              | Consistent error handling  |
| P3.4  | Tauri IPC abstraction               | All Tauri calls through feature layers, never direct from screens                     | Decouples from Tauri       |
| P3.5  | `Result` monad adoption             | Use `Result<T, E>` consistently across services                                       | Functional error handling  |
| P3.6  | Settings → user config              | Load actual user settings instead of using `DEFAULT_*` constants                      | Settings become functional |
| P3.7  | Type safety cleanup                 | Replace `as` casts with proper type guards                                            | Stronger type guarantees   |
| P3.8  | Remove stub commands                | Replace `run_ocr_placeholder`, `export_excel_placeholder`, `import_excel_placeholder` | Eliminates fake routes     |
| P3.9  | Add `Gender.X` to `GENDER` constant | Fix type/const mismatch                                                               | Type-correctness           |
| P3.10 | Masking utility enhancements        | Add `maskDateOfBirth`, `maskPhoneNumber`, `maskEmail`                                 | Complete coverage          |

### Phase 4: Lower Priority (Polish & Future-Proofing)

| #    | Area                               | Action                                                                                                                          | Rationale                  |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| P4.1 | Configuration centralization       | Single source of truth for thresholds, country codes, warning codes                                                             | Eliminates drift           |
| P4.2 | `OcrProcessingOptions` enhancement | Add language, confidence thresholds to the type                                                                                 | Future provider support    |
| P4.3 | Rust error type enum               | Replace `code: String` with `AppErrorCode` enum                                                                                 | Typed error matching       |
| P4.4 | Rust async dialog                  | Replace blocking dialog with async API                                                                                          | Non-blocking UI            |
| P4.5 | Python OCR selector refactor       | Strategy pattern for engine selection                                                                                           | Extensible engine addition |
| P4.6 | Cross-platform auto-fill           | Implement Windows/Linux alternatives to AppleScript                                                                             | Platform parity            |
| P4.7 | Remove dead code                   | `services/mrz_parser.ts` (942 lines dead), `ocr/autofill.ts` (UI code in wrong module), `ocr/confidence_scoring.ts` (redundant) | Reduce maintenance burden  |
| P4.8 | Python config consolidation        | Merge `config_loader.py` options + `OcrConfig` into single system                                                               | Clear config boundary      |
| P4.9 | `.env.example` expansion           | Document all env vars: API keys, worker path, storage config                                                                    | Deployment readiness       |

### Phase 5: Testing

| #    | Area                        | Action                                                                        | Rationale                      |
| ---- | --------------------------- | ----------------------------------------------------------------------------- | ------------------------------ |
| P5.1 | Real OCR smoke test         | One test that runs real PaddleOCR against known test image (conditional skip) | Validates real engine behavior |
| P5.2 | Performance benchmarks      | Throughput and memory benchmarks for OCR pipeline                             | Detects regressions            |
| P5.3 | Component tests             | Add React Testing Library tests for key interactive components                | UI reliability                 |
| P5.4 | Rust backend tests          | Unit tests for Tauri commands and error handling                              | Backend reliability            |
| P5.5 | Contract tests              | Verify `MockOcrEngine` matches real engine interface                          | Prevents mock drift            |
| P5.6 | Fix `image-quality.test.ts` | Import thresholds from source instead of duplicating                          | Tests reflect real code        |
| P5.7 | Browser extension tests     | Add test coverage for `apps/browser-extension/`                               | Extension reliability          |

---

## 15. Migration Strategy

### Approach: Incremental Refactoring in Place

The codebase is large (~68K lines) and actively used. A "big bang" rewrite would break existing features. The recommended approach is:

#### Step 1: Isolate (Phase 1)

- Extract shared types to `packages/shared/src/`
- Consolidate MRZ parsers into `services/mrz-parser.ts` (single file)
- Fix settings persistence (P1.3)
- Break circular dependency between `services/` and `ocr/`

#### Step 2: Abstract (Phase 2)

- Extract reusable components (`FieldEditor`, `ConfidenceBadge`, `StatusBadge`)
- Unify OCR provider interface
- Add shared icon set
- Merge overlapping services (audit, confidence, masking)

#### Step 3: Clean (Phase 3-4)

- Split monolithic components
- Remove stub commands
- Fix type/const mismatches
- Centralize configuration

#### Step 4: Verify (Phase 5)

- Add missing tests
- Ensure existing tests still pass after each phase
- Run accuracy tests to validate no regression

### Verification Gates Per Phase

1. All existing tests pass before starting each phase
2. After each phase: `pnpm typecheck`, `pnpm lint`, `pnpm test`
3. After Phase 1: OCR feature E2E tests pass
4. After Phase 2: Full user journey tests pass
5. After Phase 3: Accuracy tests show 100% for clean MRZ
6. After Phase 4: No compiler warnings, lint passes

### Rollback Plan

Each phase should be implemented as a PR with:

- Full test suite passing before merge
- Feature flags where behavior changes significantly
- Clear commit boundaries (one logical change per commit)

---

## Appendix: File Size Heatmap

### Top 15 Largest Files (Need Splitting)

| File                                      | Lines | Priority                      |
| ----------------------------------------- | ----- | ----------------------------- |
| `features/fill/safetyEngine.ts`           | 1,609 | P2                            |
| `services/mrz_parser.ts`                  | 942   | P1.2 (consolidate, not split) |
| `ocr/mrz_parser.ts`                       | 849   | P1.2                          |
| `screens/FillAssistantScreen.tsx`         | 801   | P2.1                          |
| `services/mrz_cropper.ts`                 | 772   | P2.12                         |
| `services/field_validator.ts`             | 868   | P1.4                          |
| `services/auto-fill-execution-service.ts` | 558   | P2                            |
| `services/image_quality_service.ts`       | 629   | P3                            |
| `services/ocr_confidence_service.ts`      | 596   | P2.10                         |
| `services/ocr_pipeline_service.ts`        | 474   | P2                            |
| `ui/components/SettingsPage.tsx`          | 494   | P2.2                          |
| `ui/components/SetupWizard.tsx`           | 463   | P2.3                          |
| `services/audit-log-service.ts`           | 494   | P2.9                          |
| `local-ocr-provider.ts`                   | 528   | P2.14                         |
| `components/GuestForm.tsx`                | 357   | P2.4-2.6                      |

### Dead or Suspect Files

| File                             | Lines | Suspicion                                                                                                     |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| `services/mrz_parser.ts`         | 942   | **Dead** — no imports found; `mrz_parser_service.ts` is used instead                                          |
| `loggingService.ts`              | 18    | **Redundant** — same functionality in `lib/logging.ts` Logger class                                           |
| `ocr/confidence_scoring.ts`      | 24    | **Redundant** — duplicates `services/ocr_confidence_service.ts`                                               |
| `ocr/autofill.ts`                | 91    | **Misplaced** — UI/Tailwind constants in OCR module; should be in `config/`                                   |
| `ui/components/SettingsPage.tsx` | 494   | Has 3 files serving the same settings UI: `SettingsPage.tsx`, `SetupWizard.tsx`, `screens/SettingsScreen.tsx` |

---

## Appendix: Cross-Language Type Drift Summary

| Type          | TypeScript                    | Python                              | Rust     | Risk                             |
| ------------- | ----------------------------- | ----------------------------------- | -------- | -------------------------------- |
| `Gender`      | `M \| F \| X \| UNKNOWN`      | Male/Female (bool-ish)              | -        | Drift                            |
| `GuestStatus` | 6 values                      | 5 values                            | -        | Silent data loss                 |
| `WarningCode` | 15 values                     | 50+ values                          | -        | Feature detection differences    |
| `AppSettings` | 15+ fields                    | -                                   | 5 fields | Settings lost                    |
| `ExcelColumn` | `columns.ts`                  | `columns.py` + `excel_columns.json` | -        | Column order/size drift          |
| `CountryCode` | `ISO3_COUNTRIES` (TS set)     | `country_codes.json`                | -        | Validation mismatch              |
| `MRZ_WEIGHTS` | `[7, 3, 1]` in `constants.ts` | `compute_check_digit()` hardcoded   | -        | Check digit computation mismatch |
