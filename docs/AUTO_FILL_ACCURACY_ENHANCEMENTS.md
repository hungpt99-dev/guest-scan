# Auto-Fill Accuracy & Usability Enhancements

> **Status: Partially Implemented**
> **Related:** [Auto-Fill Technical Design](AUTO_FILL_TECHNICAL_DESIGN.md)

> The following features from this design proposal are **already implemented**:
>
> - Per-field accuracy scoring with HIGH/MEDIUM/LOW levels (`safetyEngine.ts`)
> - Actionable recommendations (~175 lines of quick-fix suggestions)
> - Country-specific passport patterns (46 countries)
> - Cross-field validation (6 checks)
> - Fuzzy name matching (4 levels)
> - `strip` and `phone_format` transform rules
> - Visual confidence indicators in Fill UI
>
> **Remaining (not yet implemented):** Address field support, correction learning system, customizable keyboard shortcuts, batch fill mode.

## 1. Goals

Improve auto-fill accuracy so the user can trust the pre-filled data with minimal review. Enhance usability to make the fill workflow intuitive, efficient, and confidence-driven.

## 2. Current Limitations

| Area                   | Limitation                                                             | Impact                                                  |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| Field accuracy         | Basic format checks only (name length, passport format, date validity) | Misses country-specific document patterns               |
| Confidence propagation | OCR confidence stored per guest but not per field                      | User cannot see which fields are reliable               |
| Accuracy gating        | Binary: `>=0.7` passes, `<0.7` blocks with generic warning             | No actionable guidance on how to fix                    |
| Cross-field validation | Only nationality vs issuing country consistency check                  | Misses DOB/document-number patterns, gender consistency |
| Name handling          | No transliteration support; exact match only                           | Non-Latin names or name variants flagged as errors      |
| Transform engine       | 11 rule types, no chaining validation                                  | Transforms can produce invalid output silently          |
| Address support        | No address field or address normalization                              | Hotels in non-Western countries need address data       |
| User corrections       | No learning — user fixes the same issues repeatedly                    | Manual rework on every session                          |
| Fill UI                | No visual confidence indicators beyond text                            | User must click each field to see accuracy              |
| Date format detection  | Format list is hardcoded; no per-country defaults                      | Users in different regions see wrong format hints       |
| Keyboard shortcuts     | Fixed set of 7 shortcuts                                               | Power users cannot customize                            |

## 3. Design

### 3.1 Per-Field Confidence Propagation

Propagate OCR-level confidence to the auto-fill UI so users can see which fields are trustworthy at a glance.

