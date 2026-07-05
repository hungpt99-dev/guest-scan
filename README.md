# GuestFill

A local-first desktop application for hotels that converts scanned passport/ID documents into reviewed Excel data and fills guest information into property management systems.

The workflow:

1. **OCR** — Scan passport/ID images and PDFs via a Python OCR worker (PaddleOCR primary, Tesseract fallback) with TypeScript OCR service layer
2. **Review** — Review and correct extracted data in the desktop UI
3. **Export** — Produce a reviewed Excel file with guest data, errors, instructions, and diagnostics sheets
4. **Auto-fill** — Use the reviewed Excel to fill hotel system forms with accuracy-aware copy, confidence checks, and keyboard-driven navigation

## Tech Stack

| Layer                    | Technology                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Desktop**              | Tauri v1 + React 18 + TypeScript + Vite + Tailwind CSS                                                                                                           |
| **OCR Worker**           | Python 3.10+ (PaddleOCR primary, Tesseract fallback, OpenCV preprocessing)                                                                                       |
| **OCR Engines (TS)**     | TypeScript wrappers for PaddleOCR, Tesseract, and mock engine                                                                                                    |
| **OCR Services (TS)**    | 15 service modules: pipeline orchestration, MRZ detection/parsing/validation, image preprocessing/quality, field normalization, confidence scoring, staff review |
| **Local Storage**        | IndexedDB via Tauri/browser (settings, sessions, guest rows, templates, fill events)                                                                             |
| **Browser Extension**    | Chrome/Edge Manifest V3 with content script + background worker                                                                                                  |
| **Quality**              | ESLint 10 + typescript-eslint, Prettier, Lefthook, Commitlint, Ruff, mypy, Pytest, Vitest                                                                        |
| **Test Runner (TS)**     | Vitest with jsdom environment                                                                                                                                    |
| **Test Runner (Python)** | Pytest with unit, integration, and E2E test directories                                                                                                          |
| **Package Management**   | pnpm workspaces                                                                                                                                                  |

## Repository Structure

