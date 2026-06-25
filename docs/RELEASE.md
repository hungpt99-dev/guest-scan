# Release Process

## Versioning

GuestFill follows [Semantic Versioning](https://semver.org/):

- **MAJOR** — incompatible API or data format changes
- **MINOR** — new features, backward compatible
- **PATCH** — bug fixes, no breaking changes

## Release Checklist

1. Update `CHANGELOG.md`
2. Bump version in:
   - `apps/desktop/package.json`
   - `apps/desktop/src-tauri/Cargo.toml`
   - `workers/ocr/pyproject.toml`
3. Build desktop app: `pnpm build:desktop`
4. Package OCR worker: `cd workers/ocr && python scripts/build-ocr-worker.py`
5. Test installer on clean Windows machine
6. Verify Excel export and import
7. Verify Copy Assistant
8. Verify fill log export
9. Run full quality check: `pnpm verify`
10. Tag release: `git tag v0.1.0 && git push --tags`
11. Create GitHub Release with installer and changelog

## Release Artifacts

- `GuestFill-Setup-v0.1.0.exe` — Windows installer (desktop + OCR + Tesseract)
- `guestfill-ocr-v0.1.0.zip` — standalone OCR worker (optional, for advanced users)

## Hotfix Process

1. Create branch from the release tag
2. Apply fix
3. Bump PATCH version
4. Build and test
5. Merge to main and tag