```
┌─────────────────────────────────────────────────────────┐
│              Confidence Data Flow                         │
│                                                           │
│  OCR Worker                          Desktop App          │
│  ┌─────────────────────┐            ┌─────────────────┐  │
│  │ Field extractor     │ Excel      │ Excel Import    │  │
│  │   fullName: {val,   │ ───────►   │   Parses        │  │
│  │     conf: 0.95}     │ xlsx       │   confidence    │  │
│  │   passportNum: {val,│            │   per field     │  │
│  │     conf: 0.88}     │            │                 │  │
│  │   ...               │            │   GuestRow      │  │
│  └─────────────────────┘            │   .fieldConf    │  │
│                                     │   Map<string,   │  │
│                                     │    number>      │  │
│                                     └────────┬────────┘  │
│                                              │           │
│                                     ┌────────▼────────┐  │
│                                     │  Fill UI         │  │
│                                     │  Field: Full Name│  │
│                                     │  Value: John Doe │  │
│                                     │  [■■■■■■■□□] 0.92│  │
│                                     │  (color-coded)   │  │
│                                     └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

#### Changes required:

**OCR Worker (`field_extractor.py`)**:

- Each extracted field returns `{value: str, confidence: float}`
- Confidence per field = weighted combination of:
  - Character-level OCR confidence (from OCR engine)
  - Check digit confidence (for passport number, DOB, expiry)
  - Field format validity (normalization success, pattern match)
- Confidence propagated through the Excel export as additional columns

**Excel Import (`excelImport.ts`)**:

- New column: `columnName_conf` for each field (optional, non-breaking)
- If confidence columns exist, parse them into `GuestRow.fieldConfidence`

**GuestRow type (`packages/shared/src/`)**:

```typescript
interface GuestRow {
  // ... existing fields
  fieldConfidence?: Record<string, number>; // fieldName -> 0.0-1.0
}
```

**Safety Engine (`safetyEngine.ts`)**:

- New function: `checkFieldConfidence(guest, fieldName, threshold?)`
- Returns pass/fail + the field-level confidence
- Used by copy assistant for per-field gating

**Fill UI**:

- Each field rendered with a confidence bar/indicator:
  - Green (≥0.90): high confidence
  - Yellow (0.70-0.89): medium confidence, verify
  - Red (<0.70): low confidence, review required
- Clicking the indicator shows breakdown: OCR confidence, validation result

### 3.2 Enhanced Accuracy Engine

Replace the basic format checks with a structured, extensible accuracy framework.

```
┌─────────────────────────────────────────────────────────┐
│              Accuracy Engine Architecture                 │
│                                                           │
│  AccuracyEngine                                            │
│  ├── perFieldChecks: Map<FieldType, FieldValidator>       │
│  │   ├── fullName: NameValidator                         │
│  │   │   ├── lengthCheck()                               │
│  │   │   ├── digitRatioCheck()   (names shouldn't be     │
│  │   │   │                          mostly digits)       │
│  │   │   ├── charSetCheck()      (chars valid for script)│
│  │   │   └── transliterationCheck() (if non-Latin)       │
│  │   │                                                     │
│  │   ├── passportNumber: PassportValidator                │
│  │   │   ├── countryPatternCheck()  (per-country format)  │
│  │   │   ├── checkDigitCheck()      (ICAO weighted)       │
│  │   │   ├── lengthCheck()                                │
│  │   │   └── checkDigitConsistency() (OCR vs computed)    │
│  │   │                                                     │
│  │   ├── dateOfBirth: DateValidator                       │
│  │   │   ├── parseableCheck()                             │
│  │   │   ├── rangeCheck()         (not future, not        │
│  │   │   │                          before 1900)          │
│  │   │   ├── ageConsistencyCheck() (vs document type)     │
│  │   │   └── formatExpectedCheck() (per-country format)   │
│  │   │                                                     │
│  │   └── nationality: CountryValidator                    │
│  │       ├── isoCodeCheck()       (valid ISO)             │
│  │       └── issuingConsistencyCheck() (MRZ country match)│
│  │                                                         │
│  ├── crossFieldChecks: CrossFieldValidator[]              │
│  │   ├── nationalityMatchesIssuingCountry()               │
│  │   ├── passportNumberConsistentWithCountry()            │
│  │   ├── ageConsistentWithDocumentType()                  │
│  │   ├── genderConsistentAcrossFields()                   │
│  │   └── nameConsistentAcrossDocuments()  (fuzzy match)   │
│  │                                                         │
│  └── result: AccuracyReport                               │
│      ├── overall: {score, level, status}                  │
│      ├── perField: Map<fieldName, FieldAccuracy>          │
│      ├── crossFieldIssues: AccuracyIssue[]                │
│      └── recommendations: string[]  (actionable fixes)    │
└─────────────────────────────────────────────────────────┘
```

#### Country-Specific Passport Number Patterns

Extend `safetyEngine.ts` with a passport pattern registry:

```typescript
const PASSPORT_PATTERNS: Record<string, RegExp[]> = {
  GBR: [/^\d{9}$/], // 9 digits
  USA: [/^\d{9}$/], // 9 digits
  CHN: [/^[A-Z]\d{8}$/], // 1 letter + 8 digits
  JPN: [/^[A-Z]{2}\d{7}$/], // 2 letters + 7 digits
  KOR: [/^\d{8}$/], // 8 digits
  RUS: [/^\d{9}$/], // 9 digits
  ARE: [/^[A-Z]{2}\d{7}$/], // 2 letters + 7 digits
  VNM: [/^[A-Z]\d{7}$/], // 1 letter + 7 digits
  IND: [/^[A-Z]\d{7}$/], // 1 letter + 7 digits
};
```

#### Actionable Recommendations

Replace generic "low accuracy" warnings with specific, actionable messages:

| Condition                    | Current Warning           | New Recommendation                                                             |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| Name is short                | "Name may be incomplete"  | "Name is 2 characters — check for truncation. Common in Vietnamese passports." |
| Passport number format wrong | "Invalid passport format" | "GBR passport numbers are 9 digits. Got: AB123456 — remove letters."           |
| Date is future for DOB       | "Invalid date of birth"   | "Date of birth cannot be in the future. Expected format: DD/MM/YYYY"           |
| Nationality mismatch         | "Nationality mismatch"    | "Nationality VNM doesn't match issuing country USA. Verify dual citizenship."  |

### 3.3 Address Handling (New Feature)

Add address fields for hotel registration forms that require address data.

#### New Fields

```typescript
// In fillConstants.ts
{
  key: 'address',
  label: 'Address',
  group: 'contact'
},
{
  key: 'city',
  label: 'City',
  group: 'contact'
},
{
  key: 'state',
  label: 'State/Province',
  group: 'contact'
},
{
  key: 'zipCode',
  label: 'ZIP/Postal Code',
  group: 'contact'
},
{
  key: 'country',
  label: 'Country of Residence',
  group: 'contact'
}
```

#### Address Format Registry (new file: `features/fill/addressFormatter.ts`)

```typescript
interface AddressFormat {
  order: string[]; // field display order
  fieldLabels: Record<string, string>; // localized labels
  zipPattern: RegExp; // ZIP code validation
  required: string[]; // required fields for this country
}

