# Global OCR Support Enhancements

> **Status: Design Proposal**
> **Related:** [OCR Technical Design](OCR_TECHNICAL_DESIGN.md)

## 1. Goals

Enable reliable OCR processing of passports and ID documents from any country, including those using non-Latin scripts (Arabic, Cyrillic, CJK, Devanagari, etc.), right-to-left layouts, and varied document formats.

## 2. Current Limitations

| Area               | Limitation                                                     | Impact                                                                         |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Language mapping   | Only 15 countries mapped to specific PaddleOCR langs           | Most countries use generic multilingual model                                  |
| MRZ charset        | A-Z, 0-9, `<` only (ICAO 9303 standard)                        | Cannot handle extended characters in visual zones                              |
| Visual OCR         | English-only via Tesseract PSM 3, regex-based field extraction | Fails on non-Latin visual zone text                                            |
| PaddleOCR fallback | Tries all 16 languages sequentially                            | Slow for countries with no language hint                                       |
| Preprocessing      | Single pipeline for all documents                              | No optimization for worn/creased/low-contrast documents common in some regions |
| Classification     | Aspect-ratio based, assumes Western passport dimensions        | May misclassify non-standard document sizes                                    |
| Tesseract fallback | English-only, no language pack detection                       | Useless for non-Latin documents                                                |
| Non-Latin names    | No transliteration support                                     | Names in Arabic/Chinese/etc. not extracted from visual zone                    |

## 3. Design

### 3.1 Language Expansion

```
┌─────────────────────────────────────────────┐
│           Language Resolution                │
│                                              │
│  Country Code ──► ISO3 ──► Default Language  │
│       │                                      │
│       ├── Exact match: use mapped lang       │
│       ├── Region group: use regional lang    │
│       └── Unknown: auto-detect + multi-lang  │
│                                              │
│  Auto-detect flow:                           │
│    1. MRZ country code                       │
│    2. Visual zone script detection           │
│    3. Fallback: multi-language ensemble      │
└─────────────────────────────────────────────┘
```

#### Expanded Country-Language Mapping (target: 60+ countries)

| Script Group    | Countries                                                            | PaddleOCR Lang             | Priority    |
| --------------- | -------------------------------------------------------------------- | -------------------------- | ----------- |
| Latin (West EU) | GBR, USA, CAN, AUS, NZL, etc.                                        | `en`                       | Primary     |
| Latin (East EU) | POL, CZE, HUN, ROU, etc.                                             | `en`                       | Primary     |
| Latin (SE Asia) | VNM, IDN, PHL, MYS, SGP                                              | `vi`/`en`                  | Per-country |
| CJK             | CHN, TWN, HKG, JPN, KOR                                              | `ch`/`ja`/`ko`             | Per-country |
| Arabic          | ARE, SAU, QAT, OMN, BHR, KWT, JOR, EGY, MAR, DZA, TUN, LBN, IRQ, SYR | `ar`                       | Primary     |
| Cyrillic        | RUS, UKR, KAZ, BLR, SRB, BGR                                         | `ru`                       | Primary     |
| Devanagari      | IND, NPL                                                             | `en` (PaddleOCR no native) | Fallback    |
| Thai            | THA                                                                  | `en` (PaddleOCR no native) | Fallback    |
| Turkish         | TUR                                                                  | `tr`                       | Primary     |
| Hebrew          | ISR                                                                  | `en` (PaddleOCR no native) | Fallback    |
| Greek           | GRC, CYP                                                             | `en`                       | Fallback    |

#### Script Detection Module (new file: `workers/ocr/guestfill_ocr/classification/script_detector.py`)

```
Input: Image region (visual zone crop)
Output: Detected script type (latin, arabic, cyrillic, cjk, devanagari, thai, hebrew, greek)

Method: Lightweight pixel-density + connected-component analysis
  1. Compute horizontal projection profile → detect line direction (LTR/RTL)
  2. Compute connected component bounding boxes → estimate character complexity
  3. Detect common Unicode blocks via OCR candidate statistics
  4. Return most likely script + confidence score

Fallback: Use MRZ country code if script detection confidence < 0.6
```

### 3.2 Multi-Engine OCR Strategy

Current: PaddleOCR primary → Tesseract English fallback

Proposed: Tiered engine selection

