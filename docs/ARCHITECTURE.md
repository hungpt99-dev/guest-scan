# Architecture

## Overview

GuestFill uses a two-module architecture connected by a shared Excel review workflow.

```
┌─────────────────────────────────────────────────────┐
│                 Tauri Desktop App                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ OCR       │  │ Excel    │  │ Auto-fill         │  │
│  │ Screen    │  │ Review   │  │ Assistant Screen  │  │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘  │
│       │              │                 │              │
│  ┌────▼──────────────▼─────────────────▼──────────┐  │
│  │           Tauri Rust Commands                   │  │
│  │  file_commands │ ocr_commands │ excel_commands │  │
│  │  clipboard_commands │ settings_commands        │  │
│  └───────────────────────┬────────────────────────┘  │
│                          │                           │
└──────────────────────────┼───────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────┐
│              Python OCR Worker                        │
│  Reads request JSON → Processes files → Writes       │
│  response JSON and progress updates                   │
└──────────────────────────────────────────────────────┘
```

## Modules

### Desktop App (Tauri + React)

- UI screens for OCR, Excel review, and Auto-fill
- Rust commands for file system access, clipboard, and process management
- Settings persisted to IndexedDB (Tauri and browser fallback)
- Accuracy-aware safety engine and Copy Assistant for data validation before fill
- Fill constants module (`fillConstants.ts`) with centralized field definitions, keyboard shortcuts, and error codes

### OCR Worker (Python)

- Separate process spawned by the desktop app
- Reads image/PDF files
- Extracts guest information
- Outputs structured JSON results
- Reports progress via JSON updates

### Shared Package (TypeScript)

- Types and constants shared across the desktop app
- Used by both OCR and Auto-fill features

## Data Flow

1. User selects files in the OCR screen
2. Desktop app spawns the Python OCR worker with a request JSON
3. OCR worker processes files and writes results to a response JSON
4. Desktop app reads the response and presents results for review
5. User exports a reviewed Excel file
6. Auto-fill imports the reviewed Excel and assists with filling hotel systems

## Design Principles

- **Local-first:** All processing runs on the user's machine
- **File-based IPC:** Desktop app and OCR worker communicate via JSON files
- **Review gate:** OCR output is always reviewed before export
- **Separation of concerns:** OCR and Auto-fill are independent modules
