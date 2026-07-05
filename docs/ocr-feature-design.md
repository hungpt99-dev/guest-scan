# OCR Feature Design — Guest Fill

> **Status: Design Draft**
> **Extends:** [OCR Technical Design](OCR_TECHNICAL_DESIGN.md), [Auto-fill Technical Design](AUTO_FILL_TECHNICAL_DESIGN.md)

## 1. Architecture Overview

The OCR feature supports two extraction providers — **Local OCR** (free/demo/offline) and **Azure OCR** (production) — selected at runtime via a provider-switchable abstraction. Extracted data flows through the existing pipeline (normalization → confidence scoring → review → auto-fill mapping) with provider-specific adjustments.

```
┌──────────────────────────────────────────────────────────────────┐
│                      Guest Fill UI                                │
│  ┌────────────┐  ┌───────────────┐  ┌──────────────────────────┐ │
│  │ Image      │  │ OC Result     │  │ Guest Form               │ │
│  │ Capture/   │  │ Review Screen │  │ (editable, auto-filled)  │ │
│  │ Upload     │  │               │  │                          │ │
│  └──────┬─────┘  └──────┬────────┘  └───────────┬──────────────┘ │
│         │               │                       │                │
│  ┌──────▼───────────────▼───────────────────────▼──────────────┐ │
│  │              OCR Provider Abstraction                        │ │
│  │  ┌─────────────────────────┐  ┌──────────────────────────┐  │ │
│  │  │   LocalOcrProvider      │  │   AzureOcrProvider        │  │ │
│  │  │   (PaddleOCR/Tesseract) │  │   (Document Intelligence) │  │ │
│  │  │   - MRZ extraction      │  │   - Prebuilt ID doc model │  │ │
│  │  │   - Visual zone OCR     │  │   - Structured JSON       │  │ │
│  │  │   - Lower confidence    │  │   - High confidence       │  │ │
│  │  │   - No network needed   │  │   - Requires API key      │  │ │
│  │  └──────────┬──────────────┘  └──────────┬───────────────┘  │ │
│  │             └──────────┬─────────────────┘                  │ │
│  │                        │ IOcrProvider interface              │ │
│  └────────────────────────┼────────────────────────────────────┘ │
│                           │                                      │
│  ┌────────────────────────▼────────────────────────────────────┐ │
│  │              Core Services (existing)                       │ │
│  │  Normalization → Confidence Scoring → Auto-fill Mapping    │ │
│  │  Staff Review → Audit Log                                  │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Provider Selection

| Aspect             | Local OCR                         | Azure OCR                          |
| ------------------ | --------------------------------- | ---------------------------------- |
| Engine             | PaddleOCR + Tesseract fallback    | Azure Document Intelligence        |
| Accuracy           | Moderate (0.6–0.85 typical)       | High (0.85–0.99 typical)           |
| Network            | None (local-only)                 | Requires HTTPS to Azure endpoint   |
| Cost               | Free                              | Azure consumption billing          |
| Availability       | Always (bundled with app)         | Requires API key configuration     |
| Data leaves device | No                                | Yes (images sent to Azure)         |
| Use case           | Demo, offline, testing, free tier | Production, real passport/ID needs |
| Privacy notice     | None needed                       | Must warn before sending           |

## 2. Provider Interface

```typescript
// apps/desktop/src/services/ocr_provider.ts (extended)

export type OcrProviderType = "local" | "azure";

export type ExtractedField = {
  fieldName: string; // mapped to NormalizedFields key
  value: string;
  confidence: number; // 0.0–1.0
  source: "mrz" | "visual_ocr" | "azure_doc_intel" | "mrz_repaired";
  isLowConfidence: boolean;
  rawText?: string;
};

export type OcrExtractionResult = {
  provider: OcrProviderType;
  fields: ExtractedField[];
  rawResponse?: unknown; // provider-specific raw output
  warnings: string[];
  processingTimeMs: number;
  documentType: "PASSPORT" | "ID_CARD" | "UNKNOWN";
  imageHash?: string; // SHA-256 for dedup (not stored)
};