const ADDRESS_FORMATS: Record<string, AddressFormat> = {
  VNM: {
    order: ["address", "city", "country"],
    zipPattern: /^\d{6}$/,
    required: ["address", "city"],
  },
  USA: {
    order: ["address", "city", "state", "zipCode", "country"],
    zipPattern: /^\d{5}(-\d{4})?$/,
    required: ["address", "city", "state", "zipCode"],
  },
  JPN: {
    order: ["zipCode", "state", "city", "address", "country"],
    zipPattern: /^\d{3}-\d{4}$/,
    required: ["zipCode", "address", "city"],
  },
};
```

#### Data Source

Address data is not extracted by OCR (passports/IDs don't contain addresses). Instead:

- User enters manually in the Excel review step (new column)
- Or imported from hotel PMS (future integration)
- Fill UI marks address fields as "manual entry required" when empty

### 3.4 User Correction Learning (Local-Only)

A lightweight, privacy-preserving learning system that remembers user corrections to reduce repetitive manual fixes.

```
┌────────────────────────────────────────────────────────────┐
│                  Correction Learning                         │
│                                                              │
│  Storage: IndexedDB, `correction_learnings` store            │
│                                                              │
│  Record: {                                                    │
│    id: string,                                                │
│    originalValue: string,       // e.g., "0"                 │
│    correctedValue: string,      // e.g., "O"                 │
│    fieldName: string,           // e.g., "passportNumber"    │
│    documentType: string,        // e.g., "PASSPORT"          │
│    issuingCountry: string,      // e.g., "VNM"               │
│    count: number,               // times this correction     │
│    lastApplied: timestamp       // when last used            │
│  }                                                             │
│                                                              │
│  Flow:                                                       │
│  1. User corrects a field value in the fill UI              │
│  2. System logs original → corrected pair                   │
│  3. On next import of similar document (same country/type):  │
│     a. Check if any field matches a known correction        │
│     b. If match with high confidence (count >= 3):          │
│        - Apply correction automatically                     │
│        - Mark field as "auto-corrected" in UI               │
│     c. If match with low confidence (count 1-2):            │
│        - Show suggestion badge: "Did you mean X?"           │
│  4. All learning is local — no sync, no export              │
│                                                              │
│  Privacy:                                                    │
│  - Corrected values ARE guest data (may be name, number)    │
│  - Stored in IndexedDB (same security boundary as guests)   │
│  - Learning can be disabled in settings                     │
│  - User can clear all learning data                         │
└────────────────────────────────────────────────────────────┘
```

### 3.5 Fuzzy Name Matching for Cross-Field Consistency

Add fuzzy matching for names to handle transliteration variants (e.g., "Nguyen" vs "Nguyễn", "Mohammed" vs "Muhammad").

```typescript
interface NameMatchResult {
  match: boolean;
  similarity: number; // 0.0 - 1.0
  method: "exact" | "normalized" | "soundex" | "transliteration";
}