```
guest-scan/
  apps/
    desktop/                Tauri desktop application
      src/
        api/                OCR API bridge layer
        components/         Shared layout and common components
        features/           Feature modules (fill, excel, ocr, settings, diagnostics)
        lib/                Core utilities (Result type, file utils, date utils, DB, logging)
        ocr/                OCR engine wrappers (PaddleOCR, Tesseract, mock)
        screens/            Top-level screens (Home, OCR, ImportExcel, FillAssistant, etc.)
        services/           15 OCR pipeline services (detection, parsing, validation, scoring)
        ui/                 UI-focused screens (camera capture, review, correction, confirmation)
        styles/             Global CSS
      src-tauri/
        src/
          commands/         Rust command modules (file, clipboard, Excel, OCR, settings)
          app_state.rs      Tauri application state
          error.rs          Rust error types
          main.rs           Tauri entry point
    browser-extension/      Chrome/Edge extension (Manifest V3)
      src/
        background.ts       Background service worker
        content-script.ts   Page content script
        manifest.json       Extension manifest
        message-types.ts    Shared message types
  workers/
    ocr/                    Python OCR worker
      guestfill_ocr/
        cli/                CLI argument parsing and I/O
        config/             Configuration defaults
        common/             Shared utilities (errors, Result type, logging)
        main.py             OCR processing entry point
      tests/
        unit/               Unit tests (21 files: MRZ, PaddleOCR, script detection, etc.)
        e2e/                End-to-end integration tests
    desktop_agent/          Python desktop automation agent (scaffolding)
  packages/
    shared/                 Shared TypeScript types, constants, utilities
  docs/                     Project documentation
  scripts/                  Development and CI scripts
  tests/
    e2e/                    Cross-app E2E integration tests
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- Rust toolchain (for Tauri builds)
- Python 3.10+ (for OCR worker development)

### Setup

```bash
pnpm install          # Install all dependencies
pnpm check-env        # Verify required tools and versions
pnpm verify-workspace # Verify project structure integrity
```

### Development

```bash
pnpm dev:desktop      # Start the Tauri desktop app (Vite dev server)
pnpm dev:ocr          # Run OCR worker CLI (--help)
```

### Quality

```bash
pnpm format           # Format all source files (Prettier + Ruff)
pnpm lint             # Run all linters (ESLint + Ruff)
pnpm typecheck        # Run all type checks (TypeScript + mypy)
pnpm test             # Run all tests (Vitest + Pytest)
pnpm quality          # Format check + lint + typecheck
pnpm verify           # Full quality check + tests
pnpm secrets:scan     # Scan repository for secrets and .env files
```

## Architecture Overview

GuestFill operates a **dual OCR pipeline** architecture:

1. **Python OCR Worker** (`workers/ocr/`) — Spawned as a subprocess from the Tauri app, handles bulk document processing with PaddleOCR (primary) and Tesseract (fallback). Includes MRZ parsing, script detection, transliteration, confidence scoring, and Excel export.

2. **TypeScript OCR Services** (`apps/desktop/src/services/`) — 15 service modules running in the Tauri renderer, mirror and extend Python capabilities for real-time MRZ detection, image preprocessing, field normalization, confidence scoring, and staff review workflows.

The **auto-fill system** uses a transform engine, safety engine with per-field accuracy scoring, and a copy assistant with keyboard-driven navigation to help hotel staff fill property management system forms efficiently.

## OCR Feature

### Provider Selection

Guest Fill offers two OCR providers for passport/ID document extraction:

| Provider      | Type                                       | When to Use                                              |
| ------------- | ------------------------------------------ | -------------------------------------------------------- |
| **Local OCR** | Free, offline (Tesseract.js + MRZ parsing) | Demo, testing, offline mode, privacy-sensitive scenarios |
| **Azure OCR** | Production (Azure Document Intelligence)   | Real passport/ID processing requiring high accuracy      |

### Usage Flow

1. Open the Guest Fill form
2. Select OCR provider (Local or Azure) from the provider selector
3. Upload or capture a passport/ID document image
4. The app extracts guest information using the selected provider
5. Review extracted data — low-confidence fields are highlighted
6. Edit any incorrect fields manually
7. Confirm and apply data to the guest form

### Configuration

**Local OCR:** No configuration needed. Runs entirely in-browser using Tesseract.js.

**Azure OCR:** Requires Azure Document Intelligence credentials configured on the backend (Tauri/Rust). API keys are never exposed to the frontend. Configure via environment variables on the server:

- `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` — Azure endpoint URL
- `AZURE_DOCUMENT_INTELLIGENCE_API_KEY` — API key (stored in backend only)

See [OCR Feature Design](docs/ocr-feature-design.md) and [OCR Privacy](docs/ocr-privacy.md) for details.

### Privacy & Security

- **Images are not stored persistently.** Temporary files are cleaned immediately after processing.
- **Azure OCR requires explicit opt-in.** Local OCR is the default — no data leaves the device.
- **API keys never reach the frontend.** Azure credentials live in the Rust backend only.
- **Sensitive data is masked in logs.** Passport numbers, full names, and DOB are redacted before logging.
- **Users can clear all extracted data** at any time via the UI.
- **Users must review and confirm** extracted data before it is saved.

## Current Status

Active development with **test suites** across 43 TypeScript test files and 28 Python test files:

- **TypeScript (43 test files):** Vitest unit + integration + E2E tests covering OCR pipeline services, safety engine with accuracy scoring (73 tests), transform engine, copy assistant, fill store/workflow, Excel import/validation, template manager, settings persistence, diagnostics, browser extension messaging, and full import-to-fill E2E pipeline (30 tests)
- **Python (28 test files):** Pytest unit + integration + E2E tests covering MRZ parsing and validation, PaddleOCR engine, script detection, transliteration, confidence scoring, field normalization, Excel export with all sheets, and full end-to-end OCR-to-Excel pipeline

## Documentation

Key docs available in the `docs/` directory:

- [Architecture](docs/ARCHITECTURE.md) — System architecture and component interaction
- [User Guide](docs/USER_GUIDE.md) — End-user workflow instructions
- [Installation](docs/INSTALLATION.md) — Platform-specific installation
- [Security](docs/SECURITY.md) — Security model and privacy considerations
- [OCR Feature Design](docs/ocr-feature-design.md) — OCR architecture and provider abstraction
- [OCR Privacy](docs/ocr-privacy.md) — OCR data handling, logging, and API key security
- [Development](docs/DEVELOPMENT.md) — Development setup and conventions
- [Tech Stack](docs/TECH_STACK.md) — Detailed technology overview
- [Code Quality](docs/CODE_QUALITY.md) — Quality tooling and standards
- [Changelog](docs/CHANGELOG.md) — Version history and release notes
