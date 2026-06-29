# OCR & Auto-Fill Current State Analysis

> Generated: 2026-06-29
> Updated: 2026-06-29 (verified against actual source code)
> Scope: Full analysis of OCR worker (Python) and Auto-fill module (TypeScript)

---

## 1. Overview

The GuestFill project processes scanned passports/ID documents through an OCR pipeline, then fills hotel management system forms via an auto-fill module. The codebase totals ~5,500 lines of Python (82 files) for OCR and ~2,632 lines of TypeScript (7 files) for auto-fill, supported by ~2,500 lines of tests (10 TS test files, 27+8 Python test files).

---

## 2. OCR Implementation: Current State

### 2.1 What Works Well

| Capability              | Details                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| MRZ parsing             | TD1 (3×30), TD2 (2×36), TD3 (2×44) formats fully supported with field extraction                                |
| Check digit validation  | ICAO 9303 weighted validation (weights 7,3,1) for passport number, DOB, expiry, optional, composite             |
| MRZ repair              | Bidirectional character repair map (O↔0, I↔1, B↔8, S↔5, Z↔2) with check-digit verification                      |
| Multi-engine OCR        | PaddleOCR (primary, 16 languages) → Tesseract (fallback) → Online (stubbed)                                     |
| Language resolution     | 60+ country codes mapped to PaddleOCR and Tesseract language codes                                              |
| Language auto-detect    | Fallback chain: MRZ country code → multilingual model → multi-language ensemble                                 |
| Adaptive preprocessing  | 5 paths: Standard, Worn/creased, Low contrast, Glare, RTL — selected by quality analysis                        |
| Quality analysis        | Blur, brightness, contrast, skew, glare, crease, wear detection with warning thresholds                         |
| Script detection        | 8 script types (latin, arabic, cyrillic, cjk, devanagari, thai, hebrew, greek) via connected-component analysis |
| Transliteration         | ISO-standard mappings for Arabic, Cyrillic, Greek, Devanagari, Thai; CJK preserved (confidence 0.3)             |
| Field normalization     | Name, passport number, gender, date, country — with ISO2→ISO3 mapping (20 entries)                              |
| Confidence scoring      | Per-document scoring (0.0–1.0) with HIGH≥0.90 / MEDIUM≥0.70 / LOW<0.70 thresholds                               |
| Excel export            | 4 sheets (Guests, Errors, Instructions, Diagnostics) with color-coded status, filters, dropdowns                |
| Security                | Sensitive data masking (passport/ID/name/DOB), safe logging wrapper                                             |
| Document classification | Auto-detect passport vs ID card via aspect ratio + text density heuristics                                      |

### 2.2 Key File Metrics

| File                     | Lines | Purpose                                                                  |
| ------------------------ | ----- | ------------------------------------------------------------------------ |
| `paddleocr_engine.py`    | 513   | Primary OCR engine wrapper, MRZ extraction pipeline                      |
| `ocr_selector.py`        | 402   | Candidate scoring, engine selection, multi-language fallback             |
| `passport_visual_ocr.py` | 280   | Visual zone OCR with multilingual field patterns (7 languages)           |
| `mrz_validator.py`       | 226   | ICAO-weighted check digit validation for all 3 MRZ formats               |
| `language_resolver.py`   | 217   | 60+ country → PaddleOCR/Tesseract/script mapping                         |
| `script_detector.py`     | 218   | 8-script classification via pixel-density + connected-component analysis |
| `mrz_parser.py`          | 194   | TD1/TD2/TD3 field extraction                                             |
| `mrz_repair.py`          | 163   | Check-digit-verified character repair                                    |
| `quality_analyzer.py`    | 163   | 7 metrics: blur, brightness, contrast, skew, glare, crease, wear         |
| `transliteration.py`     | 246   | 6-script ISO-standard transliteration                                    |
| `preprocess.py`          | 150   | 5 adaptive preprocessing paths                                           |
| `confidence_engine.py`   | 99    | Per-document confidence scoring with 12 modifiers                        |

