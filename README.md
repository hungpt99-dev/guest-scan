# GuestFill

GuestFill is a local-first desktop application for hotels. It converts scanned passport/ID documents into reviewed Excel data, then fills guest information into hotel property management systems.

The workflow:

1. **OCR** — Scan passport/ID images and PDFs via a Python OCR worker
2. **Review** — Review and correct extracted data in the desktop UI
3. **Export** — Produce a reviewed Excel file
4. **Auto-fill** — Use the reviewed Excel to automatically fill hotel system forms

## Tech Stack

- **Desktop:** Tauri + React + TypeScript + Vite + Tailwind CSS
- **OCR Worker:** Python (OpenCV, Tesseract)
- **Browser Extension:** Chrome/Edge extension (early stage)
- **Quality:** ESLint, Prettier, commitlint, lefthook, ruff, mypy, pytest

## Repository Structure

```
guestfill/
  apps/
    desktop/            Tauri desktop application
    browser-extension/  Chrome/Edge browser extension (placeholder)
  workers/
    ocr/                Python OCR worker
    desktop_agent/      Python desktop automation agent (placeholder)
  packages/
    shared/             Shared TypeScript types, constants, utilities
  docs/                 Documentation
  scripts/              Development and CI scripts
```

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- Rust toolchain (for Tauri)
- Python 3.10+ (for OCR worker)

### Setup

```bash
pnpm install          # Install all dependencies
pnpm check-env        # Verify required tools
pnpm verify-workspace # Verify project structure
```

### Development

```bash
pnpm dev:desktop      # Start the Tauri desktop app
pnpm dev:ocr          # Test OCR worker CLI
```

### Quality

```bash
pnpm format           # Format all source files
pnpm lint             # Run all linters
pnpm typecheck        # Run all type checks
pnpm test             # Run all tests
pnpm quality          # Format check + lint + typecheck
pnpm verify           # Full quality check + tests
pnpm secrets:scan     # Scan for secrets and .env files
```

## Current Status

Early development — monorepo scaffold in place with placeholder screens and commands. OCR and Auto-fill implementation in progress.
