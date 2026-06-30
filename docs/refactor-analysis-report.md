# Static Analysis Report — Refactoring & Bug Fixing

> Generated: 2026-06-30 | Scope: Full codebase (TypeScript + Python + Rust)

---

## Table of Contents

1. [Bugs & Logic Errors](#1-bugs--logic-errors)
2. [Hardcoded Values](#2-hardcoded-values)
3. [Anti-Patterns & Code Smells](#3-anti-patterns--code-smells)
4. [Maintainability Issues](#4-maintainability-issues)
5. [Design Pattern Suggestions](#5-design-pattern-suggestions)

---

## 1. Bugs & Logic Errors

### 1.1 `captureFromDevice` always throws — dead code path
**File:** `apps/desktop/src/api/ocr_api.ts:278`
- `captureFromDevice(_source?)` unconditionally throws `new Error("Camera capture not implemented in API layer.")`. Every call to `captureImage()` with a non-file source hits this and returns an error.
- **Fix:** Remove the method or implement actual camera integration.

### 1.2 TD1 check-digit validation always passes for optional data
**File:** `workers/ocr/guestfill_ocr/passport/mrz_validator.py:137-138`
```python
optional_cd = None
```
Then used at line 152:
```python
results["optional_data_valid"] = optional_cd is None or validate_check_digit(...)
```
Since `optional_cd` is always `None`, the first clause short-circuits to `True` — **optional data check digits are never validated for TD1**, potentially accepting corrupted ID data.

### 1.3 TD2 `final_composite_valid` uses incorrect logic
**File:** `workers/ocr/guestfill_ocr/passport/mrz_validator.py:215-217`
```python
results["final_composite_valid"] = results["passport_number_valid"] or not any(
    e.startswith("PASSPORT") for e in results["errors"]
)
```
This sets `final_composite_valid` to `True` whenever either the passport number check passes OR no PASSPORT-related error exists — but the composite check digit is separate from the passport number check digit. This is **not ICAO-compliant**.

### 1.4 Overlapping name-gender entries cause ambiguous results
**File:** `apps/desktop/src/features/fill/safetyEngine.ts:441,548`
- `"maria"` appears in both `MASCULINE_NAMES` (line 441) and `FEMININE_NAMES` (line 516).
- `"van"` appears in both sets (lines 443 and 548).
- `guessNameGender()` checks masculine first, so `"Maria"` will always match as male — **incorrect**.

### 1.5 IndexedDB connection exhaustion — no connection pooling
**File:** `apps/desktop/src/lib/db.ts:4`
- `openDb()` opens a **new IndexedDB connection on every CRUD call**. Multiple rapid operations can exhaust browser connection limits (~per-origin connection cap).
- **Fix:** Implement a singleton connection manager.

### 1.6 `maskSensitiveMetadata` only checks a subset of sensitive keys
**File:** `apps/desktop/src/api/ocr_api.ts:283-292`
- Only 8 keys are listed for masking, while `audit-log-service.ts:57-73` lists 14 patterns. Inconsistent masking coverage means some sensitive data may leak to logs.

### 1.7 Unsafe type cast in Excel import hashing
**File:** `apps/desktop/src/features/excel/excelImport.ts:141`
```typescript
const hashBuffer = await window.crypto.subtle.digest("SHA-256", data as unknown as ArrayBuffer);
```
Uses `as unknown as ArrayBuffer` — a double cast that bypasses type safety. If `data` is not structurally compatible with `ArrayBuffer`, the digest silently produces incorrect results.

### 1.8 `describePassportPattern` ignores its parameter
**File:** `apps/desktop/src/features/fill/safetyEngine.ts:326-328`
```typescript
function describePassportPattern(iso3: string, _pattern?: RegExp): string | undefined {
  return PASSPORT_FORMAT_EXAMPLES[iso3];
}
```
The `_pattern` parameter is accepted but never used. If a country has multiple patterns, the description doesn't reflect which one failed.

### 1.9 Mock MRZ detection returns hardcoded width
**File:** `apps/desktop/src/services/mrz_detection_service.ts:463`
```typescript
return createMrzRegion(image.imagePath, 400, bandHeight, y, formatInfo);
```
Always reports width as `400` regardless of actual image dimensions — will break downstream processing that relies on bounding box accuracy.

### 1.10 Pipeline throws error objects without proper error types
**File:** `apps/desktop/src/services/ocr_pipeline_service.ts:127-128`
```typescript
throw Object.assign(new Error(`Image quality check failed: ...`), {
  type: qualityResult.warnings[0] === "BLURRY" ? "BLURRY_IMAGE" : ("GLARE_REFLECTION" as OcrPipelineError),
});
```
Mutating Error objects with `Object.assign` is fragile — the `type` property is not part of `Error` prototype and may be lost during serialization.

### 1.11 Filter logic discards empty string as unmapped
**File:** `apps/desktop/src/services/auto-fill-mapping-service.ts:353-356`
```typescript
const unmappedOcrFields = OCR_FIELD_KEYS.filter((k) => {
  if (!fields[k as keyof NormalizedFields]) return false;
  return !mappedOcrFields.has(k);
});
```
`!fields[k]` filters out empty strings `""` as falsy, so fields with legitimate empty values are reported as unmapped.

### 1.12 Visual OCR name filter may discard valid names
**File:** `workers/ocr/guestfill_ocr/passport/passport_visual_ocr.py:131-141`
```python
if not p.isalpha():
    continue
if len(p) > 15:
    continue
distinct = len(set(p))
if distinct < 3 and len(p) > 3:
    continue
```
Names like "Nguyen" (6 chars, 4 distinct) pass, but short names like "Le" (2 chars) or "Ho" (5 chars, 3 distinct) that fail these heuristics would be silently discarded. Names with hyphens or apostrophes fail `isalpha()` and are skipped.

### 1.13 `maskDetails` does not handle arrays of objects
**File:** `apps/desktop/src/services/audit-log-service.ts:98-110`
```typescript
if (typeof value === "object" && value !== null && !Array.isArray(value)) {
  masked[key] = maskDetails(value as Record<string, unknown>);
}
```
Nested objects inside arrays are never masked, potentially leaking sensitive data in array fields.

---

## 2. Hardcoded Values

### 2.1 Configuration / Threshold Constants

| File | Line(s) | Value | Description |
|------|---------|-------|-------------|
| `apps/desktop/src/services/ocr_pipeline_service.ts` | 74 | `0.6` | `OCR_CONFIDENCE_THRESHOLD` |
| `apps/desktop/src/services/mrz_detection_service.ts` | 32–38 | `0.65, 0.06, 0.35, 12, 0.12, 3, 0.2` | MRZ detection parameters (7 consts) |
| `apps/desktop/src/services/ocr_confidence_service.ts` | 38–47 | `0.85, 0.6, 0.1, 0.2, 0.2, 0.15, 0.05, 0.05, 0.25, 0.15` | Confidence scoring thresholds |
| `apps/desktop/src/services/auto-fill-execution-service.ts` | 122 | `100` | `DEFAULT_FIELD_DELAY_MS` |
| `apps/desktop/src/ocr/paddle_ocr_engine.ts` | 8 | `0.6` | `DEFAULT_CONFIDENCE_THRESHOLD` |
| `apps/desktop/src/lib/db.ts` | 1–2 | `"guestfill"`, `2` | `DB_NAME`, `DB_VERSION` |
| `apps/desktop/src/services/audit-log-service.ts` | 50–53 | `90 days`, `10000` | Retention config |

### 2.2 Data Dictionaries / Lookup Tables

| File | Lines | Entries | Description |
|------|-------|---------|-------------|
| `apps/desktop/src/services/ocr_confidence_service.ts` | 49–299 | ~250 | `ISO3_COUNTRIES` set |
| `apps/desktop/src/features/fill/safetyEngine.ts` | 36–93 | ~90 | `PASSPORT_PATTERNS` per-country regexes |
| `apps/desktop/src/features/fill/safetyEngine.ts` | 95–112 | ~15 | `AMBIGUOUS_CHARS` map |
| `apps/desktop/src/features/fill/safetyEngine.ts` | 198–265 | ~67 | `ISO3_FROM_ISO2` mapping |
| `apps/desktop/src/features/fill/safetyEngine.ts` | 267–324 | ~67 | `PASSPORT_FORMAT_EXAMPLES` |
| `apps/desktop/src/features/fill/safetyEngine.ts` | 366–549 | ~185 | `MASCULINE_NAMES` + `FEMININE_NAMES` |
| `apps/desktop/src/features/excel/excelImport.ts` | 159–184 | ~23 | Column name normalization map |
| `apps/desktop/src/services/auto-fill-mapping-service.ts` | 23–55 | ~14 | `OCR_FIELD_KEYS`, `OCR_FIELD_LABELS` |
| `apps/desktop/src/features/fill/fillConstants.ts` | 1–57 | ~25 | `FILL_FIELDS`, shortcuts, error codes |
| `apps/desktop/src/services/audit-log-service.ts` | 57–73 | ~14 | `SENSITIVE_KEY_PATTERNS` |
| `workers/ocr/guestfill_ocr/excel/columns.py` | 1–47 | ~27 | `GUEST_COLUMNS`, `ERROR_COLUMNS`, etc. |
| `workers/ocr/guestfill_ocr/passport/mrz_repair.py` | 8–19 | ~10 | `CHAR_REPAIR_MAP` |
| `workers/ocr/guestfill_ocr/passport/passport_visual_ocr.py` | 23–68 | ~7 | `FIELD_PATTERNS` with 20+ language variants |
| `workers/ocr/guestfill_ocr/ocr/ocr_selector.py` | 325 | ~10 | Hardcoded language fallback list |
| `workers/ocr/guestfill_ocr/common/constants.py` | — | ~20 | Warning codes, status constants |

### 2.3 UI Strings / Labels

| File | Line(s) | Description |
|------|---------|-------------|
| `apps/desktop/src/screens/FillAssistantScreen.tsx` | 40–56 | Color/score thresholds in 3 separate functions |
| `apps/desktop/src/screens/FillAssistantScreen.tsx` | 96–97 | `"Loading guests..."` |
| `apps/desktop/src/screens/FillAssistantScreen.tsx` | 101, 103 | `"Fill Assistant"`, `"No guest selected"` |
| `apps/desktop/src/screens/GuestListScreen.tsx` | 101 | `"Guest List"` |
| `apps/desktop/src/screens/OcrScreen.tsx` | — | Various display strings |
| `apps/desktop/src/screens/SettingsScreen.tsx` | — | Settings labels |

---

## 3. Anti-Patterns & Code Smells

### 3.1 God Objects / Monolithic Files

| File | Lines | Smell |
|------|-------|-------|
| `apps/desktop/src/features/fill/safetyEngine.ts` | 1609 | Contains fuzzy matching, validation, scoring, recommendations, quick fixes — 5+ responsibilities |
| `apps/desktop/src/screens/FillAssistantScreen.tsx` | 802 | UI rendering + state management + keyboard handling + field operations |
| `apps/desktop/src/services/auto-fill-execution-service.ts` | 560 | Service + executor + clipboard logic |
| `apps/desktop/src/ocr/paddle_ocr_engine.ts` | 331 | Engine + field parsing + confidence + fallback |
| `workers/ocr/guestfill_ocr/ocr/ocr_selector.py` | 402 | Candidate selection + multi-language fallback + scoring |
| `workers/ocr/guestfill_ocr/passport/passport_visual_ocr.py` | 285 | Field extraction + MRZ find + transliteration |

### 3.2 Code Duplication

| Description | Files |
|-------------|-------|
| MRZ check digit validation | `mrz_validator.py` (Python) + `mrz_checksum_validator.ts` (TS) |
| ISO3 country validation | `ocr_confidence_service.ts:49-299` + `safetyEngine.ts:198-265` |
| Sensitive data masking | `audit-log-service.ts:79-96` + `auto-fill-execution-service.ts:112-120` + `ocr_api.ts:282-303` |
| IndexedDB store wrappers | Repeated for audit_logs, auto_fill_profiles, settings, fill_events |
| MRZ field parsing (TD1/TD2/TD3) | `paddle_ocr_engine.ts:228-319` + `mrz_parser_service.ts` (TS) + `passport/mrz_parser.py` (Python) |
| OCR candidate scoring logic | `_score_td1_check_digits`, `_score_td2_check_digits`, `_score_td3_check_digits` are nearly identical |
| Multi-language OCR fallback | `_try_multi_lang_candidates` (line 266) and `try_multi_lang_paddleocr` (line 318) share ~80% code |

### 3.3 Inconsistent Error Handling

- **Dual patterns:** Some services use `Result<T,E>` discriminated unions, others throw exceptions.
- **Mixed paradigms:** `ocr_api.ts` returns `Result<_, ApiError>`, while `ocr_pipeline_service.ts` throws typed Errors.
- **Error type loss:** `Object.assign(error, { type })` pattern in pipeline service loses error type on serialization boundary.

### 3.4 Inline Business Logic in Components

**File:** `apps/desktop/src/screens/FillAssistantScreen.tsx:40-56`
- `accuracyBorderColor`, `accuracyBadge`, `accuracyBar` — presentation logic mixed with business thresholds (0.9, 0.7).

### 3.5 Global Mutable State

- `ocrStore.ts:22` — in-memory `Map` for OCR jobs (lost on refresh)
- `fillStore.ts` — in-memory session state
- `ocr_api.ts:71` — mutable `state` property

### 3.6 Missing Error Boundaries

- No `ErrorBoundary` component wrapping the route tree (`App.tsx`). Any unhandled render error will crash the full app.

### 3.7 Direct Use of Defaults Instead of User Config

**File:** `apps/desktop/src/screens/FillAssistantScreen.tsx:99,264`
- `DEFAULT_FIELD_ORDER` and `DEFAULT_KEYBOARD_SHORTCUTS` are hard-referenced instead of loading user settings, making settings UI effectively decorative.

### 3.8 Python `try/except` without specific exceptions

**File:** `workers/ocr/guestfill_ocr/passport/passport_visual_ocr.py:195`
```python
except Exception as e:
    return Err(OcrError(...))
```
Bare `except Exception` hides bugs (e.g., `KeyboardInterrupt`, `MemoryError`).

---

## 4. Maintainability Issues

### 4.1 No Dependency Injection Framework

Services use manual injection via factory functions (e.g., `createOcrPipelineService(imageQuality?, ...)`) — this works but becomes unwieldy with >5 dependencies and there is no centralized container.

### 4.2 TypeScript Type Safety Erosion

- Extensive use of `as` casts:
  - `as Record<string, unknown>` — 15+ occurrences
  - `as unknown as ArrayBuffer` — type escape hatch
  - `as Promise<OcrFieldResults>` — lying to the compiler
- `apps/desktop/src/screens/FillAssistantScreen.tsx:112`: `(guest as Record<string, unknown>)[fieldKey]` bypasses all type checking on guest fields.

### 4.3 Cross-Language Duplication

MRZ check digit validation is implemented independently in:
- `workers/ocr/guestfill_ocr/passport/mrz_validator.py` (~226 lines)
- `apps/desktop/src/services/mrz_checksum_validator.ts` (~177 lines)

Different implementations mean different bug profiles and double maintenance.

### 4.4 Test Coverage Gaps

Services with insufficient or missing tests:
- `audit-log-service.ts` — no unit tests found
- `fileUtils.ts` — no unit tests found
- `isTauri.ts` — no unit tests
- `copyAssistant.ts` — partial coverage in integration tests only
- `excelImport.ts` — no dedicated unit tests
- Python `passport_visual_ocr.py` — minimal test coverage

### 4.5 No Backward-Compatible API Versioning

Tauri commands (`invoke("run_ocr")`, etc.) have no versioning. Any change breaks all consumers simultaneously.

### 4.6 Configuration Redundancy

- `workers/ocr/guestfill_ocr/config/country_codes.json` (file) duplicates `ISO3_COUNTRIES` (TS code) and `ISO3_FROM_ISO2` (TS code).
- Excel column definitions exist in: `packages/shared/constants/columns.ts`, `workers/ocr/.../excel/columns.py`, `workers/ocr/.../config/excel_columns.json`.

### 4.7 Rust Backend Stub Commands

**File:** `apps/desktop/src-tauri/src/commands/`
- `excel_commands.rs:16,19` — `export_excel_placeholder` and `import_excel_placeholder` are no-op stubs.
- `ocr_commands.rs:75` — `run_ocr_placeholder` returns mock data.

---

## 5. Design Pattern Suggestions

### 5.1 Strategy Pattern — OCR Engine Selection

**Current:** If-else chains in `ocr_selector.py:200-263` and `paddle_ocr_engine.ts:75-123` to choose between PaddleOCR, Tesseract, multi-language fallback.

**Suggested:** A `Strategy` interface with concrete implementations (`PaddleOcrStrategy`, `TesseractStrategy`, `MultiLangStrategy`) selected by a `Context` class, making engine selection extensible without modifying existing code.

### 5.2 Repository Pattern — Data Access

**Current:** Ad-hoc `createIndexedDb*Store()` factories duplicated across 3+ files (audit-log, auto-fill-profile, settings).

**Suggested:** Single `IndexedDbRepository<T>` generic class parameterized by store name and key path, eliminating boilerplate duplication.

### 5.3 Observer/EventEmitter — Pipeline Progress

**Current:** Callback-based `onProgress` function passed through constructor chain.

**Suggested:** `EventEmitter` pattern with typed events (`pipeline:progress`, `pipeline:stage-change`, `pipeline:error`) allows multiple subscribers (UI, logging, diagnostics) without threading callbacks through constructors.

### 5.4 Chain of Responsibility — Field Validation

**Current:** `safetyEngine.ts` uses a single monolithic function `getAccuracyRecommendations` (~180 lines) checking every field type in sequence.

**Suggested:** Chain of validators (`PassportValidator`, `DateValidator`, `GenderValidator`, `NameValidator`) each handling one concern, composable and testable individually.

### 5.5 Decorator Pattern — Confidence Scoring

**Current:** Static scoring in `ocr_confidence_service.ts` with all penalties/bonuses hardcoded.

**Suggested:** `ConfidenceScorer` base interface with decorators (`DateValidationDecorator`, `CheckDigitDecorator`, `CountryValidationDecorator`) stacked dynamically based on available data.

### 5.6 Template Method — MRZ Detection Flow

**Current:** `HeuristicMrzDetectionService` and `TauriMrzDetectionService` implement the full flow independently with duplicated orchestration.

**Suggested:** Template Method with abstract steps (`loadImage`, `computeProjection`, `findBands`, `selectBand`, `extractRegion`) shared across implementations.

### 5.7 Command Pattern — Fill Actions

**Current:** Direct mutation of guest state in `FillAssistantScreen.tsx` for quick-fix applications, with no undo support.

**Suggested:** `Command` pattern with `ApplyQuickFixCommand`, `CopyFieldCommand`, `MarkFilledCommand` — each supporting `execute()` / `undo()` for reversible operations.

### 5.8 Builder Pattern — NormalizedFields Construction

**Current:** Manual object construction in `mapParseResultToMrzParsedFields` with spread operators.

**Suggested:** `NormalizedFieldsBuilder` with fluent API for composing fields from multiple sources (MRZ + visual + manual) with validation at build time.

### 5.9 State Pattern — OCR Session Management

**Current:** Discriminated union `OcrSessionState` in `ocr_api.ts:39-42` with switch logic.

**Suggested:** Full State pattern with `IdleState`, `ProcessingState`, `ConfirmedState` classes each owning valid transitions, preventing illegal state changes at compile time.

### 5.10 Adapter Pattern — External System Integration

**Current:** `DefaultFillExecutor` has inline logic for web/desktop/clipboard fill with `if (isTauri())` checks.

**Suggested:** Adapters (`WebFillAdapter`, `DesktopFillAdapter`, `ClipboardFillAdapter`) implementing a common `FillAdapter` interface, selected by a resolver based on runtime environment.
