# PaddleOCR Integration Design

> **Status:** Draft — design for review before implementation

This document describes how PaddleOCR is integrated as the primary OCR engine with Tesseract as fallback, replacing the existing Tesseract-only MRZ pipeline. The goal is to improve MRZ extraction accuracy, add global language support, and keep all processing fully local.

## System Architecture

### Before (current)

```
Image → Preprocess → Tesseract (always) → MRZ Parse → Validate → Output
```

### After (proposed)

```
Image → Preprocess ─┬→ Quality Check → Engine Selector ─┬→ PaddleOCR (primary)
                     │                                    └→ Tesseract (fallback)
                     └─────────────────────────────────────────→ Output
```

### Engine Selector Logic

```
For each MRZ crop candidate:
  1. Run PaddleOCR → get text + confidence
  2. Clean and normalize lines
  3. Run checksum validation
  4. If checksums pass AND confidence ≥ threshold → accept result
  5. If PaddleOCR fails or checksums fail → run Tesseract on same candidate
  6. Score both results using existing scoring system
  7. Return best result across all candidates and engines
```

## Module Changes

### New Files

| File                                 | Purpose                                            |
| ------------------------------------ | -------------------------------------------------- |
| `ocr/paddle_engine.py`               | PaddleOCR engine wrapper with character dictionary |
| `ocr/engine_selector.py`             | Selects best OCR engine per candidate              |
| `config/paddle_config.py`            | PaddleOCR-specific configuration                   |
| `config/default_config.py` (updated) | Add PaddleOCR options                              |
| `requirements.txt` (updated)         | Add paddlepaddle + paddleocr                       |

### Modified Files

| File                              | Change                                               |
| --------------------------------- | ---------------------------------------------------- |
| `pipeline/document_processor.py`  | Use EngineSelector instead of direct Tesseract call  |
| `extraction/confidence_engine.py` | Add PaddleOCR confidence to calculation              |
| `common/constants.py`             | Add PADDLE_OCR_USED, PADDLE_OCR_FAILED warning codes |

### PaddleOCR Engine Wrapper (`ocr/paddle_engine.py`)

```python
"""PaddleOCR engine wrapper for MRZ extraction."""

class PaddleOcrEngine:
    """
    Wraps PaddleOCR for MRZ-specific OCR.

    - Uses a custom character dictionary restricted to MRZ charset
      (A-Z, 0-9, <) for the recognition model.
    - Returns text with per-character confidence scores.
    - Supports multiple languages via det_db and rec_model_dir.
    - Initialization is lazy (first-call) to avoid import overhead.
    - Falls back internally to a warning flag; callers check is_available().
    """

    ALLOWED_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"

    def __init__(self, lang: str = "en", use_gpu: bool = False):
        self._lang = lang
        self._use_gpu = use_gpu
        self._ocr = None  # Lazy init
        self._available: bool | None = None

    def is_available() -> bool:
        """Check if paddle is importable. Returns False if not installed."""

    def run_mrz_ocr(image: np.ndarray) -> Result:
        """
        Run PaddleOCR on image restricted to MRZ character set.

        Pipeline:
          1. Detect text regions (det model)
          2. For each region, run recognition with character dictionary
          3. Filter regions by:
             - Height-to-width ratio suggesting MRZ lines
             - Position in bottom 60% of image
             - Character set match
          4. Sort regions top-to-bottom, left-to-right
          5. Concatenate into candidate MRZ lines
          6. Return raw text + per-line confidence
        """
```

### Engine Selector (`ocr/engine_selector.py`)

```python
"""Select best OCR engine result for each MRZ candidate."""

def select_best_ocr_result(
    image: np.ndarray,
    candidate_info: dict,
    options: dict,
) -> tuple[list[str], float, str, list[str]]:
    """
    Try PaddleOCR first, fall back to Tesseract.

    Returns:
      (cleaned_lines, confidence_score, engine_used, warnings)

    Logic:
      1. If PaddleOCR is available:
         a. Run PaddleOCR on image
         b. Clean and normalize lines
         c. If ≥ 2 lines found, run checksum validation
         d. If checksum pass rate ≥ 50%, accept with PaddleOCR
         e. Else mark for Tesseract fallback
      2. If PaddleOCR unavailable OR checksums failed:
         a. Run Tesseract with MRZ config
         b. Clean and normalize lines
         c. Score using existing candidate scoring system
      3. Union warnings from both engines
      4. Return best result

    Warning flags emitted:
      - PADDLE_OCR_USED (when PaddleOCR succeeds)
      - PADDLE_OCR_FAILED (when PaddleOCR fails but Tesseract succeeds)
      - PADDLE_LOW_CONFIDENCE (when PaddleOCR result has low confidence)
      - MRZ_NOT_FOUND (when both engines fail)
    """
```