### 2.3 Limitations: Global Support

| #   | Limitation                                          | File                                           | Impact                                                                                                                                          |
| --- | --------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **PaddleOCR limited to 16 languages**               | `paddleocr_engine.py:47-68`                    | Cannot natively OCR documents in languages like Bengali, Hebrew, Thai, Devanagari-script; no GPU detection fallback to CPU                      |
| 2   | **CJK transliteration is a no-op**                  | `transliteration.py:203-210`                   | Chinese/Japanese/Korean names in visual zone pass through as-is (confidence 0.3)                                                                |
| 3   | **No EasyOCR integration**                          | `ocr_selector.py`                              | 80+ languages available via EasyOCR are not supported                                                                                           |
| 4   | **Online fallback stubbed**                         | `online_fallback.py`                           | Cloud OCR API fallback always returns error                                                                                                     |
| 5   | **ID card OCR is rudimentary (21 lines)**           | `id_card_ocr.py`                               | Tesseract PSM 4 only (no PaddleOCR); basic regex parsing via `id_field_parser.py` may fail on non-Western ID layouts; no field-level confidence |
| 6   | **Visual OCR field patterns limited**               | `passport_visual_ocr.py:15-42`                 | Only 7 languages; Arabic, Hindi, Thai, Hebrew field labels not mapped                                                                           |
| 7   | **Script detection not integrated into visual OCR** | `passport_visual_ocr.py:90`                    | Visual OCR uses only country-based language, not image-based script detection                                                                   |
| 8   | **Confidence penalty for visual fallback**          | `confidence_engine.py:46`                      | -0.15 penalty even when visual OCR reads all fields correctly                                                                                   |
| 9   | **No per-field confidence in Excel export**         | `excel/export_excel.py`                        | Only overall confidence exported; per-field confidence not propagated                                                                           |
| 10  | **Missing countries in language maps**              | `language_resolver.py:10-31`                   | Some African nations (ETH, TZA, UGA, etc.) not mapped                                                                                           |
| 11  | **No driver's license support**                     | Classification only handles passport + ID card | No support for US/European driver's licenses                                                                                                    |

### 2.4 Limitations: Accuracy

| #   | Limitation                                    | File                                                      | Impact                                                                                                                                                                                                                               |
| --- | --------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Single-image sequential processing**        | `pipeline/document_processor.py`                          | No parallel batch processing despite `concurrency` option                                                                                                                                                                            |
| 2   | **No upside-down document handling**          | `paddleocr_engine.py:322-328` (`_try_detect_upside_down`) | Reverses string content rather than rotating image; heuristic checks last-char `<` ratio which is fragile                                                                                                                            |
| 3   | **MRZ format detection is length-only**       | `mrz_parser.py:_detect_format`                            | 44-char non-MRZ line misidentified as TD3                                                                                                                                                                                            |
| 4   | **`validate_check_digits_td2()` logic error** | `mrz_validator.py:215-216`                                | Composite check = `passport_number_valid OR (no PASSPORT_* errors)` — not a real check digit validation. Unlike TD3 (which computes actual composite check digit at line 156-162), TD2 uses a boolean shortcut that trivially passes |
| 5   | **No gender "X" support**                     | `field_normalizer.py:normalize_gender`                    | Only M/F/UNKNOWN handled; non-binary gender not supported                                                                                                                                                                            |
| 6   | **Bare except in OCR sync**                   | `paddleocr_engine.py:206-207`                             | `except Exception:` catches all errors, including `KeyboardInterrupt` and `SystemExit`                                                                                                                                               |
| 7   | **PaddleOCR instance cache not LRU**          | `paddleocr_engine.py:49-60`                               | Per-language caching without limit; memory issue if many languages tried                                                                                                                                                             |
| 8   | **Result type inconsistency**                 | `passport/mrz_parser.py`                                  | Some fns return `Result[dict]`, others return bare dicts                                                                                                                                                                             |
| 9   | **`Err.unwrap_or()` returns None**            | `common/result.py:46`                                     | Body is `...` (empty/stub); `Err.unwrap_or(default)` returns `None` instead of `default`, potentially causing downstream `AttributeError` on None                                                                                    |