export interface IOcrProvider {
  readonly type: OcrProviderType;
  extract(imagePath: string, options?: ProviderOptions): Promise<OcrExtractionResult>;
  isAvailable(): Promise<boolean>;
  getName(): string;
}
```

### Provider Options

```typescript
export type ProviderOptions = {
  language?: string;
  confidenceThreshold?: number;
  // Azure-specific
  azureEndpoint?: string;
  azureApiKey?: string; // never logged, never stored in frontend store
  modelId?: string; // "prebuilt-idDocument" or custom
};
```

### LocalOcrProvider

Wraps the existing `OcrPipelineService` — runs MRZ detection → PaddleOCR (primary) → Tesseract (fallback) → MRZ parsing → field extraction → field normalization → confidence scoring. Returns extracted fields mapped to the `ExtractedField` shape.

### AzureOcrProvider

Calls Azure Document Intelligence v3.1 `prebuilt-idDocument` model via a Tauri Rust command (API key lives in Rust, never in frontend JS):

```
User uploads image
  → React frontend triggers Rust command (apps/desktop/src-tauri/src/commands/ocr_commands.rs)
  → Rust reads image bytes, reads API key from secure OS keychain/settings
  → Rust makes HTTPS POST to Azure Document Intelligence endpoint
  → Rust parses the JSON response → maps to ExtractedField[]
  → Returns result to frontend
  → Frontend only receives extracted fields (no raw image stored)
```

**Azure response mapping:**

| Azure Field        | ExtractedField | Notes                    |
| ------------------ | -------------- | ------------------------ |
| `DocumentName`     | fullName       | Concatenated             |
| `FirstName`        | firstName      |                          |
| `LastName`         | lastName       |                          |
| `DateOfBirth`      | dateOfBirth    | Normalized to YYYY-MM-DD |
| `Sex`              | gender         | M/F mapped               |
| `Nationality`      | nationality    | ISO3 code                |
| `DocumentNumber`   | passportNumber |                          |
| `DocumentType`     | documentType   | Passport/ID card         |
| `DateOfIssue`      | issueDate      |                          |
| `DateOfExpiration` | expiryDate     |                          |
| `IssuingCountry`   | issuingCountry |                          |
| `Address`          | address        |                          |
| `MRZ`              | mrzRaw         | Raw MRZ lines            |

## 3. Data Flow

### 3.1 Image Capture/Upload

```
User taps "Scan Document"
  ├─ Phone: Launch camera (MediaDevices.getUserMedia)
  │   → Capture frame → compress to JPEG (max 2048px)
  │   → Save to temp file → pass path to provider
  └─ Desktop: File picker (Tauri dialog)
      → Read file → pass path to provider
```

### 3.2 Extraction Flow

```
Image captured
  → Quality check (blur, glare, brightness—existing image_quality_service)
  → Provider selection (settings or user choice)

  [if Local OCR]:
    → Document crop (existing document_crop_service)
    → Preprocessing (existing image_preprocessing_service)
    → MRZ detection (existing mrz_detection_service)
    → PaddleOCR on MRZ region
    → MRZ parsing (existing mrz_parser_service)
    → Visual zone OCR for non-MRZ fields (existing visual_ocr_service)
    → Merge MRZ + visual fields (MRZ preferred for overlapping)
    → Field normalization (existing field_normalization_service)

  [if Azure OCR]:
    → Tauri Rust command: send image to Azure Document Intelligence
    → Parse prebuilt-idDocument structured response
    → Map to extracted fields (confidence values from Azure)

  → Confidence scoring (existing ocr_confidence_service, adjusted per provider)
  → Build OcrExtractionResult with warnings
```

### 3.3 Review & Confirm Flow

```
OcrExtractionResult ready
  → Present review screen with:
      • Extracted fields (editable inputs)
      • Per-field confidence indicator (color-coded)
      • Low-confidence fields highlighted
      • Warnings banner (expired, unreadable, missing data)
  → User:
      • Reviews each field
      • Edits incorrect values inline
      • Taps "Retry" to re-capture/re-process
      • Taps "Confirm & Fill Form"
  → On confirm:
      • Edits merged with extracted fields
      • Auto-fill mapping applied (existing auto_fill_mapping_service)
      • Form populated with confirmed values
```

### 3.4 Auto-fill to Guest Form

```
Confirmed fields
  → AutoFillMappingService.applyMappings() (existing)
  → Map OCR field → form field based on active profile
  → Apply transformation rules (existing transform engine)
  → Populate guest form fields
  → Show "filled" indicators per field
