# Architecture

## Overview

GuestFill uses a **dual OCR pipeline** architecture: a Python OCR worker (spawned as a subprocess for bulk processing) and TypeScript OCR services (running in the Tauri renderer for real-time operations), connected by a shared Excel review and auto-fill workflow.

```
┌──────────────────────────────────────────────────────────────────┐
│                     Tauri Desktop App                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐      │
│  │ OCR Screen  │  │ Excel      │  │ Fill Assistant Screen  │      │
│  │ (ui/ocr/)   │  │ Review UI  │  │ (FillAssistantScreen)  │      │
│  └──────┬──────┘  └─────┬──────┘  └───────────┬────────────┘      │
│         │               │                     │                   │
│  ┌──────▼───────────────▼─────────────────────▼────────────────┐  │
│  │              TypeScript Services Layer                        │  │
│  │  src/services/ (15 modules)                                  │  │
│  │  src/ocr/ (OCR engine wrappers: PaddleOCR, Tesseract, mock)  │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                             │                                     │
│  ┌──────────────────────────▼──────────────────────────────────┐  │
│  │              Tauri Rust Commands                             │  │
│  │  file_commands │ ocr_commands │ excel_commands              │  │
│  │  clipboard_commands │ settings_commands                    │  │
│  └───────────────────────┬─────────────────────────────────────┘  │
│                          │                                        │
│  ┌───────────────────────▼─────────────────────────────────────┐  │
│  │              IndexedDB Local Storage                         │  │
│  │  import_sessions │ guest_rows │ target_templates             │  │
│  │  fill_events │ settings                                      │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │  JSON IPC (request / response / progress)
┌────────────────────────────▼─────────────────────────────────────┐
│                    Python OCR Worker                               │
│  Reads request JSON → Processes files → Writes                    │
│  response JSON and progress updates                                │
│  Engines: PaddleOCR (primary, 17 langs) + Tesseract (fallback)    │
└──────────────────────────────────────────────────────────────────┘
```

## Modules

### Desktop App (Tauri + React)

- **UI screens:** Home, OCR processing (`apps/desktop/src/ui/ocr/`), Excel import/review, Fill Assistant (`apps/desktop/src/screens/FillAssistantScreen.tsx`), Settings, Diagnostics, Templates
- **TypeScript services** (`apps/desktop/src/services/` — 15 modules): OCR pipeline services mirroring and extending Python capabilities — MRZ detection, image preprocessing, field normalization, confidence scoring, staff review workflows
- **OCR engine wrappers** (`apps/desktop/src/ocr/`): TypeScript wrappers for PaddleOCR, Tesseract, and mock engine for testing
- **Feature modules** (`apps/desktop/src/features/`): `fill/` (safety engine, copy assistant, transform engine, template manager), `excel/` (import, validation), `ocr/` (job lifecycle), `settings/` (persistence), `diagnostics/`
- **Rust commands** (`apps/desktop/src-tauri/src/commands/`): file, clipboard, Excel, OCR process management, settings
- **Local storage:** IndexedDB with 5 object stores (`import_sessions`, `guest_rows`, `target_templates`, `fill_events`, `settings`)

### Python OCR Worker

- Separate process spawned by the desktop app for bulk document processing
- **Primary engine:** PaddleOCR with 17 language packs, MRZ-specific character dictionary
- **Fallback engine:** Tesseract with 100+ language pack support
- **Pipeline:** Image loading → quality analysis → document classification → MRZ candidate generation → engine selection → OCR → MRZ parsing → check digit validation → field extraction → confidence scoring → Excel export
- **Output:** Structured JSON results with progress updates, plus formatted Excel export (4 sheets: Guests, Errors, Instructions, Diagnostics)

### TypeScript Services (Dual Pipeline Complement)

- 15 service modules sharing responsibilities with the Python worker
- Handle real-time OCR operations, staff review workflows, and accuracy-aware auto-fill validation
- Key services: MRZ detection/parsing/validation, image preprocessing/quality analysis, field normalization, confidence scoring, safety engine, audit trails

### Shared Package (TypeScript)

- `packages/shared/src/`: Types, constants, and utilities shared across the desktop app and browser extension
- Includes `GuestRow`, transform rule types, document constants, shared validation logic

### Browser Extension

- Chrome/Edge Manifest V3 with content script + background service worker
- Connects to desktop app via localhost bridge (`127.0.0.1:43175`)
- Field detection with selector generation for web-based hotel PMS

## Data Flow

1. User selects files in the OCR screen
2. Desktop app spawns the Python OCR worker with a request JSON
3. OCR worker processes files (PaddleOCR primary, Tesseract fallback) and writes results to a response JSON
4. Desktop app reads the response and presents results for review
5. User exports a reviewed Excel file
6. Auto-fill imports the reviewed Excel, validates with safety engine, and assists with filling hotel systems via Copy Assistant
7. Fill events are logged locally to IndexedDB

## Design Principles

- **Local-first:** All processing runs on the user's machine. No cloud dependencies.
- **Dual pipeline:** Python worker for bulk processing, TypeScript services for real-time operations — both capable of OCR independently
- **File-based IPC:** Desktop app and OCR worker communicate via JSON files
- **Review gate:** OCR output is always reviewed before export. Auto-fill is manual-save by default.
- **Accuracy-aware:** Every field carries confidence/accuracy metadata to guide review and copy decisions
- **Separation of concerns:** OCR, Excel, and Auto-fill are independent feature modules