### 2.5 Test Coverage (OCR)

| Test Area           | Files         | Test Count | Coverage Quality                                     |
| ------------------- | ------------- | ---------- | ---------------------------------------------------- |
| MRZ parsing         | 1             | ~12        | Good — TD1/TD2/TD3, edges                            |
| MRZ validator       | 1             | ~25        | Good — all 3 formats, repair field                   |
| MRZ repair          | 1             | ~5         | Basic — could be expanded                            |
| PaddleOCR engine    | 1             | ~60        | Excellent — grouping, detection, scoring, edge cases |
| OCR selector        | 1             | ~40        | Good — scoring, engine selection, fallback           |
| Language resolver   | 1             | ~30        | Good — 60+ countries, all resolution funcs           |
| Transliteration     | 1             | ~15        | Good — all 6 scripts, edge cases                     |
| Quality analyzer    | 1             | ~20        | Good                                                 |
| Confidence engine   | 1             | ~12        | Good                                                 |
| E2E pipeline        | 3             | ~30        | Good — full parse→validate→repair→export             |
| **Total OCR tests** | **14+ files** | **~250**   | **Well-covered**                                     |

---

## 3. Auto-Fill Implementation: Current State

### 3.1 What Works Well

| Capability                     | Details                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Safety Engine                  | 1,343-line comprehensive accuracy framework: per-field checks, cross-field validation, OCR confidence blending                              |
| Accuracy-aware copy            | Copy assistant gates on ≥0.70 accuracy; returns warnings when below threshold                                                               |
| Transform Engine               | 11 rule types: trim, case conversion, date format, gender, country, strip, phone, replace, prefix/suffix, custom mapping                    |
| Passport validation by country | 46 country-specific regex patterns                                                                                                          |
| Cross-field validation         | 6 checks: nationality vs issuing, name consistency, expiry vs DOB, passport format vs country, gender inference, validity period            |
| Field accuracy scoring         | Per-field: name (digit/length/special chars), passport (ambiguous chars/format/pattern), ID, date (parse/range/expiry), gender, nationality |
| Country format expansion       | ISO2→ISO3 (2 copies), ISO3→Name in transform engine                                                                                         |
| Quick fix suggestions          | ~175 lines of conditional recommendations per field type                                                                                    |
| Template management            | CRUD over IndexedDB, JSON import/export                                                                                                     |
| Fill store                     | In-memory session + IndexedDB persistence with CSV export                                                                                   |
| Fuzzy name matching            | 4-level: exact, normalized (diacritic-stripped), Soundex, Levenshtein                                                                       |
| Fill event logging             | 17 event types logged with status, masking in export                                                                                        |
| Field confidence blending      | Blends accuracy score with per-field OCR confidence (when available)                                                                        |

### 3.2 Key File Metrics

| File                 | Lines | Purpose                                                          |
| -------------------- | ----- | ---------------------------------------------------------------- |
| `safetyEngine.ts`    | 1,343 | Accuracy scoring, cross-field checks, quick fixes, safety gating |
| `copyAssistant.ts`   | 369   | Field copy with accuracy checks, navigation, batch copy          |
| `excelImport.ts`     | 329   | Excel reading, column mapping, row normalization, deduplication  |
| `transformEngine.ts` | 259   | 11 transform rules, date/phone/country/gender format conversion  |
| `fillStore.ts`       | 79    | In-memory session, IndexedDB persistence, CSV export             |
| `fillConstants.ts`   | 56    | Field definitions, keyboard shortcuts                            |
| `fillTypes.ts`       | 36    | Fill-specific types                                              |
| `templateManager.ts` | 48    | Template CRUD                                                    |

