# Run full quality checks
Write-Host "Running full quality checks..." -ForegroundColor Green

Write-Host "`n[1/4] Format Check" -ForegroundColor Cyan
pnpm format:check
if ($?) { Write-Host "Format check passed" -ForegroundColor Green } else { exit 1 }

Write-Host "`n[2/4] Lint" -ForegroundColor Cyan
pnpm lint
if ($?) { Write-Host "Lint passed" -ForegroundColor Green } else { exit 1 }

Write-Host "`n[3/4] Type Check" -ForegroundColor Cyan
pnpm typecheck
if ($?) { Write-Host "Type check passed" -ForegroundColor Green } else { exit 1 }

Write-Host "`n[4/4] Secret Scan" -ForegroundColor Cyan
pnpm secrets:scan
if ($?) { Write-Host "Secret scan passed" -ForegroundColor Green } else { exit 1 }

Write-Host "`nAll quality checks passed!" -ForegroundColor Green