## Flow: document_processor.py (updated)

The existing `process_document()` function is updated at the MRZ extraction step:

```
1-4. (unchanged) Load, orient, resize, grayscale, classify
5.   If PASSPORT:
       a. Preprocess image (CLAHE, denoise, deskew)
       b. Generate MRZ crop candidates (bottom crops + morph bands) — unchanged
       c. For each candidate:
            i.   Run EngineSelector (PaddleOCR first, Tesseract fallback)
            ii.  Score candidate using existing scoring
       d. Select best candidate across all engines
       e. Parse MRZ lines (unchanged)
       f. Checksum validation (unchanged)
       g. MRZ repair (unchanged)
6-11. (unchanged) Visual fallback, fields, confidence, export
```

Key changes:

- `select_best_candidate_sync()` is replaced by `select_best_engine_candidate()` which internally tries both OCR engines
- Each candidate carries an `engine` field: `"paddle"` or `"tesseract"`
- The diagnostic sheet records which engine was used per file

## MRZ Checksum Validation Flow

The existing checksum validation in `mrz_validator.py` already implements:

- Weighted check digit calculation (weights [7, 3, 1])
- Character value mapping (0-9=0-9, A-Z=10-35, <=0)
- Per-field validation: passport number, DOB, expiry, optional data, composite

The new flow uses this same validator but applies it **twice** — once for each engine's output:

```
For each candidate image:
  ├── PaddleOCR result
  │     ├── clean → MRZ lines → validate checksums
  │     ├── If ALL checksums valid → SCORE = 1.0 + content score
  │     └── If some checksums fail → deduct PASS_FAIL_RATIO * 0.5
  │
  └── Tesseract result (if PaddleOCR is not accepted)
        ├── clean → MRZ lines → validate checksums
        └── Score using existing scoring (unchanged)
```

A result is accepted from PaddleOCR if either:

- All three primary checksums (passport number, DOB, expiry) are valid, OR
- At least 2 of 3 primary checksums are valid AND per-character confidence ≥ 0.8

This ensures PaddleOCR is only trusted when its output is mathematically consistent.

## Multi-Language Support

| Language             | PaddleOCR `lang` | Tesseract `lang` | MRZ support |
| -------------------- | ---------------- | ---------------- | ----------- |
| English              | `en`             | `eng`            | Full        |
| French               | `fr`             | `fra`            | Full        |
| German               | `de`             | `deu`            | Full        |
| Spanish              | `es`             | `spa`            | Full        |
| Italian              | `it`             | `ita`            | Full        |
| Portuguese           | `pt`             | `por`            | Full        |
| Dutch                | `nl`             | `nld`            | Full        |
| Arabic               | `ar`             | `ara`            | Limited     |
| Russian              | `ru`             | `rus`            | Limited     |
| Chinese (Simplified) | `ch`             | `chi_sim`        | Limited     |
| Japanese             | `ja`             | `jpn`            | Limited     |
| Korean               | `ko`             | `kor`            | Limited     |
| Auto-detect          | `auto`           | —                | Best effort |

For MRZ extraction, the character set is always A-Z, 0-9, `<` regardless of language.
Language selection affects the visual OCR fallback (non-MRZ text).

### Language Auto-Detection

PaddleOCR's `auto` mode can detect the document language from the visual zone. When enabled:

1. Run PaddleOCR on full image with `lang="auto"`
2. Detect dominant language from visual text regions
3. Set language for MRZ and visual zone processing
4. If auto-detection fails, fall back to configured language

This is useful for hotels serving international guests where document origin is unknown.

## Image Preprocessing for PaddleOCR