### 3.3 Limitations: Global Support

| #   | Limitation                                              | File                                                     | Impact                                                                                                   |
| --- | ------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | **Passport patterns for only 46 countries**             | `safetyEngine.ts:36-93`                                  | Countries like Syria, Iraq, Afghanistan, most African nations use generic fallback `^[A-Za-z0-9]{5,20}$` |
| 2   | **Default phone country code = Vietnam (+84)**          | `transformEngine.ts:88-89`                               | Wrong format for non-Vietnamese phone numbers                                                            |
| 3   | **Gender name database biased**                         | `safetyEngine.ts:296-317`                                | 110 masculine + 122 feminine names; mostly Western + Vietnamese; many Asian/African/ME names absent      |
| 4   | **Missing ISO2→ISO3 mappings**                          | `safetyEngine.ts:194-209`                                | 59 countries mapped (59/195 UN members). Missing: Cuba, Croatia, Serbia, Slovakia, Slovenia, etc.        |
| 5   | **Duplicate ISO2→ISO3 mapping**                         | `safetyEngine.ts:194-209` + `transformEngine.ts:116-186` | Two copies with slightly different entries; DRY violation, maintenance risk                              |
| 6   | **ISO3→Name only 53 countries**                         | `transformEngine.ts:188-255`                             | Many nationalities return ISO code unchanged                                                             |
| 7   | **No address fields**                                   | `packages/shared/src/types/guest.ts`                     | Hotels need address/city/state/zip for registration forms                                                |
| 8   | **No transliteration during accuracy check**            | `safetyEngine.ts`                                        | Names in non-Latin scripts flagged as low accuracy; no transliteration comparison                        |
| 9   | **Country-specific format not used in date validation** | `safetyEngine.ts:1238-1240`                              | Date format validation does not consider country-specific defaults                                       |

### 3.4 Limitations: Accuracy

| #   | Limitation                                          | File                                             | Impact                                                                                                               |
| --- | --------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 1   | **No actual Tauri backend for Excel**               | `excelApi.ts:6-11`                               | `import_excel_placeholder` and `export_excel_placeholder` are stubs; Excel import/export is client-side only         |
| 2   | **URL pattern matching primitive**                  | `safetyEngine.ts:1334-1342`                      | `includes` + `*` → regex; no support for query params, fragments, regex patterns                                     |
| 3   | **Window title matching primitive**                 | `safetyEngine.ts:970-981`                        | Simple `includes()` after removing `*`                                                                               |
| 4   | **Hardcoded accuracy thresholds**                   | `safetyEngine.ts:714`, `copyAssistant.ts:69`     | 0.9/0.7 thresholds not configurable                                                                                  |
| 5   | **Date parsing uses `new Date()`**                  | `safetyEngine.ts`, `copyAssistant.ts`, `date.ts` | Browser-dependent, inconsistent across platforms                                                                     |
| 6   | **No error recovery in import**                     | `excelImport.ts:103-105`                         | Failed `saveGuestRow()` for one row doesn't roll back entire import                                                  |
| 7   | **No fill state management**                        | `FillState` type exists but no implementation    | `copiedFields`, `filledFields`, `failedFields` not tracked                                                           |
| 8   | **SafetyRule system unused**                        | `template.ts:40-55`                              | 4 rule types defined (`field_exists`, `page_url_matches`, `window_title_matches`, `no_popup`) but no evaluation code |
| 9   | **Auto-save is type-only**                          | `safetyEngine.ts:993-1053`                       | `checkAutoSaveSafety` validates but no auto-save execution exists                                                    |
| 10  | **No web/desktop automation**                       | All modules                                      | Only clipboard-based copy; web and desktop automation types exist but unimplemented                                  |
| 11  | **`getFieldsInOrder` uses `in` operator**           | `copyAssistant.ts:239`                           | Returns true for prototype properties; should use `Object.hasOwn()`                                                  |
| 12  | **No progress/cancellation for batch copy**         | `copyAssistant.ts:289-335`                       | `copyAllHighConfidenceFields` loops synchronously with no cancellation                                               |
| 13  | **Excel import validation minimal**                 | `excelValidation.ts` (15 lines)                  | Only validates fullName required + documentType valid; no date/passport/gender format validation                     |
| 14  | **Undefined transform rules silently pass through** | `transformEngine.ts:112`                         | `default: return value` ignores unknown rule types instead of warning                                                |
| 15  | **Cross-field penalty is arbitrary**                | `safetyEngine.ts:714`                            | `crossFieldIssues.length * 0.1` — not calibrated against real data                                                   |

