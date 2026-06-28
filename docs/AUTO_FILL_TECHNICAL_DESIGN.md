# Auto-fill Technical Design

> **Status: Implemented**

This document describes the Auto-fill module architecture, Excel import, Copy Assistant, safety mechanisms, template system, and automation foundations.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              GuestFill Desktop App                    │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Auto-fill Module                    │ │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────┐ │ │
│  │  │ Excel     │  │ Copy     │  │ Transform     │ │ │
│  │  │ Import    │  │ Assistant│  │ Engine        │ │ │
│  │  └────┬─────┘  └────┬─────┘  └───────┬───────┘ │ │
│  │       │              │                 │         │ │
│  │  ┌────▼──────────────▼─────────────────▼──────┐ │ │
│  │  │         Safety Engine                      │ │ │
│  │  └────────────────────┬──────────────────────┘ │ │
│  │                       │                         │ │
│  │  ┌────────────────────▼──────────────────────┐ │ │
│  │  │         Template Manager                  │ │ │
│  │  └────────────────────┬──────────────────────┘ │ │
│  └───────────────────────┼─────────────────────────┘ │
│                          │                           │
│  ┌───────────────────────▼─────────────────────────┐ │
│  │            IndexedDB Local Storage              │ │
│  │  import_sessions │ guest_rows │ target_templates│ │
│  │  fill_events │ settings                         │ │
│  └────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼──────────┐
│ Browser      │ │ Desktop     │ │ Localhost Bridge │
│ Extension    │ │ Agent       │ │ 127.0.0.1:43175 │
└──────────────┘ └─────────────┘ └─────────────────┘
```

## Workflow

1. User imports reviewed Excel → validates columns, normalizes data, creates session
2. Guest List displays all rows with search/filter/sort
3. User selects guest → Fill Assistant shows fields with Copy buttons
4. Copy Assistant copies field values to clipboard
5. Keyboard Assistant provides navigation shortcuts
6. Safety Engine validates before any automated fill
7. Manual Save is default; Auto Save is per-template configuration
8. Fill status tracked locally; events logged for export

## Core Modules

### Excel Import (`features/excel/excelImport.ts`)

- Reads .xlsx/.xls files via Tauri Rust command + xlsx library
- Validates required columns (fullName, dateOfBirth, gender, documentType)
- Normalizes headers, guest data, status, gender, document type
- Detects duplicate passport/ID numbers
- Creates import session and stores guest rows in IndexedDB

### Copy Assistant (`features/fill/copyAssistant.ts`)

- Copies individual field values to clipboard via Tauri clipboard API
- Returns field values by key
- Provides field navigation (next/prev)
- Provides guest navigation (next/prev)
- Logs copy events to fill_events store

### Transform Engine (`features/fill/transformEngine.ts`)

- Supports: trim, uppercase, lowercase, titlecase, date_format, gender_format, country_format, replace, prefix, suffix, custom_mapping
- Tested with 12+ transformation rule types

### Safety Engine (`features/fill/safetyEngine.ts`)

- Pre-fill checks: guest row exists, not FAILED, required fields exist
- Template match: URL pattern, window title, mapped fields exist
- Auto Save safety: template configured, selector exists, required values present
- Runtime field value checks against required mapped fields

### Template Manager (`features/fill/templateManager.ts`)

- CRUD operations for target system templates
- JSON export/import for sharing templates
- Supports copy_assistant, web, and desktop types
- Per-template save mode (manual/auto)

### Database (`lib/db.ts`)

- IndexedDB with 5 object stores
- import_sessions: import history
- guest_rows: per-row data with indexes on session, status, fill status, name
- target_templates: fill configuration templates
- fill_events: event log with indexes
- settings: key-value settings store (includes fill settings as `fill_settings` key)

### Settings Persistence (`features/settings/settingsStore.ts`)

- Fill settings are persisted to IndexedDB under the `settings` store with key `fill_settings`
- Settings are loaded on mount and saved immediately on any change
- Default settings include: Excel folder, target system, date format, clipboard timeout, global shortcut toggles, bridge port

## Privacy & Security

- No cloud database or sync
- No guest data uploaded
- Manual Save is default; Auto Save is per-template opt-in
- Clipboard operations only on explicit user action
- Event logs mask document numbers by default
- Emergency stop shortcut available
- Auto Save requires safety checks to pass

## Future Components (Scaffolded)

### Browser Extension (`apps/browser-extension/`)

- Manifest V3 with minimal permissions (activeTab, storage, scripting, sidePanel)
- Content script: field detection with selector generation, React-compatible fill
- Background service worker: bridge to localhost API
- Side panel ready for template management UI

### Desktop Automation Agent (`workers/desktop_agent/`)

- Python CLI agent with `fill` command
- Interface prepared for pywinauto/pyautogui integration
- Request/response JSON contract matching template system

### Localhost Bridge

- Port: 43175 (configurable)
- Endpoints: /health, /guests, /guests/:id, /fill-events
- Security: bind to 127.0.0.1 only, requires X-GuestFill-Token header
- Endpoint interface prepared but implementation pending
