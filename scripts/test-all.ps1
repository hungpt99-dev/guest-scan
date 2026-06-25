# Run all tests
Write-Host "Running all tests..." -ForegroundColor Green
pnpm --recursive test
Write-Host "`nNote: Python OCR worker tests must be run separately via 'pytest workers/ocr/tests'" -ForegroundColor Yellow