PaddleOCR benefits from a different preprocessing pipeline than Tesseract:

| Technique            | PaddleOCR                       | Tesseract                 |
| -------------------- | ------------------------------- | ------------------------- |
| CLAHE                | Optional (model is robust)      | Yes                       |
| Denoise              | Yes (light)                     | Yes (light)               |
| Deskew               | Built-in detection handles this | Recommended               |
| Binarization         | Not needed (model is RGB-based) | Essential (Otsu/Adaptive) |
| Contrast enhancement | Helpful for low-light images    | Helpful                   |
| Resolution           | 960px min width                 | 300 DPI equivalent        |

The preprocessing pipeline in `image/preprocess.py` is updated to output **two branches**:

1. **PaddleOCR branch**: RGB image, CLAHE-enhanced, minimal preprocessing
2. **Tesseract branch**: Grayscale, CLAHE, denoised, binarized (existing pipeline)

Both branches receive the same MRZ crop region but with different preprocessing.

## Data Privacy & Staff Review Workflow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Local Machine                                  │
│                                                                       │
│  User selects passport images                                         │
│       │                                                               │
│       ▼                                                               │
│  ┌────────────────────┐                                               │
│  │  PaddleOCR Engine   │ (primary, local)                             │
│  │  (CPU or GPU)       │                                              │
│  └────────┬───────────┘                                               │
│           │ fallback if fails                                         │
│           ▼                                                           │
│  ┌────────────────────┐                                               │
│  │  Tesseract Engine  │ (fallback, local)                             │
│  └────────┬───────────┘                                               │
│           │                                                           │
│           ▼                                                           │
│  ┌────────────────────┐                                               │
│  │  MRZ Parse +       │ checksum validation                           │
│  │  Checksum Validate │                                               │
│  └────────┬───────────┘                                               │
│           │                                                           │
│           ▼                                                           │
│  ┌────────────────────┐                                               │
│  │  Excel Export      │ --- Staff reviews data before save/auto-fill  │
│  └────────┬───────────┘                                               │
│           │                                                           │
│           ▼                                                           │
│  ┌────────────────────┐                                               │
│  │  Staff Review UI   │ Manual review, correction, approval           │
│  └────────┬───────────┘                                               │
│           │                                                           │
│           ▼                                                           │
│  ┌────────────────────┐                                               │
│  │  Save / Auto-fill  │ Only after explicit staff approval            │
│  └────────────────────┘                                               │
└─────────────────────────────────────────────────────────────────────┘
```

Key privacy guarantees:

- **No data leaves the machine** — both PaddleOCR and Tesseract run fully offline
- **No cloud API calls** — strictly enforced, no API keys or external endpoints
- **Draft data always reviewed** — exported Excel is draft until staff confirms
- **Sensitive masking** — existing `privacy_guard.py` and `safe_logging.py` mask all PII in logs and diagnostics

## Configuration

Added to `config/default_config.py`:

```python
@dataclass(frozen=True)
class OcrConfig:
    language: str = "eng"
    preprocessing: bool = True
    ocr_timeout_seconds: int = 300
    tesseract_cmd: str = "tesseract"
    min_confidence: float = 0.5

    # New PaddleOCR settings
    primary_engine: str = "paddle"          # "paddle" or "tesseract"
    enable_paddle_ocr: bool = True
    enable_tesseract_fallback: bool = True
    paddle_use_gpu: bool = False
    paddle_lang: str = "en"
    paddle_confidence_threshold: float = 0.8
    paddle_mrz_char_dict: str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"
```

The desktop app settings UI adds:

- Primary engine selector (PaddleOCR / Tesseract)
- PaddleOCR GPU toggle
- PaddleOCR confidence threshold slider

## Dependencies

Added to `requirements.txt`:

```
# PaddleOCR (primary engine)
paddlepaddle>=2.6.0          # CPU version (lighter)
# paddlepaddle-gpu>=2.6.0   # GPU version (heavier, recommended for production)
paddleocr>=2.8.0

