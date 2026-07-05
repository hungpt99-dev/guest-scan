# Guest Fill App — Clean Architecture & Module Boundary Design

> **Version:** 1.0  
> **Status:** Approved  
> **Scope:** Full codebase — TypeScript (desktop, shared, extension), Python (OCR worker), Rust (Tauri backend)

---

## Table of Contents

1. [Architecture Philosophy](#1-architecture-philosophy)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Module Boundary Map](#3-module-boundary-map)
4. [Layer Definitions & Responsibilities](#4-layer-definitions--responsibilities)
5. [Target Folder Structure](#5-target-folder-structure)
6. [Provider-Independent Design](#6-provider-independent-design)
7. [Key Interfaces & Abstractions](#7-key-interfaces--abstractions)
8. [Data Flow Architecture](#8-data-flow-architecture)
9. [State Management Architecture](#9-state-management-architecture)
10. [Error Handling Architecture](#10-error-handling-architecture)
11. [Security & Privacy Architecture](#11-security--privacy-architecture)
12. [Naming Conventions](#12-naming-conventions)
13. [Typing Standards](#13-typing-standards)
14. [File Size & Component Guidelines](#14-file-size--component-guidelines)
15. [Migration Strategy](#15-migration-strategy)

---

## 1. Architecture Philosophy

### Principles

The architecture follows **Clean Architecture** (Robert C. Martin) adapted for a local-first Tauri desktop app with a Python subprocess worker:

| Principle                  | Application                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Dependency Rule**        | Dependencies point inward. Outer layers (UI, infrastructure) depend on inner layers (domain, application), never the reverse.              |
| **Separation of Concerns** | UI, business logic, API logic, provider adapters, validation, mapping, and utilities are separate modules with clear boundaries.           |
| **Provider Independence**  | External services (OCR, storage, auth, etc.) are behind interfaces. Business logic and UI never depend on provider-specific SDKs or types. |
| **Interface Segregation**  | Each interface has a single, focused contract. No "god interfaces."                                                                        |
| **Dependency Inversion**   | High-level modules define interfaces. Low-level modules implement them. No direct coupling to concrete implementations.                    |
| **Strict Layering**        | Screens → Features → Services → API/Infrastructure. Cross-layer jumps are forbidden.                                                       |

### Dependency Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                               │
│  Screens / UI Components / Hooks                                     │
│  Depends on: Application Layer interfaces only                       │
├─────────────────────────────────────────────────────────────────────┤
│                     APPLICATION LAYER                                │
│  Features / Use Cases / State / Orchestration                        │
│  Depends on: Domain Layer interfaces only                            │
├─────────────────────────────────────────────────────────────────────┤
│                     DOMAIN LAYER                                     │
│  Entities / Value Objects / Provider Interfaces / Business Rules     │
│  Depends on: Nothing (no framework, no infrastructure imports)       │
├─────────────────────────────────────────────────────────────────────┤
│                     INFRASTRUCTURE LAYER                             │
│  Providers / Adapters / API / Database / IPC / Logging               │
│  Depends on: Domain Layer interfaces                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Layer Ownership

| Layer              | Owned By                                                     | Location                                                  |
| ------------------ | ------------------------------------------------------------ | --------------------------------------------------------- |
| **Domain**         | `packages/shared/`                                           | Types, constants, provider interfaces, entity definitions |
| **Application**    | `apps/desktop/src/features/`                                 | Use cases, stores, orchestration                          |
| **Infrastructure** | `apps/desktop/src/infra/`                                    | Adapters, database, IPC, logging, platform APIs           |
| **Presentation**   | `apps/desktop/src/screens/` + `apps/desktop/src/components/` | UI components, pages, hooks                               |

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  DESKTOP APP (Tauri + React + TypeScript)                                            │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐     │
│  │  PRESENTATION LAYER                                                         │     │
│  │  screens/         components/         ui/           hooks/                   │     │
│  │  (Pages, routing)  (Shared UI)       (Flow UIs)    (useOcr, useFill, ...)   │     │
│  └──────────────────────────┬──────────────────────────────────────────────────┘     │
│                             │ depends on                                            │
│  ┌──────────────────────────▼──────────────────────────────────────────────────┐     │
│  │  APPLICATION LAYER                                                          │     │
│  │  features/ocr/    features/fill/    features/excel/    features/settings/   │     │
│  │  (Use cases, stores, orchestration, DTOs)                                   │     │
│  └──────────────────────────┬──────────────────────────────────────────────────┘     │
│                             │ depends on                                            │
│  ┌──────────────────────────▼──────────────────────────────────────────────────┐     │
│  │  INFRASTRUCTURE LAYER                                                      │     │
│  │                                                                              │     │
│  │  infra/adapters/   infra/db/     infra/ipc/    infra/logging/               │     │
│  │  (OCR providers,    (IndexedDB)   (Tauri IPC)   (logger, audit)             │     │
│  │   platform APIs)                                                             │     │
│  │                                                                              │     │
│  │  ocr/providers/    ocr/pipeline/  ocr/quality/   ocr/mrz/                    │     │
│  │  (Engine adapters)  (Orchestration)(Image Q)     (MRZ parsing)               │     │
│  └──────────────────────────┬──────────────────────────────────────────────────┘     │
│                             │                                                        │
│  ┌──────────────────────────▼──────────────────────────────────────────────────┐     │
│  │  TAURI RUST BACKEND                                                        │     │
│  │  commands/        (File, OCR, Excel, Clipboard, Settings, Auto-fill)        │     │
│  │  JSON IPC ──────► Python OCR Worker (subprocess)                            │     │
│  └─────────────────────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│  PACKAGES / SHARED (@guestfill/shared)                                               │
│  types/       constants/     utils/         provider-interfaces/                    │
│  (GuestRow,   (Columns,      (masking,      (OcrProvider, StorageProvider,           │
│   OcrResult,   Status,        date,           AuthProvider, ...)                     │
│   AppError)    Thresholds)    validation)                                            │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Boundary Map

### 3.1 Module Ownership Matrix

| Module               | Layer          | Responsibility                                    | Dependencies                          |
| -------------------- | -------------- | ------------------------------------------------- | ------------------------------------- |
| `screens/`           | Presentation   | Route pages, layout composition, user navigation  | `components/`, `hooks/`, `features/*` |
| `ui/`                | Presentation   | Multi-step workflow screens (OCR flow)            | `components/`, `hooks/`, `features/*` |
| `components/`        | Presentation   | Reusable UI primitives (Button, Card, FormField)  | None from app layer                   |
| `hooks/`             | Presentation   | React hooks connecting UI to features             | `features/*`                          |
| `features/ocr/`      | Application    | OCR use cases, job lifecycle, result state        | `domain/*`, `infra/ocr/*`             |
| `features/fill/`     | Application    | Auto-fill use cases, safety engine, templates     | `domain/*`, `infra/*`                 |
| `features/excel/`    | Application    | Excel import/export use cases                     | `domain/*`, `infra/*`                 |
| `features/settings/` | Application    | Settings management use cases                     | `domain/*`, `infra/db/`               |
| `infra/adapters/`    | Infrastructure | OCR provider implementations                      | `domain/provider-interfaces/`         |
| `infra/ocr/`         | Infrastructure | OCR engine wrappers, pipeline orchestration       | `domain/*`                            |
| `infra/db/`          | Infrastructure | IndexedDB connection, stores                      | None (raw IndexedDB)                  |
| `infra/ipc/`         | Infrastructure | Tauri invoke wrapper, IPC abstractions            | None                                  |
| `infra/logging/`     | Infrastructure | Structured logging, audit trails                  | `domain/*`                            |
| `infra/platform/`    | Infrastructure | Platform APIs (clipboard, dialogs, file system)   | `domain/*`                            |
| `config/`            | Application    | App configuration, constants, defaults            | `domain/*`                            |
| `lib/`               | Utility        | Pure utility functions (date, file, result monad) | None                                  |
| `shared/` (root)     | Domain         | Canonical types, constants, provider interfaces   | None (zero app dependencies)          |

### 3.2 Forbidden Dependencies

| Source Module            | Cannot Import From                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `shared/`                | Any app-specific module                                                                     |
| `features/*`             | `screens/`, `ui/`, `components/`, `hooks/`                                                  |
| `infra/*`                | `features/*`, `screens/`, `ui/`, `components/`, `hooks/`                                    |
| `services/` (deprecated) | Target: merge into `infra/` or `features/`. No new code in `services/`                      |
| `ocr/` (current)         | Target: split into `infra/ocr/` + `infra/adapters/`. No new code in `apps/desktop/src/ocr/` |

### 3.3 Provider Interface Ownership

Provider interfaces live in `packages/shared/src/provider-interfaces/`.  
Each provider type gets its own file:

```
provider-interfaces/
  ocr-provider.ts        # OcrProvider, OcrProviderType, OcrProviderConfig
  storage-provider.ts    # StorageProvider (for future use)
  auth-provider.ts       # AuthProvider (for future use)
  analytics-provider.ts  # AnalyticsProvider (for future use)
  notification-provider.ts # NotificationProvider (for future use)
```

---

## 4. Layer Definitions & Responsibilities

### 4.1 Domain Layer (`packages/shared/`)

Contains the **pure business concepts** of the application. Zero framework dependencies. Zero infrastructure imports.

**What lives here:**

- Entity types: `GuestRow`, `FillSession`, `OcrResult`, `AppSettings`
- Value objects: `Gender`, `DocumentType`, `ConfidenceLevel`, `GuestStatus`
- Provider interfaces: `OcrProvider`, `StorageProvider` (contracts only, no implementations)
- Constants: `GUEST_EXCEL_COLUMNS`, `GUEST_STATUS`, `DOCUMENT_TYPE`, threshold constants
- Utilities: `masking.ts`, `date.ts`, `validation.ts` (pure functions, no side effects)
- Error types: `AppError` class hierarchy

**Strict rules:**

- No imports from `apps/`, `workers/`, or any app-specific module.
- No React, no Tauri, no browser APIs.
- No side effects (no `fetch`, `localStorage`, `fs`).
- Provider interfaces must be framework-agnostic.

### 4.2 Application Layer (`apps/desktop/src/features/`)

Contains **use cases** — what the app _does_ with the domain concepts. Orchestrates domain logic and infrastructure.

**What lives here:**

- **Feature stores**: Zustand stores with selectors for OCR jobs, fill sessions, settings
- **Use case functions**: `runOcrJob`, `importExcel`, `executeAutoFill`, `confirmOcrResult`
- **Orchestration**: Multi-step workflows that coordinate multiple services
- **DTOs**: Request/response types for use case boundaries
- **Feature-specific constants**: Things that are feature-local and not shared

**Strict rules:**

- No direct imports from `infra/` — only through feature-defined interfaces or injected dependencies.
- No UI code (no JSX, no CSS, no Tailwind class strings).
- No infrastructure code (no IndexedDB calls, no Tauri `invoke()`).
- Dependencies are injected or obtained through factory functions.

### 4.3 Infrastructure Layer (`apps/desktop/src/infra/`)

Contains **adapters and implementations** — the "how" behind the "what."

**Sub-layers:**

| Sub-layer         | Contents                                                                              |
| ----------------- | ------------------------------------------------------------------------------------- |
| `infra/adapters/` | Provider implementations (OcrProvider → PaddleOCR, AzureOCR, MockOCR)                 |
| `infra/ocr/`      | OCR pipeline orchestration, engine wrappers, image processing, MRZ parsing            |
| `infra/db/`       | IndexedDB connection manager, store implementations, migration scripts                |
| `infra/ipc/`      | Tauri `invoke()` wrapper with typed request/response, mock IPC for testing            |
| `infra/logging/`  | Logger, audit logger, audit-log-service (consolidated)                                |
| `infra/platform/` | Clipboard, file dialog, file system, window management — abstracted behind interfaces |

**Strict rules:**

- Domain interfaces are the dependency direction: infra implements domain interfaces, not the reverse.
- No UI imports (no React, no JSX).
- Can import from `shared/` and `config/`.
- Provider adapters must never leak provider-specific types to the caller.

### 4.4 Presentation Layer (`apps/desktop/src/screens/` + `components/` + `hooks/` + `ui/`)

Contains **UI components and React hooks**.

**Sub-divisions:**

| Directory            | Contents                                                                     |
| -------------------- | ---------------------------------------------------------------------------- |
| `screens/`           | Page-level components, one per route                                         |
| `ui/`                | Multi-step workflow screen sets (OCR flow, Setup Wizard)                     |
| `components/`        | Reusable UI primitives (layout, common)                                      |
| `components/common/` | Button, Card, Input, Select, LoadingState, EmptyState, ErrorState            |
| `components/layout/` | AppLayout, PageHeader, Sidebar                                               |
| `components/ocr/`    | OCR-specific reusable components (ConfidenceBadge, StatusBadge, FieldEditor) |
| `components/fill/`   | Fill-specific reusable components                                            |
| `hooks/`             | React hooks: `useOcrJob`, `useFillSession`, `useSettings`, `usePlatform`     |

**Strict rules:**

- No direct infrastructure calls. Use hooks, which delegate to features/infra.
- Components are small and focused. Maximum 250 lines for a component.
- Business logic lives in hooks or features, never in JSX.
- Component state is UI-only. Persistent state goes in stores.
- No provider-specific code. No direct Tauri imports (use `hooks/usePlatform`).

---

## 5. Target Folder Structure

### 5.1 Desktop App (`apps/desktop/src/`)

```
src/
  app/
    main.tsx                    # React entry: BrowserRouter > App
    App.tsx                     # Route definitions
    routes.tsx                  # Route constants
    ErrorBoundary.tsx           # Global error boundary

  screens/                      # Page-level components
    HomeScreen.tsx
    OcrScreen.tsx
    ImportExcelScreen.tsx
    GuestListScreen.tsx
    FillAssistantScreen.tsx
    TemplateManagerScreen.tsx
    SettingsScreen.tsx
    LogScreen.tsx

  ui/                           # Multi-step workflow UIs
    ocr-flow/
      CameraCaptureScreen.tsx
      OcrProcessingScreen.tsx
      ExtractedResultReviewScreen.tsx
      ImageQualityWarningScreen.tsx
      ManualCorrectionScreen.tsx
      FinalConfirmationScreen.tsx
    wizard/
      SetupWizard.tsx
      SetupStepLanguage.tsx
      SetupStepProvider.tsx
      SetupStepPaths.tsx
      SetupStepFinish.tsx

  components/                   # Reusable UI components
    layout/
      AppLayout.tsx
      PageHeader.tsx
      Sidebar.tsx
    common/
      Button.tsx
      Card.tsx
      Input.tsx
      Select.tsx
      Modal.tsx
      LoadingState.tsx
      EmptyState.tsx
      ErrorState.tsx
      ErrorMessage.tsx
      LogTab.tsx
      Spinner.tsx
    ocr/
      ConfidenceBadge.tsx
      StatusBadge.tsx
      OcrProviderSelector.tsx
      FieldEditor.tsx
      FieldLabel.tsx
      FieldValue.tsx
    fill/
      FillStatusBadge.tsx
      FillProgressBar.tsx
    icons/
      IconSet.tsx               # Centralized SVG icons as React components

  hooks/                        # React hooks
    useOcrJob.ts
    useOcrProvider.ts
    useFillSession.ts
    useSettings.ts
    usePlatform.ts              # Platform abstraction (Tauri vs browser)
    useClipboard.ts
    useKeyboardShortcuts.ts
    useFormFields.ts
    useDebounce.ts

  features/                     # Application layer (use cases, stores)
    ocr/
      ocrStore.ts               # Zustand store for OCR jobs
      ocrUseCases.ts            # runOcrJob, confirmOcrResult, retryOcrJob
      ocrTypes.ts               # OcrJob, OcrRequest, OcrOptions (feature DTOs)
      ocrConstants.ts           # Language list, file extensions
    excel/
      excelStore.ts             # Zustand store for Excel import
      excelUseCases.ts          # importExcel, exportExcel
      excelTypes.ts
      excelValidation.ts
    fill/
      fillStore.ts              # Zustand store for fill sessions
      fillUseCases.ts           # executeAutoFill, saveGuestData, clearSession
      safetyEngine.ts           # Validation rules for auto-fill safety
      transformEngine.ts        # Field transformation rules
      templateManager.ts        # Target system templates
      copyAssistant.ts          # Copy-to-clipboard logic
      fillTypes.ts
      fillConstants.ts
    settings/
      settingsStore.ts          # Zustand store with IndexedDB persistence
      settingsTypes.ts
      defaultSettings.ts

  infra/                        # Infrastructure layer
    adapters/
      ocr/
        paddle-ocr-adapter.ts   # PaddleOCR implementation of OcrProvider
        tesseract-ocr-adapter.ts# Tesseract implementation of OcrProvider
        azure-ocr-adapter.ts    # Azure Document Intelligence implementation
        mock-ocr-adapter.ts     # Mock implementation for testing
        easy-ocr-adapter.ts     # EasyOCR implementation (stub/future)
      storage/
        local-storage-adapter.ts# Local file storage implementation
    ocr/
      pipeline/
        ocr-pipeline.ts         # Pipeline orchestrator (moved from services/)
        stage-runner.ts         # Abstract stage interface + runner
      quality/
        image-quality-service.ts
        image-quality.ts
      preprocessing/
        image-preprocessing-service.ts
        image-preprocessing.ts
        document-crop-service.ts
        document-detector.ts
      mrz/
        mrz-parser.ts           # Single canonical MRZ parser (consolidated)
        mrz-detection-service.ts
        mrz-cropper.ts
        mrz-checksum-validator.ts
        mrz-ocr-service.ts
      confidence/
        confidence-service.ts   # Single canonical confidence scorer
      normalization/
        field-normalization-service.ts
      review/
        staff-review-service.ts
        review-service.ts
      warning/
        ocr-warning-service.ts
    db/
      connection-manager.ts     # Singleton IndexedDB connection manager
      stores/
        import-session-store.ts
        guest-row-store.ts
        target-template-store.ts
        fill-event-store.ts
        settings-store.ts
        audit-log-store.ts
      migrations/
        migration-001-initial.ts
    ipc/
      tauri-ipc.ts              # Typed Tauri invoke wrapper
      mock-ipc.ts               # Mock IPC for testing
      ipc-types.ts              # Request/response types for IPC
    logging/
      logger.ts                 # Structured logger (consolidated)
      audit-logger.ts           # Audit trail logger (consolidated)
      sensitive-masker.ts       # Unified PII masking
    platform/
      clipboard.ts              # Clipboard abstraction
      file-dialog.ts            # File dialog abstraction
      file-system.ts            # File system abstraction
      window.ts                 # Window management abstraction

  config/                       # Application configuration
    constants.ts                # All magic numbers, thresholds, defaults (centralized)
    version.ts                  # App version
    field-mapping.ts            # Field mapping definitions
    field-definitions.ts        # Single source of truth for field labels and metadata
    settings-config.ts          # Settings schema and defaults

  lib/                          # Pure utility functions
    result.ts                   # Result/Option monad (ok/err pattern)
    date-utils.ts               # Date formatting and parsing
    file-utils.ts               # File utilities
    validation.ts               # Shared validation utilities
    type-guards.ts              # Type guard functions

  styles/
    index.css                   # Tailwind CSS entry

  __tests__/                    # Tests (mirroring source structure)
    features/
    infra/
    hooks/
    lib/
    integration/
```

### 5.2 Shared Package (`packages/shared/src/`)

```
src/
  index.ts                              # Re-exports everything

  types/
    index.ts                            # Re-exports all type modules
    guest.ts                            # GuestRow, DocumentType, Gender, ConfidenceLevel, GuestStatus
    ocr.ts                              # OcrResult, ExtractedFields, OcrWarningCode, OcrProviderType
    fill.ts                             # FillStatus, FillState, FillAction, FillTarget, FillHistoryEntry
    event.ts                            # FillEventType, FillEvent
    excel.ts                            # ExcelColumn, ExcelExportOptions, ExcelImportResult
    template.ts                         # TargetSystemTemplate, FieldMapping, SafetyRule
    transform.ts                        # TransformRule
    settings.ts                         # AppSettings (canonical, single source of truth)
    error.ts                            # AppError class hierarchy

  constants/
    index.ts
    columns.ts                          # GUEST_EXCEL_COLUMNS
    status.ts                           # GUEST_STATUS, FILL_STATUS, DOCUMENT_TYPE, CONFIDENCE_LEVEL
    thresholds.ts                       # Canonical thresholds (confidence, quality, MRZ)
    warning-codes.ts                    # Canonical warning codes (single source, shared with Python)

  utils/
    index.ts
    masking.ts                          # Unified PII masking (maskPassport, maskId, maskName, maskDob, maskPhone, maskEmail)
    date.ts                             # parseDate, formatDate, isValidDate (with proper validation)
    validation.ts                       # Shared validation rules (field length, format, etc.)
    type-guards.ts                      # Shared type guard functions

  provider-interfaces/
    index.ts
    ocr-provider.ts                     # Canonical OcrProvider interface
    storage-provider.ts                 # StorageProvider interface (future)
    auth-provider.ts                    # AuthProvider interface (future)
```

### 5.3 Python OCR Worker (`workers/ocr/guestfill_ocr/`)

```
src/
  __main__.py
  main.py                               # process_ocr_job — simplified entry point

  cli/
    __init__.py
    commands.py                         # Click CLI
    progress_writer.py
    request_reader.py
    response_writer.py

  pipeline/
    job_runner.py                       # Refactored: strategy pattern for engine selection
    batch_processor.py
    document_processor.py
    result_builder.py

  ocr/
    engines/
      paddleocr_engine.py               # PaddleOCR implementation
      tesseract_engine.py               # Tesseract implementation
      engine_selector.py                # Strategy pattern: select engine based on document/language/quality
    candidates/
      ocr_candidate.py                  # Candidate generation (refactored to reduce duplication)

  passport/
    mrz_parser.py                       # Single canonical MRZ parser
    mrz_cropper.py
    mrz_line_finder.py
    mrz_repair.py
    mrz_validator.py
    passport_visual_ocr.py

  id_card/
    id_card_detector.py
    id_card_ocr.py
    id_field_parser.py
    id_field_validator.py

  classification/
    document_classifier.py
    script_detector.py

  image/
    preprocess.py
    quality_analyzer.py
    document_boundary.py
    perspective_correction.py

  extraction/
    field_extractor.py
    field_normalizer.py
    field_validator.py
    confidence_engine.py
    warning_engine.py

  security/
    privacy_guard.py                    # Enhanced: recursive masking, email/phone/address patterns
    safe_logging.py                     # Enhanced: dynamic sensitive key detection

  config/
    config_loader.py                    # Single configuration system (merged with default_config.py)
    language_resolver.py

  common/
    constants.py
    errors.py
    logging.py
    result.py
    time_utils.py
```

### 5.4 Tauri Rust Backend (`apps/desktop/src-tauri/src/`)

```
src/
  main.rs
  app_state.rs
  error.rs                            # Typed AppErrorCode enum (replaces string-based codes)

  commands/
    mod.rs
    file_commands.rs                  # Refactored: async dialog API
    ocr_commands.rs                   # Refactored: job queuing, remove placeholder command
    excel_commands.rs                 # Implement real Excel commands (remove stubs)
    clipboard_commands.rs             # Add auto-clear timer with configurable delay
    settings_commands.rs              # Persistent settings (IndexedDB-backed)
    auto_fill_commands.rs             # Refactored: platform abstraction for fill operations
```

---

## 6. Provider-Independent Design

### 6.1 Principle

Every external service the app interacts with must be hidden behind an **interface in the domain layer**.  
The **application and presentation layers** depend only on the interface.  
The **infrastructure layer** provides implementations.

```
┌──────────────────────────────────────────────────┐
│  Domain (packages/shared/provider-interfaces/)   │
│                                                  │
│  interface OcrProvider {                         │
│    processImage(input): OcrResult               │
│    cancel(): void                                │
│  }                                               │
└──────────────────────┬──────────────────────────┘
                       │ depends on
┌──────────────────────▼──────────────────────────┐
│  Application (features/ocr/)                     │
│  Uses OcrProvider interface.                     │
│  Does NOT import azure/paddle/tesseract.         │
└──────────────────────┬──────────────────────────┘
                       │ depends on
┌──────────────────────▼──────────────────────────┐
│  Infrastructure (infra/adapters/ocr/)             │
│                                                  │
│  PaddleOcrAdapter implements OcrProvider          │
│  AzureOcrAdapter implements OcrProvider           │
│  TesseractOcrAdapter implements OcrProvider       │
│  MockOcrAdapter implements OcrProvider            │
└──────────────────────────────────────────────────┘
```

### 6.2 Provider Interface: `OcrProvider`

```typescript
// packages/shared/src/provider-interfaces/ocr-provider.ts

/** Normalized result from any OCR provider. */
export interface OcrProviderResult {
  fields: ExtractedFields;
  rawText: string;
  overallConfidence: number;
  overallConfidenceLevel: ConfidenceLevel;
  fieldConfidence: Record<string, number>;
  warnings: OcrWarning[];
  provider: OcrProviderType;
  processingTimeMs: number;
}

/** Configuration for a single OCR processing request. */
export interface OcrProcessingRequest {
  imageSource: ImageSource;
  documentType?: DocumentType;
  language?: string;
  options?: Partial<OcrProcessingOptions>;
}

export interface OcrProcessingOptions {
  confidenceThreshold: number;
  enableMrzDetection: boolean;
  enableVisualExtraction: boolean;
  enableImagePreprocessing: boolean;
  timeoutMs: number;
}

/** Canonical OCR provider interface. */
export interface OcrProvider {
  readonly type: OcrProviderType;
  readonly displayName: string;
  readonly capabilities: OcrProviderCapabilities;

  processImage(request: OcrProcessingRequest): Promise<Result<OcrProviderResult, AppError>>;
  processBatch(requests: OcrProcessingRequest[]): Promise<Result<OcrProviderResult[], AppError>>;
  cancel(): void;
}

export interface OcrProviderCapabilities {
  supportsBatchProcessing: boolean;
  supportedDocumentTypes: DocumentType[];
  supportedLanguages: string[];
  maxFileSizeBytes: number;
  requiresNetwork: boolean;
  isFree: boolean;
}
```

### 6.3 Supported OCR Providers

| Provider                    | Adapter                       | Type                      | Requires Network | Cost |
| --------------------------- | ----------------------------- | ------------------------- | ---------------- | ---- |
| MockOCR                     | `MockOcrAdapter`              | Development/Testing       | No               | Free |
| PaddleOCR                   | `PaddleOcrAdapter`            | Local (Python subprocess) | No               | Free |
| Tesseract.js                | `TesseractOcrAdapter`         | Local (Browser/Worker)    | No               | Free |
| Azure Document Intelligence | `AzureOcrAdapter`             | Cloud                     | Yes              | Paid |
| Google Document AI          | `GoogleOcrAdapter` (future)   | Cloud                     | Yes              | Paid |
| AWS Textract                | `AwsTextractAdapter` (future) | Cloud                     | Yes              | Paid |

### 6.4 Provider Registry & Selection

```typescript
// features/ocr/ocrProviderRegistry.ts

import type { OcrProvider, OcrProviderType } from "@guestfill/shared";

export interface OcrProviderRegistry {
  getProvider(type: OcrProviderType): OcrProvider;
  getAvailableProviders(): OcrProvider[];
  getDefaultProvider(): OcrProviderType;
  registerProvider(type: OcrProviderType, provider: OcrProvider): void;
}
```

The registry is populated at app startup from `config/provider-config.ts`.  
New providers are added by implementing `OcrProvider` and registering them — zero changes to business logic or UI.

### 6.5 Infrastructure Providers (Future)

All future external service integrations follow the same pattern:

```typescript
// Example: Data storage provider
interface StorageProvider {
  save(key: string, data: unknown): Promise<Result<void, AppError>>;
  load<T>(key: string): Promise<Result<T | null, AppError>>;
  delete(key: string): Promise<Result<void, AppError>>;
  list(prefix: string): Promise<Result<string[], AppError>>;
}

// Example: Authentication provider
interface AuthProvider {
  login(credentials: AuthCredentials): Promise<Result<AuthSession, AppError>>;
  logout(): Promise<Result<void, AppError>>;
  getSession(): Promise<Result<AuthSession | null, AppError>>;
  onAuthStateChanged(callback: (session: AuthSession | null) => void): () => void;
}
```

---

## 7. Key Interfaces & Abstractions

### 7.1 Error Handling: `AppError`

```typescript
// packages/shared/src/types/error.ts

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "OCR_PROCESSING_ERROR"
  | "OCR_PROVIDER_ERROR"
  | "FILE_IO_ERROR"
  | "DATABASE_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT_ERROR"
  | "CANCELLED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "UNSUPPORTED_OPERATION"
  | "UNKNOWN";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "AppError";
  }

  toJSON(): AppErrorSerialized {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }

  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }
}
```

### 7.2 Result Monad

```typescript
// apps/desktop/src/lib/result.ts

export type Result<T, E = AppError> = Ok<T, E> | Err<T, E>;

export class Ok<T, E> {
  readonly ok = true as const;
  readonly err = false as const;
  constructor(public readonly value: T) {}

  isOk(): this is Ok<T, E> {
    return true;
  }
  isErr(): this is Err<T, E> {
    return false;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return ok(fn(this.value));
  }
  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return ok(this.value);
  }
  unwrap(): T {
    return this.value;
  }
  unwrapOr(defaultValue: T): T {
    return this.value;
  }
}

export class Err<T, E> {
  readonly ok = false as const;
  readonly err = true as const;
  constructor(public readonly error: E) {}

  isOk(): this is Ok<T, E> {
    return false;
  }
  isErr(): this is Err<T, E> {
    return true;
  }

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return err(this.error);
  }
  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return err(fn(this.error));
  }
  unwrap(): never {
    throw this.error;
  }
  unwrapOr(defaultValue: T): T {
    return defaultValue;
  }
}

export function ok<T, E = never>(value: T): Result<T, E> {
  return new Ok(value);
}
export function err<T, E>(error: E): Result<T, E> {
  return new Err(error);
}
```

### 7.3 Platform Abstraction

```typescript
// apps/desktop/src/infra/platform/platform-abstractions.ts

export interface ClipboardProvider {
  writeText(text: string): Promise<Result<void, AppError>>;
  readText(): Promise<Result<string, AppError>>;
  clear(): Promise<Result<void, AppError>>;
  /** Set auto-clear timer in ms. Pass 0 to disable. */
  setAutoClear(ms: number): void;
}

export interface FileDialogProvider {
  openFile(options: FileDialogOptions): Promise<Result<string[], AppError>>;
  openDirectory(options: DirectoryDialogOptions): Promise<Result<string | null, AppError>>;
  saveFile(options: SaveDialogOptions): Promise<Result<string | null, AppError>>;
}

export interface FileSystemProvider {
  readFile(path: string): Promise<Result<Uint8Array, AppError>>;
  writeFile(path: string, data: Uint8Array): Promise<Result<void, AppError>>;
  deleteFile(path: string): Promise<Result<void, AppError>>;
  exists(path: string): Promise<Result<boolean, AppError>>;
}

export interface WindowProvider {
  focus(windowName: string): Promise<Result<void, AppError>>;
  minimize(): Promise<Result<void, AppError>>;
  close(): Promise<Result<void, AppError>>;
}

export interface PlatformProvider extends ClipboardProvider, FileDialogProvider, FileSystemProvider, WindowProvider {}
```

### 7.4 IndexedDB Connection Manager

```typescript
// apps/desktop/src/infra/db/connection-manager.ts

export interface DbConnection {
  getObjectStore(name: string, mode: IDBTransactionMode): IDBObjectStore;
  transaction(storeNames: string | string[], mode: IDBTransactionMode): IDBTransaction;
}

export interface DbConnectionManager {
  getConnection(): Promise<Result<DbConnection, AppError>>;
  close(): void;
}
```

Singleton pattern: one connection per app lifetime, shared across all store modules.

---

## 8. Data Flow Architecture

### 8.1 OCR Processing Flow

```
User selects files
  │
  ▼
OcrScreen (UI)
  │
  ▼
useOcrJob hook
  │
  ▼
features/ocr/ocrUseCases.ts
  ├── Validates input (file type, size, count)
  ├── Selects provider from registry
  ├── Creates OcrJob in store (status: PROCESSING)
  │
  ▼
infra/adapters/ocr/paddle-ocr-adapter.ts
  ├── Calls Tauri invoke('run_ocr') via infra/ipc/tauri-ipc.ts
  ├── Polls progress updates
  │
  ▼
Tauri Rust Command → Python OCR Worker
  │
  ▼
infra/adapters/ocr/paddle-ocr-adapter.ts
  ├── Receives raw result
  ├── Normalizes to OcrProviderResult (shared type)
  ├── Returns Result<OcrProviderResult, AppError>
  │
  ▼
features/ocr/ocrUseCases.ts
  ├── Applies field normalization (infra/ocr/normalization/)
  ├── Runs confidence scoring (infra/ocr/confidence/)
  ├── Updates OcrJob in store (status: REVIEW_REQUIRED)
  │
  ▼
OcrScreen (UI) → ExtractedResultReviewScreen → ManualCorrectionScreen → FinalConfirmationScreen
  │
  ▼
features/ocr/ocrUseCases.ts (confirmOcrResult)
  ├── Saves to IndexedDB guest_rows via infra/db/stores/
  ├── Updates OcrJob (status: CONFIRMED)
```

### 8.2 Auto-Fill Flow

```
FillAssistantScreen (UI)
  │
  ▼
useFillSession hook
  │
  ▼
features/fill/fillUseCases.ts
  ├── Loads import session from IndexedDB
  ├── Validates guest data
  ├── Applies safety rules (safetyEngine.ts)
  │
  ▼
features/fill/copyAssistant.ts
  ├── Builds copy sequence from template
  ├── Applies field transformations (transformEngine.ts)
  │
  ▼
infra/platform/clipboard.ts
  ├── Copies field value to clipboard
  ├── Auto-clears after configured delay
  │
  ▼
features/fill/fillStore.ts
  ├── Logs fill event to IndexedDB (fill_events)
  ├── Updates fill status
```

### 8.3 Excel Import Flow

```
ImportExcelScreen (UI)
  │
  ▼
useExcelImport hook
  │
  ▼
features/excel/excelUseCases.ts
  ├── Opens file dialog via infra/platform/file-dialog.ts
  ├── Reads file via infra/platform/file-system.ts
  ├── Validates file type and size
  │
  ▼
Tauri Rust Command → Reads Excel file
  │
  ▼
features/excel/excelUseCases.ts
  ├── Validates rows (excelValidation.ts)
  ├── Maps to GuestRow objects
  ├── Saves to IndexedDB (import_sessions, guest_rows)
  ├── Returns ImportSummary
```

---

## 9. State Management Architecture

### 9.1 Principles

- **Domain state** (persistent, app-wide): Zustand stores with IndexedDB persistence
- **UI state** (transient, component-scoped): React `useState` / `useReducer`
- **Server/cache state** (transient, session-scoped): Zustand stores without persistence
- **Form state**: React Hook Form or controlled component state with validation schema

### 9.2 Store Pattern

```typescript
// features/ocr/ocrStore.ts

import { create } from "zustand";
import type { OcrJob } from "./ocrTypes";
import type { OcrProviderType, GuestRow } from "@guestfill/shared";

interface OcrState {
  jobs: Map<string, OcrJob>;
  activeJobId: string | null;

  // Actions
  addJob: (job: OcrJob) => void;
  updateJob: (id: string, updates: Partial<OcrJob>) => void;
  removeJob: (id: string) => void;
  setActiveJob: (id: string | null) => void;
  clearCompleted: () => void;

  // Selectors (computed)
  getActiveJob: () => OcrJob | null;
  getJobsByStatus: (status: string) => OcrJob[];
}

export const useOcrStore = create<OcrState>((set, get) => ({
  jobs: new Map(),
  activeJobId: null,

  addJob: (job) =>
    set((state) => {
      const jobs = new Map(state.jobs);
      jobs.set(job.id, job);
      return { jobs };
    }),

  updateJob: (id, updates) =>
    set((state) => {
      const jobs = new Map(state.jobs);
      const existing = jobs.get(id);
      if (existing) {
        jobs.set(id, { ...existing, ...updates });
      }
      return { jobs };
    }),

  removeJob: (id) =>
    set((state) => {
      const jobs = new Map(state.jobs);
      jobs.delete(id);
      return { jobs, activeJobId: state.activeJobId === id ? null : state.activeJobId };
    }),

  setActiveJob: (id) => set({ activeJobId: id }),

  clearCompleted: () =>
    set((state) => {
      const jobs = new Map(state.jobs);
      for (const [id, job] of jobs) {
        if (job.status === "CONFIRMED" || job.status === "FAILED") {
          jobs.delete(id);
        }
      }
      return { jobs };
    }),

  getActiveJob: () => {
    const { jobs, activeJobId } = get();
    return activeJobId ? (jobs.get(activeJobId) ?? null) : null;
  },

  getJobsByStatus: (status) => {
    const { jobs } = get();
    return Array.from(jobs.values()).filter((job) => job.status === status);
  },
}));
```

### 9.3 Persistence Strategy

| Store            | Persistence         | Medium                     | Key         |
| ---------------- | ------------------- | -------------------------- | ----------- |
| OCR Jobs         | None (session only) | In-memory Zustand          | -           |
| Fill Sessions    | IndexedDB           | `import-session-store.ts`  | session id  |
| Guest Rows       | IndexedDB           | `guest-row-store.ts`       | row id      |
| Target Templates | IndexedDB           | `target-template-store.ts` | template id |
| Fill Events      | IndexedDB           | `fill-event-store.ts`      | event id    |
| Settings         | IndexedDB           | `settings-store.ts`        | key-value   |
| Audit Logs       | IndexedDB           | `audit-log-store.ts`       | log id      |

---

## 10. Error Handling Architecture

### 10.1 Strategy

| Layer                       | Error Handling Pattern                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------- |
| **Domain**                  | Functions return `AppError` instances. No throw.                                        |
| **Application (features/)** | Use cases return `Result<T, AppError>`. Catch infrastructure errors and wrap.           |
| **Infrastructure**          | Catch external errors, wrap in `AppError`, return `Err`. Never throw.                   |
| **Presentation (hooks)**    | Unwrap `Result`, map to UI state (loading/error/data).                                  |
| **Presentation (screens)**  | Display error state components. `ErrorBoundary` catches render errors.                  |
| **Tauri Rust Backend**      | Return `Result<T, AppError>` from all commands. `AppError` with typed `ErrorCode` enum. |

### 10.2 Error Propagation

```
Infrastructure error (e.g., IndexedDB unavailable)
  → wrapped in AppError('DATABASE_ERROR', ...)
  → returned as Err from infrastructure
  → caught in feature use case
  → logged via infra/logging/audit-logger.ts
  → returned as Err to hook
  → hook sets error state
  → screen renders <ErrorState /> or inline error
```

### 10.3 Global Error Boundary

```typescript
// apps/desktop/src/app/ErrorBoundary.tsx

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log to audit logger (sensitive data masked)
    logger.error('Unhandled React error', {
      error: error.message,
      componentStack: info.componentStack,
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? <ErrorState error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

---

## 11. Security & Privacy Architecture

### 11.1 Principles

- **Zero secrets in frontend code.** API keys, tokens, and credentials are stored in the Rust backend's secure storage (or OS keychain) and provided to the renderer only through typed IPC calls where needed.
- **Mask on log, always.** Every log entry passes through `sensitive-masker.ts` before output. Masking is applied at the logging boundary, not in business logic.
- **Clipboard auto-clear.** Any clipboard write of sensitive data (passport number, ID number, etc.) is followed by an auto-clear timer (configurable in settings, default 30 seconds).
- **No unnecessary data retention.** Temporary files are deleted after processing. Uploaded images are processed and discarded unless explicitly saved.
- **Privacy by design.** Passport/ID data is treated as sensitive. The UI never shows full document numbers without user action (e.g., "show" toggle).

### 11.2 PII Masking: Single Canonical Implementation

```typescript
// packages/shared/src/utils/masking.ts

export interface MaskingConfig {
  maxVisibleChars: number;
  maskChar: string;
  showLast: boolean;
}

const SENSITIVE_FIELD_PATTERNS: Record<string, MaskingConfig> = {
  passportNumber: { maxVisibleChars: 4, maskChar: '*', showLast: true },
  idNumber: { maxVisibleChars: 4, maskChar: '*', showLast: true },
  fullName: { maxVisibleChars: 2, maskChar: '*', showLast: false },
  surname: { maxVisibleChars: 2, maskChar: '*', showLast: false },
  givenName: { maxVisibleChars: 2, maskChar: '*', showLast: false },
  dateOfBirth: { maxVisibleChars: 0, maskChar: '*', showLast: false },
  phoneNumber: { maxVisibleChars: 4, maskChar: '*', showLast: true },
  email: { maxVisibleChars: 2, maskChar: '*', showLast: false },
  // Fields not in this list are NOT masked
};

export function maskFieldValue(key: string, value: string): string { ... }
export function maskObject<T extends Record<string, unknown>>(obj: T): T { ... }
export function maskLogEntry<T>(entry: T): T { ... }
```

### 11.3 Platform Clipboard with Auto-Clear

```typescript
// apps/desktop/src/infra/platform/clipboard.ts

export class ClipboardService implements ClipboardProvider {
  private autoClearTimer: ReturnType<typeof setTimeout> | null = null;
  private autoClearMs: number = 30000;

  async writeText(text: string): Promise<Result<void, AppError>> {
    // Clear any existing auto-clear timer
    this.clearAutoClearTimer();

    // Write to clipboard via Tauri IPC
    const result = await tauriInvoke("copy_to_clipboard", { text });
    if (result.isErr()) return result;

    // Set auto-clear timer
    if (this.autoClearMs > 0) {
      this.autoClearTimer = setTimeout(() => {
        this.clear().catch(() => {});
      }, this.autoClearMs);
    }

    return ok(undefined);
  }

  setAutoClear(ms: number): void {
    this.autoClearMs = ms;
  }

  private clearAutoClearTimer(): void {
    if (this.autoClearTimer) {
      clearTimeout(this.autoClearTimer);
      this.autoClearTimer = null;
    }
  }
}
```

### 11.4 Secure File Handling

- Uploaded images: processed in a temp directory, deleted after OCR completion.
- Temp directory: randomized subdirectory name per session (prevents enumeration).
- Excel exports: only include fields explicitly selected by the user.
- All file paths are validated against path traversal patterns before use.

---

## 12. Naming Conventions

### 12.1 TypeScript

| Construct        | Convention                      | Example                           |
| ---------------- | ------------------------------- | --------------------------------- |
| Files            | `kebab-case.ts`                 | `ocr-provider.ts`, `ocr-store.ts` |
| Test files       | `<module>.test.ts`              | `ocr-store.test.ts`               |
| Classes          | `PascalCase`                    | `ClipboardService`                |
| Interfaces       | `PascalCase` (no `I` prefix)    | `OcrProvider`                     |
| Types            | `PascalCase`                    | `OcrProviderType`                 |
| Type aliases     | `PascalCase`                    | `ExtractedFields`                 |
| Functions        | `camelCase`                     | `processImage()`, `runOcrJob()`   |
| Variables        | `camelCase`                     | `ocrResult`, `activeJobId`        |
| Constants        | `UPPER_SNAKE_CASE`              | `MAX_FILE_SIZE_BYTES`             |
| React components | `PascalCase`                    | `OcrScreen`, `ConfidenceBadge`    |
| React hooks      | `camelCase` prefixed with `use` | `useOcrJob`, `useFillSession`     |
| Enums            | `PascalCase`                    | `GuestStatus`, `ErrorCode`        |
| Enum values      | `UPPER_SNAKE_CASE`              | `GuestStatus.READY`               |
| Private methods  | `camelCase` prefixed with `_`   | `_validateInput()`                |

### 12.2 Python

| Construct       | Convention                                 | Example                  |
| --------------- | ------------------------------------------ | ------------------------ |
| Files           | `snake_case.py`                            | `mrz_parser.py`          |
| Classes         | `PascalCase`                               | `MrzParser`              |
| Functions       | `snake_case`                               | `parse_mrz_line()`       |
| Variables       | `snake_case`                               | `mrz_text`               |
| Constants       | `UPPER_SNAKE_CASE`                         | `MRZ_LINE_LENGTHS`       |
| Private methods | `snake_case` prefixed with `_`             | `_validate_checksum()`   |
| Type aliases    | `PascalCase`                               | `MrzResult`              |
| Data classes    | `PascalCase` (decorated with `@dataclass`) | `class MrzParsedResult:` |

### 12.3 Rust

| Construct     | Convention         | Example                   |
| ------------- | ------------------ | ------------------------- |
| Files         | `snake_case.rs`    | `ocr_commands.rs`         |
| Types         | `PascalCase`       | `AppError`, `AppSettings` |
| Functions     | `snake_case`       | `run_ocr()`               |
| Variables     | `snake_case`       | `ocr_result`              |
| Constants     | `UPPER_SNAKE_CASE` | `DEFAULT_TIMEOUT_MS`      |
| Enums         | `PascalCase`       | `ErrorCode`               |
| Enum variants | `PascalCase`       | `ErrorCode::IoError`      |
| Modules       | `snake_case`       | `mod file_commands`       |

### 12.4 Cross-Language Consistency

To prevent type drift, shared types that cross language boundaries must have a **canonical source of truth**:

| Shared Concept                              | Source of Truth                                             | Synced To                                     |
| ------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `Gender`, `DocumentType`, `GuestStatus`     | TypeScript `packages/shared/src/types/`                     | Python (manual sync with test)                |
| `WarningCode`                               | TypeScript `packages/shared/src/constants/warning-codes.ts` | Python (auto-generated JSON or test)          |
| `ErrorCode`                                 | TypeScript `packages/shared/src/types/error.ts`             | Rust `error.rs` (manual sync with test)       |
| `AppSettings`                               | TypeScript `packages/shared/src/types/settings.ts`          | Rust `app_state.rs` (manual sync with test)   |
| Thresholds (confidence, image quality, MRZ) | TypeScript `packages/shared/src/constants/thresholds.ts`    | Python `constants.py` (manual sync with test) |

A cross-language contract test verifies that Python and Rust definitions match the TypeScript source of truth.

---

## 13. Typing Standards

### 13.1 TypeScript Strict Mode

- `strict: true` in `tsconfig.json` (already enabled).
- `noUncheckedIndexedAccess: true` (already enabled).
- `exactOptionalPropertyTypes: true` (add).
- `noPropertyAccessFromIndexSignature: true` (add).

### 13.2 Type Rules

| Rule                         | Guideline                                                              |
| ---------------------------- | ---------------------------------------------------------------------- |
| **No `any`**                 | Use `unknown` instead. Cast only with validated type guards.           |
| **No `as` casts**            | Use type guards (`is`) or branded types for runtime validation.        |
| **Prefer `interface`**       | Use `interface` for public API shapes that may be extended.            |
| **Use `type` for unions**    | Union types, intersection types, and mapped types use `type`.          |
| **Branded types**            | Use branded types for IDs and sensitive values.                        |
| **`import type`**            | Always use `import type` for type-only imports (enforced by ESLint).   |
| **Discriminated unions**     | Use `{ kind: '...' }` discriminated unions for variant types.          |
| **No `Record<string, any>`** | Use `Record<string, unknown>` + type guards, or specific mapped types. |

### 13.3 Branded Types

```typescript
// packages/shared/src/types/brand.ts

declare const BrandSymbol: unique symbol;

export type Brand<T, B extends string> = T & { readonly [BrandSymbol]: B };

// Usage
export type GuestRowId = Brand<string, "GuestRowId">;
export type SessionId = Brand<string, "SessionId">;
export type PassportNumber = Brand<string, "PassportNumber">;
```

### 13.4 Type Guards

```typescript
// apps/desktop/src/lib/type-guards.ts

export function isOcrProviderType(value: unknown): value is OcrProviderType {
  return typeof value === "string" && OCR_PROVIDER_TYPES.includes(value as OcrProviderType);
}

export function isGuestRow(value: unknown): value is GuestRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" && typeof row.fullName === "string"
    // ... additional field checks
  );
}
```

---

## 14. File Size & Component Guidelines

### 14.1 Maximum File Sizes

| Type                    | Max Lines | Action if Exceeded                                      |
| ----------------------- | --------- | ------------------------------------------------------- |
| React component         | 250 lines | Extract sub-components or hooks                         |
| React hook              | 100 lines | Extract helper functions or sub-hooks                   |
| Service/Use case module | 300 lines | Split by responsibility                                 |
| Store                   | 200 lines | Split by domain (e.g., separate actions from selectors) |
| Adapter                 | 200 lines | Split by method group                                   |
| Pure utility            | 150 lines | Split by function category                              |
| Test file               | 300 lines | Split by test group                                     |

### 14.2 Component Structure Pattern

```typescript
// components/ocr/ConfidenceBadge.tsx

import type { ConfidenceLevel } from '@guestfill/shared';
import { cn } from '@/lib/cn'; // utility classname helper

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  score: number;
  className?: string;
}

const BADGE_STYLES: Record<ConfidenceLevel, string> = {
  HIGH: 'bg-green-100 text-green-800 border-green-300',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  LOW: 'bg-red-100 text-red-800 border-red-300',
};

export function ConfidenceBadge({ level, score, className }: ConfidenceBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium border', BADGE_STYLES[level], className)}>
      <span>{level}</span>
      <span className="opacity-60">({Math.round(score * 100)}%)</span>
    </span>
  );
}
```

### 14.3 Hook Pattern

```typescript
// hooks/useOcrJob.ts

import { useCallback } from "react";
import { useOcrStore } from "@/features/ocr/ocrStore";
import { ocrUseCases } from "@/features/ocr/ocrUseCases";
import type { OcrProcessingRequest } from "@guestfill/shared";

interface UseOcrJobReturn {
  jobs: ReturnType<typeof useOcrStore.getState>["jobs"];
  activeJob: ReturnType<typeof useOcrStore.getState>["getActiveJob"];
  startOcrJob: (request: OcrProcessingRequest) => Promise<void>;
  confirmResult: (jobId: string) => Promise<void>;
  retryJob: (jobId: string) => Promise<void>;
  cancelJob: (jobId: string) => void;
  isLoading: boolean;
  error: string | null;
}

export function useOcrJob(): UseOcrJobReturn {
  const jobs = useOcrStore((s) => s.jobs);
  const activeJob = useOcrStore((s) => s.getActiveJob());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startOcrJob = useCallback(async (request: OcrProcessingRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await ocrUseCases.startJob(request);
      if (result.isErr()) {
        setError(result.error.message);
      }
    } catch (e) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ... similar for confirmResult, retryJob, cancelJob

  return { jobs, activeJob, startOcrJob, confirmResult, retryJob, cancelJob, isLoading, error };
}
```

---

## 15. Migration Strategy

### 15.1 Approach: Incremental Transformation in Place

The architecture is implemented through a series of safe, incremental refactoring phases. Each phase preserves existing behavior and passes all existing tests.

### 15.2 Phase Breakdown

#### Phase 1: Foundation (Infrastructure & Domain Cleanup)

| Step | Action                                                                         | Validation                |
| ---- | ------------------------------------------------------------------------------ | ------------------------- |
| 1.1  | Create `packages/shared/src/provider-interfaces/` with `OcrProvider` interface | `pnpm typecheck`          |
| 1.2  | Create `infra/` directory structure under `apps/desktop/src/`                  | `pnpm test`               |
| 1.3  | Move `lib/result.ts` to new location, adopt single `AppError` class            | `pnpm typecheck`          |
| 1.4  | Implement `connection-manager.ts` (singleton IndexedDB pattern)                | Existing store tests pass |
| 1.5  | Create `infra/ipc/tauri-ipc.ts` — typed wrapper around `invoke()`              | `pnpm test`               |
| 1.6  | Create `infra/platform/` with clipboard, file dialog abstractions              | `pnpm test`               |
| 1.7  | Consolidate masking: single implementation in `shared/utils/masking.ts`        | Masking tests pass        |

#### Phase 2: OCR Abstraction Unification

| Step | Action                                                                                        | Validation                    |
| ---- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| 2.1  | Implement `OcrProvider` interface: Wrap existing engines as adapters in `infra/adapters/ocr/` | OCR unit tests pass           |
| 2.2  | Create `OcrProviderRegistry` in `features/ocr/`                                               | Provider selection tests pass |
| 2.3  | Create config `config/provider-config.ts` for provider registration                           | Config tests pass             |
| 2.4  | Wire `OcrScreen` to use registry + `useOcrProvider` hook                                      | E2E OCR test passes           |
| 2.5  | Remove old `OcrEngine` interface (replaced by `OcrProvider`)                                  | `pnpm typecheck`              |
| 2.6  | Remove old `services/ocr_provider.ts` (replaced by adapters)                                  | `pnpm typecheck`              |

#### Phase 3: Services → Infrastructure Migration

| Step | Action                                                                                              | Validation                       |
| ---- | --------------------------------------------------------------------------------------------------- | -------------------------------- |
| 3.1  | Move `ocr/mrz_parser.ts` (consolidated) → `infra/ocr/mrz/mrz-parser.ts`                             | MRZ tests pass                   |
| 3.2  | Move `services/mrz_parser_service.ts` → merge into `infra/ocr/mrz/`                                 | MRZ tests pass                   |
| 3.3  | Remove dead `services/mrz_parser.ts` (942 lines, no imports)                                        | `pnpm typecheck`, dead-code scan |
| 3.4  | Move `services/field_validator.ts` (consolidated) → `infra/ocr/mrz/`                                | Validator tests pass             |
| 3.5  | Remove dead `ocr/field_validator.ts`                                                                | `pnpm typecheck`                 |
| 3.6  | Consolidate `ocr_confidence_service.ts` + `confidence-scoring-service.ts` → `infra/ocr/confidence/` | Confidence tests pass            |
| 3.7  | Remove `ocr/confidence_scoring.ts` (redundant)                                                      | `pnpm typecheck`                 |
| 3.8  | Move `ocr_pipeline_service.ts` → `infra/ocr/pipeline/ocr-pipeline.ts`                               | Pipeline tests pass              |
| 3.9  | Move image processing services → `infra/ocr/quality/`, `preprocessing/`                             | Image tests pass                 |

#### Phase 4: Audit & Logging Consolidation

| Step | Action                                                                             | Validation         |
| ---- | ---------------------------------------------------------------------------------- | ------------------ |
| 4.1  | Merge `audit_logger.ts` + `audit-log-service.ts` → `infra/logging/audit-logger.ts` | Audit tests pass   |
| 4.2  | Remove `loggingService.ts` (redundant with `lib/logging.ts`)                       | `pnpm typecheck`   |
| 4.3  | Create `infra/logging/sensitive-masker.ts` using canonical `masking.ts`            | Masking tests pass |
| 4.4  | Wire all loggers through `infra/logging/logger.ts`                                 | Log tests pass     |

#### Phase 5: UI & Component Cleanup

| Step | Action                                                                                                                                                                 | Validation                      |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 5.1  | Create `components/ocr/FieldEditor.tsx` — reusable field editing component                                                                                             | UI tests pass                   |
| 5.2  | Create `components/ocr/ConfidenceBadge.tsx`, `StatusBadge.tsx`                                                                                                         | UI tests pass                   |
| 5.3  | Refactor `ReviewScreen.tsx`, `ManualCorrectionScreen.tsx` to use shared `FieldEditor`                                                                                  | E2E review flow passes          |
| 5.4  | Create `config/field-definitions.ts` — single source of truth for field labels                                                                                         | All field references consistent |
| 5.5  | Remove duplicate field labels from `ReviewScreen.tsx`, `GuestForm.tsx`, `ExtractedResultReviewScreen.tsx`, `ManualCorrectionScreen.tsx`, `FinalConfirmationScreen.tsx` | `pnpm typecheck`                |
| 5.6  | Extract inline SVGs into `components/icons/IconSet.tsx`                                                                                                                | Visual regression check         |
| 5.7  | Add `ErrorBoundary` to route tree in `App.tsx`                                                                                                                         | Error state tests pass          |

#### Phase 6: Store & State Consolidation

| Step | Action                                                                      | Validation                      |
| ---- | --------------------------------------------------------------------------- | ------------------------------- |
| 6.1  | Refactor `ocrStore.ts` — Zustand with selectors, no global mutable state    | Store tests pass                |
| 6.2  | Refactor `fillStore.ts` — Zustand with IndexedDB persistence                | Fill store tests pass           |
| 6.3  | Refactor `settingsStore.ts` — Zustand with IndexedDB persistence middleware | Settings persistence tests pass |
| 6.4  | Ensure consistent action/selector pattern across all stores                 | `pnpm test`                     |

#### Phase 7: Large Component Splitting

| Step | Action                                                                     | Validation            |
| ---- | -------------------------------------------------------------------------- | --------------------- |
| 7.1  | Split `FillAssistantScreen.tsx` (801 lines): extract hooks, sub-components | Fill flow tests pass  |
| 7.2  | Split `SettingsPage.tsx` (494 lines): one component per setting section    | Settings tests pass   |
| 7.3  | Split `SetupWizard.tsx` (463 lines): one component per wizard step         | Setup flow tests pass |
| 7.4  | Split `GuestForm.tsx` (357 lines): extract field groups, use `FieldEditor` | Form tests pass       |

#### Phase 8: Rust Backend Hardening

| Step | Action                                                                | Validation             |
| ---- | --------------------------------------------------------------------- | ---------------------- |
| 8.1  | Replace `code: String` with `AppErrorCode` enum in `error.rs`         | Rust `cargo clippy`    |
| 8.2  | Implement settings persistence (IndexedDB in Rust or file-based)      | Rust tests pass        |
| 8.3  | Remove placeholder/stub commands (`run_ocr_placeholder`, Excel stubs) | `cargo build`          |
| 8.4  | Add clipboard auto-clear timer in Rust                                | Clipboard tests pass   |
| 8.5  | Replace blocking dialog with async dialog API                         | File dialog tests pass |
| 8.6  | Add OCR job queuing to prevent concurrent subprocess launch           | `cargo test`           |

#### Phase 9: Python Worker Refinement

| Step | Action                                                               | Validation            |
| ---- | -------------------------------------------------------------------- | --------------------- |
| 9.1  | Refactor OCR engine selection to strategy pattern                    | Python OCR tests pass |
| 9.2  | Fix TD1 composite check digit scoring in `ocr_selector.py`           | MRZ tests pass        |
| 9.3  | Fix `validate_full_mrz` to respect actual MRZ format                 | MRZ tests pass        |
| 9.4  | Replace bare `except Exception` with specific exception types        | Python lint passes    |
| 9.5  | Merge dual config systems (`config_loader.py` + `default_config.py`) | Config tests pass     |
| 9.6  | Fix passport visual OCR name filter (allow hyphens, apostrophes)     | Visual OCR tests pass |

#### Phase 10: Security & Privacy

| Step | Action                                                                      | Validation                |
| ---- | --------------------------------------------------------------------------- | ------------------------- |
| 10.1 | Unify TypeScript + Python sensitive key lists (single JSON source of truth) | Cross-language test       |
| 10.2 | Add recursive masking to Python `safe_logging.py`                           | Python masking tests pass |
| 10.3 | Add email/phone/address regex patterns to Python `privacy_guard.py`         | Privacy tests pass        |
| 10.4 | Fix `maskFullName` to mask both given and surname                           | Masking tests pass        |
| 10.5 | Add `maskDateOfBirth`, `maskPhoneNumber`, `maskEmail` to shared masking     | Masking tests pass        |
| 10.6 | Fix `parseDate` / `isValidDate` to reject invalid dates like `2021-02-30`   | Date tests pass           |
| 10.7 | Implement clipboard auto-clear enforcement (end-to-end)                     | Security tests pass       |

#### Phase 11: Testing Gap Closure

| Step | Action                                                                       | Validation           |
| ---- | ---------------------------------------------------------------------------- | -------------------- |
| 11.1 | Add UI component tests for `FieldEditor`, `ConfidenceBadge`, `ErrorBoundary` | Component tests pass |
| 11.2 | Add Rust backend tests for all Tauri commands                                | `cargo test`         |
| 11.3 | Add contract tests for `MockOcrAdapter` matching `OcrProvider` interface     | Contract tests pass  |
| 11.4 | Add cross-language type drift detection tests                                | `pnpm test`          |
| 11.5 | Fix `image-quality.test.ts` to import thresholds from source                 | Test passes          |
| 11.6 | Add browser extension test coverage                                          | Extension tests pass |

### 15.3 Verification Gates

Every phase must pass:

1. `pnpm typecheck` — No TypeScript errors
2. `pnpm lint` — ESLint passes (no new warnings)
3. `pnpm test` — All existing tests pass + new tests pass
4. `pnpm quality` — Full quality gate (format, lint, typecheck, test)
5. `cargo clippy -D warnings` — Rust linter (if Rust changes)
6. `ruff check .` — Python linter (if Python changes)
7. `mypy .` — Python type checker (if Python changes)

### 15.4 Rollback Strategy

Each phase is implemented as a focused PR/branch with:

- All tests passing before the change
- One logical change per commit
- Feature flags for behavior changes (where practical)
- Clear commit messages following conventional commits

If a phase introduces regressions:

1. Revert the specific commit (not the whole phase)
2. Fix the issue in a new commit
3. Re-verify with full test suite

---

## Appendix A: Relationship to Existing Documents

| Document                      | Relationship                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ARCHITECTURE.md`             | Replaced by this document for forward-looking architecture. ARCHITECTURE.md serves as historical reference.              |
| `CODE_QUALITY.md`             | Superseded: naming conventions, lint rules, commit rules are merged into this document and refined.                      |
| `refactor-analysis-report.md` | Source analysis driving this design. All issues identified in the report are addressed by the architecture defined here. |
| `TECH_STACK.md`               | Still valid. This architecture does not change the technology stack.                                                     |

## Appendix B: Architecture Decision Records

| ADR     | Decision                                             | Rationale                                                                                                                         |
| ------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ADR-001 | Zustand over Redux/Jotai/Context                     | Simple API, no boilerplate, built-in selectors, easy to test. Stores are lightweight and colocated with features.                 |
| ADR-002 | `Result` monad over exceptions for all service calls | Forces callers to handle errors explicitly. Prevents unhandled exceptions. Enables composable error handling.                     |
| ADR-003 | Interface in `shared/`, implementations in `infra/`  | Clean dependency inversion. Business logic never imports infrastructure. Provider adapters are swappable.                         |
| ADR-004 | Singleton IndexedDB connection                       | Prevents connection pool exhaustion. Simplifies transaction management.                                                           |
| ADR-005 | Single canonical `AppError` class across all layers  | Consistent error handling. Serializable across IPC boundary. Typed error codes for frontend matching.                             |
| ADR-006 | Python worker uses JSON IPC (unchanged)              | Well-established, simple, debuggable. Changing to gRPC/protobuf adds complexity without measurable benefit for local desktop use. |
| ADR-007 | `kebab-case` for TypeScript filenames                | Matches existing convention. Avoids case-sensitivity issues across platforms.                                                     |
| ADR-008 | Branded types for IDs and sensitive data             | Prevents accidental type mixing at compile time. Adds minimal runtime overhead (phantom type).                                    |