### 3.5 Test Coverage (Auto-Fill)

| Test Area          | Files  | Test Lines | Coverage Quality                                                              |
| ------------------ | ------ | ---------- | ----------------------------------------------------------------------------- |
| Safety engine unit | 1      | 705        | Excellent — all safety checks, passport patterns, cross-field, fuzzy matching |
| Safety engine E2E  | 1      | 425        | Good — full pipeline, template matching, auto-save                            |
| Copy assistant     | 1      | 368        | Good — navigation, accuracy checks, batch copy                                |
| Transform engine   | 1      | 188        | Good — all 11 rule types, date conversions                                    |
| Fill workflow E2E  | 1      | 260        | Good — import→review→transform→copy→fill                                      |
| Fill store E2E     | 1      | 277        | Good — persistence, CSV export, masking                                       |
| Excel import E2E   | 1      | 158        | Good — validation, masking, dates                                             |
| Template CRUD      | 1      | 74         | Good                                                                          |
| Excel validation   | 1      | 54         | Basic — only 5 tests                                                          |
| **Total TS tests** | **10** | **~2,500** | **Well-covered**                                                              |

---

## 4. Combined Gaps: Global Support

### 4.1 Pipeline Gaps (OCR → Excel → Auto-Fill)

| Gap                                                              | Where                                                                            | Impact                                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Per-field confidence NOT propagated from OCR → Excel → Auto-fill | `confidence_engine.py` → `export_excel.py` → `excelImport.ts`                    | User cannot see per-field reliability in fill UI; accuracy engine blends with overall confidence only |
| No consistency between duplicate country mappings                | `language_resolver.py` (Python) vs `safetyEngine.ts` / `transformEngine.ts` (TS) | 3 separate implementations of country→data mappings; divergence risk                                  |
| MRZ O<->0 / I<->1 repair not reflected in accuracy score         | `mrz_repair.py` → `safetyEngine.ts`                                              | Repaired characters should flag field for review                                                      |
| Transliteration results not available in auto-fill UI            | `transliteration.py` → Excel → `safetyEngine.ts`                                 | Non-Latin names shown as-is in fill UI, no Latin transliteration displayed                            |
| Document type "UNKNOWN" unsupported in auto-fill                 | `guest.ts:DocumentType`                                                          | If OCR classifies as UNKNOWN, auto-fill may skip or error                                             |

### 4.2 Language Coverage Summary

| Script     | PaddleOCR                          | Tesseract                    | EasyOCR (not integrated) | Transliteration           |
| ---------- | ---------------------------------- | ---------------------------- | ------------------------ | ------------------------- |
| Latin      | ✅ `en,fr,de,es,it,pt,nl,pl,vi,tr` | ✅ 10+ language packs        | ✅ 50+                   | N/A                       |
| Arabic     | ✅ `ar`                            | ✅ `ara`                     | ✅                       | ✅ ISO 233                |
| Cyrillic   | ✅ `ru`                            | ✅ `rus,ukr,bul,kaz,belt`    | ✅                       | ✅ ISO 9                  |
| CJK        | ✅ `ch,ja,ko`                      | ✅ `chi_sim,chi_tra,jpn,kor` | ✅                       | ❌ No-op (confidence 0.3) |
| Devanagari | ❌ Not supported                   | ✅ `eng` (Latin only)        | ✅                       | ✅ ISO 15919              |
| Thai       | ❌ Not supported                   | ✅ `tha`                     | ✅                       | ✅ ISO 11940              |
| Hebrew     | ❌ Not supported                   | ✅ `heb`                     | ✅                       | ❌ Not implemented        |
| Bengali    | ❌ Not supported                   | ✅ `ben`                     | ✅                       | ❌ Not implemented        |

