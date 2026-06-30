# Tech Stack

## Desktop: Tauri + React + TypeScript + Vite + Tailwind CSS

- **Tauri v1:** Lightweight, secure desktop shell. Smaller bundle than Electron. Rust backend for safe file system, clipboard, and process management.
- **React 18 + TypeScript:** Industry standard for UI. TypeScript strict mode ensures type safety across the codebase.
- **Vite:** Fast dev server and build tool. Native ESM support.
- **Tailwind CSS:** Utility-first CSS for rapid, consistent UI development.

## OCR Worker: Python

- **Python 3.10+:** Rich ecosystem for computer vision and OCR (PaddleOCR, OpenCV, Tesseract).
- **PaddleOCR (primary):** Deep learning-based OCR engine with 17 language packs and MRZ-specific character dictionary.
- **Tesseract (fallback):** Traditional OCR engine with 100+ language packs via system install.
- **OpenCV:** Image preprocessing (CLAHE, denoise, deskew, glare removal).
- **openpyxl:** Excel file creation and manipulation (Guests, Errors, Instructions, Diagnostics sheets).
- **PyInstaller:** Packaging the Python worker as a standalone executable for distribution (`workers/ocr/scripts/build-ocr-worker.py`).

## TypeScript Services Layer

- **15 service modules** in `apps/desktop/src/services/` — mirror and extend Python OCR capabilities for real-time MRZ detection, image preprocessing, field normalization, confidence scoring, and staff review workflows.
- **3 OCR engine wrappers** in `apps/desktop/src/ocr/` — TypeScript wrappers for PaddleOCR, Tesseract, and a mock engine for testing.

## Local Storage

- **IndexedDB** via Tauri/browser (not SQLite): 5 object stores for import sessions, guest rows, target templates, fill events, and settings. Managed by `apps/desktop/src/lib/db.ts`.
- **File-based IPC:** Desktop app and OCR worker communicate via JSON request/response/progress files.

## Quality Tooling

- **TypeScript:** ESLint 10 with `typescript-eslint` + Prettier for formatting
- **Python:** Ruff for linting + mypy for type checking
- **Rust:** `cargo fmt` + `cargo clippy -D warnings`
- **Git hooks:** Lefthook (pre-commit: format+lint+typecheck+secret scan; pre-push: full verify)
- **Commit convention:** Conventional Commits with commitlint validation
- **Testing:** Vitest (TypeScript, 43 test files) + Pytest (Python, 28 test files)

## Browser Extension

- **Chrome/Edge Manifest V3** with content script + background service worker
- Minimal permissions (activeTab, storage, scripting, sidePanel)
- Localhost bridge to desktop app on `127.0.0.1:43175`

## Package Management

- **pnpm workspace:** Monorepo management across apps/desktop, apps/browser-extension, packages/shared, workers/ocr, workers/desktop_agent