function fuzzyMatchNames(name1: string, name2: string): NameMatchResult {
  // Strategy:
  // 1. Exact match (case-insensitive) → return 1.0
  // 2. Normalized (strip diacritics) → return 0.95
  // 3. Soundex for English-like names → return 0.85 if match
  // 4. Character-level similarity (Levenshtein) → return normalized distance
  // 5. No match → return 0.0
}
```

**Usage in safety engine**: When comparing names across two documents or verifying name consistency, use fuzzy matching instead of exact comparison. Only flag as issue if similarity < 0.7.

### 3.6 Transform Engine Enhancements

#### Chaining Validation

Add validation that the transform chain produces a valid result:

```typescript
function validateTransformChain(value: string, rules: TransformRule[]): TransformValidation {
  const intermediateResults: Array<{ step: number; value: string }> = [];
  let current = value;

  for (const [i, rule] of rules.entries()) {
    const next = applySingleRule(current, rule);
    intermediateResults.push({ step: i, value: next });
    if (next === "") {
      return {
        valid: false,
        brokenStep: i,
        rule: rule,
        message: `Transform at step ${i + 1} (${rule.type}) produced empty result`,
      };
    }
    current = next;
  }

  return { valid: true, finalValue: current, intermediateResults };
}
```

#### New Transform Rules

| Rule Type                    | Description                             | Example                                |
| ---------------------------- | --------------------------------------- | -------------------------------------- |
| `transliterate`              | Convert non-Latin to Latin script       | `Nguyễn` → `Nguyen`                    |
| `soundex`                    | Encode to Soundex for phonetic matching | `Smith` → `S530`                       |
| `format_phone_international` | Format with +country code               | `0912345678` → `+84912345678`          |
| `extract_digits`             | Keep only digits                        | `A123456` → `123456`                   |
| `pad_start` / `pad_end`      | Pad to minimum length                   | `123` with pad_start(5, '0') → `00123` |

### 3.7 Usability Improvements

#### Visual Confidence Indicators

Each field in the Fill Assistant UI shows:

- Color-coded border: green (≥0.90), yellow (0.70-0.89), red (<0.70)
- Confidence bar (compact, 50px wide)
- Tooltip on hover with detailed breakdown

```
┌──────────────────────────────────────┐
│  Full Name                    [0.92] │  ← green
│  ┌──────────────────────────────────┐│
│  │ Nguyen Van A                     ││
│  └──────────────────────────────────┘│
│  ■■■■■■■□□□  OCR confidence: 0.95  │
│              Validation: 0.88       │
│              Overall: 0.92          │
│                                      │
│  Passport Number             [0.65] │  ← red
│  ┌──────────────────────────────────┐│
│  │ A1234567                        ││
│  └──────────────────────────────────┘│
│  ■■■■■■□□□□  OCR confidence: 0.72  │
│              Check digit: FAIL      │
│              Expected: B1234567     │
└──────────────────────────────────────┘
```

#### Quick-Fix Suggestions

When accuracy is low, show one-click fix suggestions:

```
┌──────────────────────────────────────┐
│  ⚠ Passport Number — Low Accuracy   │
│                                      │
│  Current: A1234567                   │
│                                      │
│  Suggestions:                        │
│  ┌──────────────────────────────────┐│
│  │ ► B1234567  (check digit fix)   ││
│  │ ► Open OCR result for review    ││
│  └──────────────────────────────────┘│
└──────────────────────────────────────┘
```

#### Batch Fill Mode

Allow users to apply a common set of transformations to all guests at once:

```
┌──────────────────────────────────────┐
│  Batch Transform                     │
│                                      │
│  Apply to all 25 guests:            │
│  □ Uppercase names                  │
│  □ Format dates as DD/MM/YYYY       │
│  □ Strip spaces from passport #     │
│  □ Format phone (local)             │
│                                      │
│  [Preview] [Apply]                   │
└──────────────────────────────────────┘
```

#### Customizable Keyboard Shortcuts

Extend from fixed set to user-configurable:

```typescript
// In fillConstants.ts — current is hardcoded
// Proposed: Load from settings, fallback to defaults

