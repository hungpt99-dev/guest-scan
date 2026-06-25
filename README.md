# GuestFill

GuestFill is a local-first desktop application for hotels. It helps convert passport/ID documents into reviewed Excel data, then fills guest information into hotel systems.

## Tech Stack

- **Desktop:** Tauri + React + TypeScript + Vite + Tailwind CSS
- **OCR Worker:** Python (OpenCV, Tesseract, openpyxl planned)
- **Local Storage:** SQLite (planned), settings.json

## Repository Structure

```
guestfill/
  apps/desktop/       Tauri desktop application
  workers/ocr/        Python OCR worker
  packages/shared/    Shared TypeScript types, constants, utilities
  docs/               Documentation
  scripts/            Development scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Rust toolchain (for Tauri)
- Python 3.10+ (for OCR worker)

### Install Dependencies

```bash
pnpm install
```

### Run Desktop App

```bash
pnpm dev:desktop
```

### Run OCR Worker

```bash
pnpm dev:ocr
```

### Run Tests

```bash
pnpm test
```

## Current Status

Source code foundation setup. Placeholder screens and commands only. No real OCR or Auto-fill implemented yet.