---

## 5. Recommendations Priority

### Critical (Security/Functionality)

1. **Implement real Tauri commands for Excel import/export** — `excelApi.ts` placeholders block core workflow
2. **Consolidate country mapping** — single source of truth for ISO2→ISO3, ISO3→Name across Python and TypeScript
3. **Fix `validate_check_digits_td2()` composite logic** — `mrz_validator.ts:215-216` is incorrect

### High (Global OCR)

4. **Integrate EasyOCR** — 80+ languages for scripts PaddleOCR doesn't support (Devanagari, Thai, Hebrew, Bengali)
5. **Propagate per-field confidence through pipeline** — OCR → Excel → Auto-fill UI
6. **Fix CJK transliteration** — Integrate pypinyin/pykakasi for actual Chinese/Japanese/Korean transliteration
7. **Expand visual OCR field patterns** — Add Arabic, Hindi, Thai, and other field labels
8. **Add Hebrew transliteration** — ISO-standard mapping

### High (Auto-Fill Accuracy)

9. **Extend passport patterns to 100+ countries** — Cover all UN member states
10. **Add address fields** — GuestRow needs address/city/state/zip/country support
11. **Move accuracy thresholds to configuration** — Make 0.9/0.7 thresholds customizable
12. **Implement transliteration-aware name matching** — Compare non-Latin names via transliterated forms
13. **Fix phone default country code** — Make configurable instead of hardcoded to Vietnam (+84)

### Medium

14. **Add upside-down document correction** — Rotate image instead of string reversal
15. **Gender "X" support** — Non-binary/unspecified gender handling
16. **Implement SafetyRule evaluation** — Templates have rule types but no evaluation code
17. **Excel import validation** — Add date/passport/gender format validation during import
18. **Implement auto-save execution** — Beyond safety checks
19. **Batch copy cancellation support** — Progress/cancel for `copyAllHighConfidenceFields`
20. **Driver's license support** — Common in US/Canada/Australia

### Low

21. **Expand gender name database** — More Asian/African/ME names
22. **LRU cache for PaddleOCR instances** — Memory management for many language models
23. **MRZ detection improvement** — Content validation in addition to length check
24. **Date parsing consistency** — Replace `new Date()` with explicit parsing
25. **Fix `getFieldsInOrder` `in` operator** — Use `Object.hasOwn()`
26. **Warn on unknown transform rules** — Instead of silent passthrough

---

## 6. Remaining Observed Issues

- **No TODO/FIXME markers** in either codebase — code is clean but no planned improvements documented
- **`Err.unwrap_or()` body is `...` (empty ellipsis)** — `result.py:46` returns `None` instead of the `default` value; any consumer relying on `unwrap_or` with `Err` gets `None` and may crash
- **PaddleOCR model download blocking** — First call blocks without progress indication
- **`validate_check_digits_td2()` composite logic** — `mrz_validator.py:215-216` uses `passport_number_valid OR (no PASSPORT_* errors)` instead of computing the actual ICAO composite check digit (TD3 correctly computes it at line 156-162); this is a bug that makes `overall_valid` less reliable for TD2 documents
- **No PDF/A or encrypted PDF support** — `pdf_renderer.py` only handles standard PDFs
- **No multi-page document merging** — Each PDF page treated as separate document
- **`_run_ocr_sync` bare except** — `paddleocr_engine.py:206-207` catches all `Exception` including `KeyboardInterrupt`/`SystemExit`