```
┌─────────────────────────────────────────────────────┐
│                OCR Engine Selector                    │
│                                                       │
│  Step 1: Resolve target language(s)                  │
│     - From country code (if MRZ found)               │
│     - From script detection (if no MRZ)              │
│     - Multi-language list for ambiguous cases         │
│                                                       │
│  Step 2: Select primary engine                        │
│     - PaddleOCR (if language supported)              │
│     - Tesseract with lang pack (if available)        │
│     - EasyOCR (fallback for unsupported langs)       │
│                                                       │
│  Step 3: Run with primary language(s)                │
│     - Up to 3 language-specific attempts             │
│     - First high-confidence result wins              │
│     - Otherwise, ensemble results                    │
│                                                       │
│  Step 4: Visual zone extraction                       │
│     - Use same engine/language as MRZ                │
│     - Apply field-specific regex patterns            │
│     - For non-Latin: transliterate to Latin          │
└─────────────────────────────────────────────────────┘
```

#### Engine Support Matrix (proposed)

| Engine    | When Used                          | Languages                               | Installation                        |
| --------- | ---------------------------------- | --------------------------------------- | ----------------------------------- |
| PaddleOCR | Primary for 15 supported languages | 16 language packs                       | `pip install guestfill-ocr[paddle]` |
| Tesseract | Primary for Latin + extended langs | 100+ langs via `tesseract --list-langs` | System install + lang packs         |
| EasyOCR   | Fallback for unsupported scripts   | 80+ languages                           | `pip install easyocr` (optional)    |

**New configuration options:**

```toml
[ocr.engines]
preferred = "auto"           # auto, paddleocr, tesseract, easyocr
enable_paddleocr = true
enable_tesseract = true
enable_easyocr = false       # optional dependency
fallback_order = ["tesseract", "easyocr"]
language_auto_detect = true
max_language_attempts = 3
```

### 3.3 Enhanced Preprocessing Pipeline

Current: Single pipeline (CLAHE + denoise + deskew)

Proposed: Adaptive preprocessing based on document type and quality

```
┌──────────────────────────────────────────────┐
│         Adaptive Preprocessing                │
│                                                │
│  Input: Raw image                              │
│  1. EXIF correction (existing)                │
│  2. Quality analysis (existing + glare)       │
│  3. Select preprocessing path:                │
│                                                │
│  Path A — Standard document:                  │
│    Grayscale → CLAHE → Denoise → Deskew       │
│    (existing pipeline, optimized for clean)   │
│                                                │
│  Path B — Worn/creased document:              │
│    Grayscale → CLAHE → Bilateral filter →     │
│    Morphological close → Adaptive threshold   │
│    → Deskew                                    │
│                                                │
│  Path C — Low contrast document:              │
│    LAB conversion → CLAHE on L channel →      │
│    Gamma correction → Unsharp mask →          │
│    Contrast stretching → Deskew               │
│                                                │
│  Path D — Glare/highlight document:           │
│    Glare mask → Inpaint → Grayscale →         │
│    CLAHE → Denoise → Deskew                   │
│                                                │
│  Path E — Arabic/RTL document:                │
│    (Same as Standard but skip deskew if       │
│     skew < 2°, Arabic documents often have    │
│     intentional slight rotation)              │
│                                                │
│  4. PaddleOCR-specific post-process           │
│     (existing: upscale to 1200px height,      │
│      LAB CLAHE, bilateral filter)             │
└──────────────────────────────────────────────┘
```

#### Image Quality Classifier Enhancement

Add to existing `quality_analyzer.py`:

- **Glare detection**: Highlight region segmentation via thresholding + morphological open
- **Crease detection**: Hough line transform on edge image, score by density of intersecting lines
- **Wear detection**: Local contrast variation across document surface
- **Classification output**: `quality_profile` dict with recommended preprocessing path

### 3.4 Visual Zone OCR Enhancement

#### Current: Tesseract PSM 3 on full image, regex field extraction (English only)

#### Proposed: Region-based multi-language visual zone extraction

```
1. Detect MRZ region (existing: bottom crop)
2. Determine visual zone = above MRZ
3. Determine document orientation (existing: upside-down check)
4. Extract visual sub-regions:
   a. Name field (usually top-left or top-center)
   b. Passport/ID number (varies by country)
   c. Nationality (often near photo)
   d. DOB (formatted, often near bottom of visual zone)
   e. Sex, expiry (scattered)
5. For each sub-region:
   a. Run OCR with detected language
   b. Apply field-specific extraction patterns
   c. For non-Latin results: transliterate to Latin
6. Merge visual fields with MRZ fields (MRZ preferred for structured data)
```

#### Field Localization by Document Type

Create a document template registry:

