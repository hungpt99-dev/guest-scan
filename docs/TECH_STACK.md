# Tech Stack

## Desktop: Tauri + React + TypeScript + Vite + Tailwind CSS

- **Tauri:** Lightweight, secure desktop shell. Smaller bundle than Electron. Rust backend for safe file system and clipboard access.
- **React + TypeScript:** Industry standard for UI. TypeScript ensures type safety across the codebase.
- **Vite:** Fast dev server and build tool. Native ESM support.
- **Tailwind CSS:** Utility-first CSS for rapid, consistent UI development.

## OCR Worker: Python

- **Python:** Rich ecosystem for computer vision and OCR (OpenCV, Tesseract).
- **openpyxl:** Excel file creation and manipulation.
- **PyInstaller:** Packaging the Python worker as a standalone executable for distribution.

## Local Storage

- **settings.json:** Simple JSON file for application settings.
- **SQLite (planned):** Local database for guest records and history.

## Package Management

- **pnpm workspace:** Monorepo management for the desktop app and shared package.
