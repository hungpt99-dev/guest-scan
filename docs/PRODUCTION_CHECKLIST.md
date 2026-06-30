# Production Release Checklist

## Build Verification

- [ ] Desktop app production build works (`pnpm build:desktop`)
- [ ] OCR worker packaged (`python scripts/build-ocr-worker.py`)
- [ ] PaddleOCR models bundled with OCR worker
- [ ] Tesseract bundled with OCR worker
- [ ] Tessdata bundled with OCR worker
- [ ] Default config files bundled
- [ ] Windows `.exe` installer builds (`pnpm build:desktop -- --bundler msi`)
- [ ] macOS `.dmg` builds (`pnpm build:desktop -- --bundler dmg`)
- [ ] Linux `.AppImage` builds (`pnpm build:desktop -- --bundler appimage`)
- [ ] Tauri updater configured and signature generated

## OCR Verification

- [ ] JPG image input tested
- [ ] PNG image input tested
- [ ] WEBP image input tested
- [ ] PDF input tested
- [ ] Batch folder input tested
- [ ] Passport MRZ extraction tested
- [ ] MRZ check digit validation tested
- [ ] MRZ safe repair tested
- [ ] Excel export generates Guests sheet
- [ ] Excel export generates Errors sheet
- [ ] Excel export generates Instructions sheet
- [ ] Excel export generates Diagnostics sheet
- [ ] Every row has status, confidence_score, confidence_level, ocr_warning, source_file
- [ ] One failed file does not fail the batch
- [ ] Response JSON always written
- [ ] Progress JSON written when configured
- [ ] Temporary files cleaned up

## Auto-fill Verification

- [ ] Reviewed Excel import works
- [ ] Required columns validated
- [ ] Guest list displays with search/filter/sort
- [ ] Copy Assistant copies fields to clipboard
- [ ] Keyboard navigation works
- [ ] Mark Filled works
- [ ] Mark Skipped works
- [ ] Fill log export works
- [ ] Templates can be created/edited/deleted
- [ ] Templates can be imported/exported as JSON
- [ ] Manual Save is default
- [ ] Auto Save disabled by default
- [ ] Auto Save safety checks work
- [ ] Accuracy-aware copy warnings display correctly
- [ ] Low confidence field copy is blocked with warning
- [ ] Field accuracy validation works for all field types
- [ ] Expired document detection works
- [ ] Nationality/issuing country consistency check works
- [ ] Strip and phone_format transforms work in templates

## Security Verification

- [ ] No sensitive data in logs
- [ ] Document numbers masked in logs
- [ ] Temporary files cleaned up
- [ ] Online fallback disabled by default
- [ ] No external API calls by default
- [ ] No hidden network requests
- [ ] .env file is in .gitignore
- [ ] .env.example is committed
- [ ] Test data does not contain real passport/ID info
- [ ] Code signing certificate applied (Windows: Authenticode, macOS: Developer ID)
- [ ] macOS notarization completed

## Installation Verification

- [ ] Clean Windows 10 install tested
- [ ] Clean Windows 11 install tested
- [ ] Non-admin user account tested (Windows)
- [ ] Path with spaces tested
- [ ] Path with Vietnamese characters tested
- [ ] macOS clean install tested (Intel + Apple Silicon)
- [ ] Linux clean install tested (Ubuntu + Fedora)
- [ ] PaddleOCR models download on first run (or bundled)

## Documentation Verification

- [ ] User guide complete
- [ ] Privacy policy complete
- [ ] Troubleshooting guide complete
- [ ] Support guide complete
- [ ] Installation guide complete
- [ ] Production checklist complete

## Quality Verification

- [ ] `pnpm format:check` passes
- [ ] `pnpm lint` passes (or warnings documented)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (or failures documented)
- [ ] `pnpm verify` passes (or failures documented)