# Existing dependencies preserved:
opencv-python>=4.9.0
pytesseract>=0.3.10
...
```

Installation guidance:

- Default: `pip install paddlepaddle paddleocr` (CPU, ~400MB)
- Production: `pip install paddlepaddle-gpu paddleocr` (GPU, ~2GB with CUDA)
- macOS: CPU only (Metal support via PaddlePaddle 2.6+)

## Testing

### Unit Tests (new)

| Test File                       | Tests                                                             |
| ------------------------------- | ----------------------------------------------------------------- |
| `test_paddle_engine.py`         | PaddleOCR wrapper, availability check, character dict, MRZ output |
| `test_engine_selector.py`       | Engine selection logic, fallback trigger, scoring                 |
| `test_checksum_cross_engine.py` | Same MRZ parsed by both engines produces same checksum results    |

### Integration Tests (updated)

| Test File                   | Changes                                                                           |
| --------------------------- | --------------------------------------------------------------------------------- |
| `test_full_pipeline_e2e.py` | Add test files with passports in French, Arabic, Chinese; verify engine selection |
| `conftest.py`               | Add PaddleOCR test fixtures (if available in CI)                                  |

### Test Strategy

- **Unit tests**: Mock PaddleOCR output to test selection logic without real inference
- **Integration**: Run with real PaddleOCR on known test images in CI (mark as `paddle` marker, opt-in)
- **Fallback tests**: Intentionally break PaddleOCR output (mock check digit failures) to verify Tesseract fallback triggers

## Performance Considerations

| Scenario        | PaddleOCR (CPU)    | PaddleOCR (GPU) | Tesseract |
| --------------- | ------------------ | --------------- | --------- |
| Cold start      | ~3-5s (model load) | ~2-3s           | ~0.5s     |
| MRZ inference   | ~1-2s              | ~0.3-0.5s       | ~1-3s     |
| Full page OCR   | ~3-5s              | ~1-2s           | ~3-5s     |
| Memory (loaded) | ~500MB-1GB         | ~1-2GB          | ~50MB     |
| Disk (models)   | ~300-500MB         | ~500MB-1GB      | ~50MB     |

The desktop app should:

1. Start PaddleOCR model loading asynchronously when OCR screen opens
2. Show progress indicator during model load
3. Allow configuring GPU/CPU in settings
4. Cache loaded model across OCR jobs within the same session

## Fallback Decision Matrix

| Condition                                     | PaddleOCR Used? | Tesseract Used? | Warning                |
| --------------------------------------------- | --------------- | --------------- | ---------------------- |
| PaddleOCR produces valid MRZ + checksums pass | Yes             | No              | None                   |
| PaddleOCR produces valid MRZ + checksums fail | No              | Yes             | CHECK_DIGIT_FAILED     |
| PaddleOCR fails/incomplete lines              | No              | Yes             | PADDLE_OCR_FAILED      |
| Both fail                                     | No              | No              | MRZ_NOT_FOUND          |
| PaddleOCR unavailable (not installed)         | No              | Yes             | PADDLE_OCR_UNAVAILABLE |

## Warnings & Confidence

New warning codes added to `common/constants.py`:

```python
"PADDLE_OCR_USED": "PADDLE_OCR_USED",
"PADDLE_OCR_FAILED": "PADDLE_OCR_FAILED",
"PADDLE_LOW_CONFIDENCE": "PADDLE_LOW_CONFIDENCE",
"PADDLE_OCR_UNAVAILABLE": "PADDLE_OCR_UNAVAILABLE",
```

The confidence engine is updated to recognize PaddleOCR results:

- Baseline: 0.60 (vs Tesseract's 0.50)
- PADDLE_OCR_FAILED penalty: -0.10
- PADDLE_LOW_CONFIDENCE penalty: -0.05
- All existing bonuses (checksum pass, etc.) apply identically

## Roadmap

### Phase 1: Core Integration (this task)

- PaddleOCR engine wrapper with MRZ character dictionary
- Engine selector with Tesseract fallback
- Configuration and dependency management
- Unit tests with mocked PaddleOCR

### Phase 2: Global Language Support

- Auto-detection of document language
- Multi-language visual zone OCR
- Language-specific preprocessing

### Phase 3: Performance

- GPU acceleration support
- Model caching across jobs
- Batch inference for multiple documents

### Phase 4: Production Hardening

- Model download and verification
- Offline model packaging for air-gapped installs
- Benchmarking suite for accuracy regression
