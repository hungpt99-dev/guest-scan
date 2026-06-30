# Release Process

## Versioning

GuestFill follows [Semantic Versioning](https://semver.org/):

- **MAJOR** — incompatible API or data format changes
- **MINOR** — new features, backward compatible
- **PATCH** — bug fixes, no breaking changes

## Release Checklist

1. Review and update `CHANGELOG.md`
2. Bump version in:
   - `apps/desktop/package.json`
   - `apps/desktop/src-tauri/Cargo.toml`
   - `workers/ocr/pyproject.toml`
   - `packages/shared/package.json`
3. Build desktop app: `pnpm build:desktop`
4. Package OCR worker: `cd workers/ocr && python scripts/build-ocr-worker.py`
5. Generate Tauri updater signature: `pnpm tauri sign -g -f path/to/update.json`
6. Build platform-specific installers:
   - Windows: `pnpm build:desktop -- --bundler msi` (or `nsis`)
   - macOS: `pnpm build:desktop -- --bundler dmg`
   - Linux: `pnpm build:desktop -- --bundler appimage`
7. Test installer on clean machines (Windows, macOS, Linux)
8. Verify Excel export and import
9. Verify Copy Assistant and accuracy features
10. Verify fill log export
11. Run full quality check: `pnpm verify`
12. Tag release: `git tag v0.X.0 && git push --tags`
13. Create GitHub Release with all artifacts and changelog

## Release Artifacts

### Windows

- `GuestFill-Setup-v0.X.0.exe` or `.msi` — Windows installer (desktop + OCR + Tesseract + PaddleOCR models)
- `guestfill-ocr-v0.X.0-windows.zip` — standalone OCR worker (optional)

### macOS

- `GuestFill-v0.X.0.dmg` — macOS disk image (Intel + Apple Silicon universal binary)
- `guestfill-ocr-v0.X.0-macos.zip` — standalone OCR worker (optional)

### Linux

- `GuestFill-v0.X.0.AppImage` — Linux AppImage
- `guestfill-ocr-v0.X.0-linux.zip` — standalone OCR worker (optional)

## Hotfix Process

1. Create branch from the release tag
2. Apply fix
3. Bump PATCH version in all version files
4. Build and test all platforms
5. Merge to main and tag
