# Production Release Checklist

## Build Verification

- [ ] Desktop app production build works (`pnpm build:desktop`)
- [ ] OCR worker packaged (`python scripts/build-ocr-worker.py`)
- [ ] Tesseract bundled with OCR worker
- [ ] Tessdata bundled with OCR worker
- [ ] Default config files bundled

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

## Installation Verification

- [ ] Clean Windows 10 install tested
- [ ] Clean Windows 11 install tested
- [ ] Non-admin user account tested
- [ ] Path with spaces tested
- [ ] Path with Vietnamese characters tested

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