```json
{
  "PASSPORT": {
    "patterns": {
      "DEU": {
        "regions": {
          "surname": { "position": "top_left", "label": "NACHNAME" },
          "given_names": { "position": "below_surname", "label": "VORNAME" },
          "passport_number": { "position": "top_right_01", "label": "PASS-NR." }
        }
      },
      "ARE": {
        "regions": {
          "surname": { "position": "top_center", "label": ["الاسم", "Surname"] },
          "given_names": { "position": "below_surname", "label": ["الاسم الأول", "Given Names"] }
        }
      }
    }
  }
}
```

#### Transliteration Module (new file: `workers/ocr/guestfill_ocr/extraction/transliteration.py`)

For guest names in non-Latin scripts, provide Latin transliteration using ICU/Unicode standard mappings:

- Arabic → Latin (ISO 233)
- Cyrillic → Latin (ISO 9)
- Chinese → Latin (Pinyin, via optional pypinyin)
- Japanese → Latin (Hepburn, via optional pykakasi)
- Devanagari → Latin (ISO 15919)
- Korean → Latin (Revised Romanization)
- Greek → Latin (ISO 843)
- Thai → Latin (ISO 11940)

```
transliterate(text: str, source_script: str) -> TransliterationResult
  Returns: { latin: str, method: str, confidence: float }
```

### 3.5 MRZ Enhancement for Global Documents

#### Current limitations:

- Only handles clean ICAO 9303 MRZ (TD1, TD2, TD3)
- Check digits limited to basic weighted validation
- No support for damaged/missing MRZ lines
- No support for travel documents with non-standard fields

#### Enhancements:

1. **MRZ candidate expansion**: Try partial/corrupt MRZ repair with multiple OCR passes
2. **Country-specific MRZ handling**: Some countries use non-standard field positions in optional data
3. **MRZ format auto-detection**: Detect format from line count + line length without assuming order
4. **Enhanced repair**: Use country-specific check digit algorithms and character confusion maps
5. **Multi-line stitching**: Handle MRZ broken across multiple OCR line detections

### 3.6 Testing Strategy

| Test Area           | What to Test                                            | Priority |
| ------------------- | ------------------------------------------------------- | -------- |
| Script detection    | All 8 script types, edge cases (mixed scripts, low res) | High     |
| Language resolution | 60+ country codes, unknown codes, region groups         | High     |
| Preprocessing paths | All 5 paths, quality classification accuracy            | Medium   |
| Visual zone OCR     | 10+ country-specific passport layouts, field extraction | High     |
| Transliteration     | Arabic/Cyrillic/CJK/Devanagari → Latin roundtrip        | Medium   |
| MRZ enhancement     | Damaged MRZ, partial MRZ, non-standard format           | Medium   |
| Engine selection    | PaddleOCR vs Tesseract vs EasyOCR, fallback chain       | High     |
| Performance         | Processing time per image, memory usage                 | Low      |

#### Test Data Requirements

Create a test dataset with sample documents from:

- Western Europe (GBR, FRA, DEU, ITA, ESP) — Latin script
- Eastern Europe (RUS, UKR, POL, CZE) — Cyrillic/Latin
- Middle East (ARE, SAU, ISR, TUR) — Arabic/Hebrew
- East Asia (CHN, JPN, KOR) — CJK
- South Asia (IND, NPL, THA) — Devanagari/Thai
- Southeast Asia (VNM, IDN, PHL, SGP) — Latin + local scripts

Each with MRZ + visual zone test images at various quality levels.

### 3.7 Security & Privacy

- All processing remains local (no change)
- Language packs downloaded at install time, not on-demand
- Transliteration does not send data to external services
- MRZ country code is not sensitive data (no masking required)
- Non-extracted visual zone images are discarded after processing

### 3.8 Implementation Plan

| Phase       | Tasks                                                                                       | Dependencies |
| ----------- | ------------------------------------------------------------------------------------------- | ------------ |
| **Phase 1** | Expanded country-language mapping, Tesseract lang pack detection, preprocessing paths B/C/D | None         |
| **Phase 2** | Script detection module, visual zone region detection                                       | Phase 1      |
| **Phase 3** | Transliteration module, field localization template registry                                | Phase 2      |
| **Phase 4** | EasyOCR integration (optional), adaptive engine selection                                   | Phase 1      |
| **Phase 5** | Test dataset creation, comprehensive tests for all new modules                              | Phase 1-4    |
| **Phase 6** | Performance optimization, documentation update                                              | Phase 5      |