```

## 4. User Interaction Flow

### Screen States

| State      | UI                                                                                    |
| ---------- | ------------------------------------------------------------------------------------- |
| IDLE       | "Scan/Upload Document" button, provider selector, form (empty)                        |
| CAPTURING  | Camera viewfinder / file picker                                                       |
| PROCESSING | Progress bar with stage labels (Quality check → Detecting → OCR → Parsing → Complete) |
| REVIEW     | Extracted fields in edit mode, confidence indicators, warnings                        |
| CONFIRMED  | Form auto-filled, user can save or edit further                                       |
| ERROR      | Error message with retry option                                                       |

### Step-by-step

1. User opens Guest Fill form (empty)
2. User selects OCR provider (gear icon or dropdown — "Local OCR" / "Azure OCR")
   - If Azure: first-time prompt to configure API key (opens Settings)
   - Privacy warning shown if Azure: "Image will be sent to Azure cloud"
3. User taps "Scan Passport/ID" button
4. Phone: camera opens with overlay guide
   Desktop: file picker opens
5. After capture/selection, processing begins
   - Progress bar: Quality check → Document detection → OCR → Parsing
   - Estimated time: ~3–8s local, ~2–5s Azure
6. Review screen appears with extracted data
   - Each field shown as editable input
   - Color dot: green (HIGH), yellow (MEDIUM), red (LOW)
   - Warnings box (if any): "Document expired", "Low confidence in name fields", etc.
   - Actions: Edit inline | Retry | Cancel
7. User edits any incorrect fields
8. User taps "Confirm & Fill Form"
9. Guest form populated; user can further edit form fields
10. User saves or submits guest

### Mobile-specific UX

- Full-screen camera preview with document guide overlay
- Auto-capture when document detected in frame (optional, configurable)
- Touch-friendly large input fields in review screen
- Bottom-sheet for provider selection
- Swipeable field list

## 5. Field Mapping

### Supported OCR → Guest Form Fields

| OCR Field      | Guest Form Field     | Notes                         |
| -------------- | -------------------- | ----------------------------- |
| fullName       | fullName             |                               |
| firstName      | firstName            |                               |
| lastName       | lastName             |                               |
| dateOfBirth    | dateOfBirth          | Normalized to YYYY-MM-DD      |
| gender         | gender               | M / F / X                     |
| nationality    | nationality          | ISO3 country code             |
| passportNumber | passportNumber       |                               |
| idNumber       | idNumber             |                               |
| documentType   | documentType         | "PASSPORT" / "ID_CARD"        |
| issueDate      | issueDate            |                               |
| expiryDate     | passportExpiryDate   |                               |
| issuingCountry | issuingCountry       |                               |
| mrzRaw         | (not mapped to form) | Shown in review for reference |
| address        | address              | Azure-only (not from MRZ)     |

Mapping uses the existing `AutoFillProfile` system — users can customize which OCR field maps to which form field.

## 6. Warnings & Errors

### Warning Categories

| Warning                | Trigger                                     | UI Treatment                  |
| ---------------------- | ------------------------------------------- | ----------------------------- |
| EXPIRED_DOCUMENT       | expiryDate is in the past                   | Red banner, blocked confirm   |
| LOW_CONFIDENCE_FIELD   | Any field confidence < threshold            | Highlighted field, yellow dot |
| MISSING_REQUIRED_FIELD | passportNumber, fullName, dateOfBirth empty | Red border on field           |
| MRZ_CHECKSUM_FAILED    | MRZ check digit invalid                     | Warning badge                 |
| DOCUMENT_EXPIRING_SOON | Expiry < 90 days                            | Yellow banner                 |
| AZURE_NETWORK_ERROR    | Azure API unreachable                       | Error state, suggest local    |
| AZURE_AUTH_ERROR       | Invalid API key                             | Error state, open settings    |
| UNREADABLE_DOCUMENT    | Image quality check failed                  | "Retake photo" prompt         |
| PROVIDED_UNAVAILABLE   | Selected provider not available             | Fallback suggestion           |

### Error Handling

| Error                  | Recovery                                    |
| ---------------------- | ------------------------------------------- |
| Image quality fail     | Guide user to retake with better lighting   |
| MRZ not detected       | Suggest manual entry or Azure OCR           |
| OCR confidence too low | Suggest retry or switch provider            |
| Azure unavailable      | Suggest fallback to Local OCR               |
| Unknown document type  | Show manual entry form with scanned preview |
| User cancellation      | Return to IDLE, no data retained            |

## 7. Privacy & Security

### Key Principles

- **API keys in Rust, never in frontend.** Azure API key stored securely via OS keychain (macOS Keychain, Windows Credential Manager) or encrypted in local settings. Frontend JS never contains or logs the key.
- **Images not retained.** Temp image files deleted immediately after processing completes or on session reset. No persistent image storage.
- **Sensitive data masked in logs.** Passport numbers, full names, DOB, MRZ masked per existing `maskPassportNumber`/`maskFullName`.
- **Clear privacy notice for Azure.** Before sending to Azure, show modal: "This image will be sent to Azure Document Intelligence for processing. No data is stored by GuestFill."
- **User control.** Clear Data button in review screen discards all extracted fields. Session reset removes all temp files.
- **No telemetry.** No usage tracking, no analytics, no crash reporting.

### Data Lifecycle

```
Image captured → temp file [deleted after processing]
                → sent to provider (local: process in memory → discard; Azure: HTTP POST → discard after response)
                → extracted fields [held in memory until user clears or session resets]
                → confirmed fields [mapped to form, stored in guest session]
                → temp files cleaned on: session reset | app close | after 5min idle