const DEFAULT_SHORTCUTS: Record<string, KeyboardShortcut> = {
  COPY_FIELD: { key: "c", mod: "alt", description: "Copy current field" },
  NEXT_FIELD: { key: "Tab", mod: "", description: "Next field", native: true }, // uses native Tab
  PREV_FIELD: { key: "Tab", mod: "shift", description: "Previous field" },
  NEXT_GUEST: { key: "ArrowDown", mod: "alt", description: "Next guest" },
  PREV_GUEST: { key: "ArrowUp", mod: "alt", description: "Previous guest" },
  MARK_FILLED: { key: "m", mod: "alt", description: "Mark as filled" },
  EMERGENCY_STOP: { key: "Escape", mod: "ctrl+alt", description: "Emergency stop" },
};
```

Settings UI allows remapping with conflict detection.

### 3.8 Testing Strategy

| Test Area                          | What to Test                                                  | Priority |
| ---------------------------------- | ------------------------------------------------------------- | -------- |
| Field confidence propagation       | Excel import with confidence cols, without (backward compat)  | High     |
| Country-specific passport patterns | 10+ countries, valid/invalid patterns                         | High     |
| Accuracy engine                    | Per-field validators, cross-field checks, recommendations     | High     |
| Address formatting                 | Country-specific order, ZIP validation, required fields       | Medium   |
| Correction learning                | Record, retrieve, auto-apply threshold, privacy controls      | Medium   |
| Fuzzy name matching                | Exact, diacritic-stripped, Soundex, Levenshtein               | Medium   |
| Transform chaining                 | Valid chains, invalid chains (broken step), error messages    | Medium   |
| Batch transforms                   | Apply to all, preview, undo                                   | Medium   |
| Keyboard shortcuts                 | Config save/load, conflict detection, edge cases              | Low      |
| Visual indicators                  | Color rendering, tooltip content, accessibility               | Low      |
| E2E pipeline                       | Import with confidence → fill with per-field accuracy display | High     |

### 3.9 Implementation Plan

| Phase       | Tasks                                                                                    | Dependencies |
| ----------- | ---------------------------------------------------------------------------------------- | ------------ |
| **Phase 1** | Per-field confidence propagation (OCR → Excel → Import → GuestRow)                       | None         |
| **Phase 2** | Enhanced accuracy engine: country-specific patterns, cross-field checks, recommendations | Phase 1      |
| **Phase 3** | Fuzzy name matching, transliteration transform rule                                      | None         |
| **Phase 4** | Address field support (types, registry, formatter, Fill UI)                              | None         |
| **Phase 5** | Visual confidence indicators in Fill UI                                                  | Phase 1      |
| **Phase 6** | User correction learning system (IndexedDB store, apply logic, settings)                 | None         |
| **Phase 7** | Batch fill mode, customizable shortcuts                                                  | None         |
| **Phase 8** | Comprehensive tests for all new modules, E2E pipeline update                             | All phases   |