```

### Audit Trail

All OCR operations logged locally (existing audit-log-service) with:

- Timestamp, provider type, document type
- Number of fields extracted, confidence summary
- Masked identifiers only
- No raw images, no full field values in logs

## 8. Settings Integration

New settings under existing `AppSettings.ocr`:

```typescript
// apps/desktop/src/services/settings-service.ts (extended)
export type AppOcrSettings = {
  // Existing
  engineType: OcrEngineType; // "paddle" | "tesseract" | "mock"
  // New
  ocrProvider: "local" | "azure"; // active OCR provider
  azureEndpoint?: string; // https://{resource}.cognitiveservices.azure.com/
  azureApiKeyStored: boolean; // true if key configured (never expose key value)
  showPrivacyWarning: boolean; // show warning before Azure use
  autoCapture: boolean; // auto-capture on document detection (mobile)
};
```

## 9. Implementation Plan

### Phase 1 — Local OCR in Guest Fill

- Build `GuestFormScreen` UI with image upload/capture button
- Wire existing `OcrPipelineService` behind `LocalOcrProvider` adapter
- Implement review screen with editable fields, confidence indicators
- Connect confirmed fields → auto-fill mapping → form population
- Test: single guest OCR flow end-to-end

### Phase 2 — Azure OCR Provider

- Add Rust command for Azure Document Intelligence API call
- Implement `AzureOcrProvider` class
- Secure API key storage in OS keychain
- Provider selection UI in settings and in-form
- Privacy warning modal for Azure

### Phase 3 — Polishing

- Mobile camera integration (MediaDevices + auto-capture)
- Warning system (expired document, low confidence, missing fields)
- Multiple retry flow with provider switching
- Accessibility (screen reader support, keyboard navigation)
- Error states and recovery flows

## 10. Testing Strategy

| Area                   | Approach                                                   |
| ---------------------- | ---------------------------------------------------------- |
| Local OCR extraction   | Unit tests on MRZ parsing, field normalization, confidence |
| Azure response parsing | Mock Azure API responses, test field mapping               |
| Provider abstraction   | Unit tests with mock provider; verify swap works           |
| Review UI              | Component tests: field edit, confirm, retry, cancel        |
| Privacy safeguards     | Verify no sensitive data in logs; key not in frontend      |
| E2E                    | Full flow: capture → local OCR → review → confirm → fill   |
| Error recovery         | Simulate quality failure, Azure timeout, user cancellation |

## 11. File Mapping

| New/Modified File                                     | Purpose                                          |
| ----------------------------------------------------- | ------------------------------------------------ |
| `apps/desktop/src/screens/GuestFillScreen.tsx`        | New: Guest Fill form with OCR integration        |
| `apps/desktop/src/services/ocr_provider.ts`           | Extend: IOcrProvider interface, LocalOcrProvider |
| `apps/desktop/src/services/azure_ocr_provider.ts`     | New: Azure Document Intelligence provider        |
| `apps/desktop/src-tauri/src/commands/ocr_commands.rs` | Extend: Azure API call command                   |
| `apps/desktop/src/services/settings-service.ts`       | Extend: Azure settings fields                    |
| `apps/desktop/src/components/ReviewScreen.tsx`        | New/update: OCR result review with edit/confirm  |
| `apps/desktop/src/components/ImageCapture.tsx`        | New: Camera capture + file upload component      |
| `apps/desktop/src/components/ConfidenceBadge.tsx`     | New: Per-field confidence visual indicator       |
| `apps/desktop/src/components/ProviderSelector.tsx`    | New: Local/Azure toggle component                |
| `apps/desktop/src/components/PrivacyNotice.tsx`       | New: Azure data-sharing notice                   |
