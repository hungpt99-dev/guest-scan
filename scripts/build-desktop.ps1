# Build the desktop app for production
Write-Host "Building GuestFill desktop app..." -ForegroundColor Green
pnpm --filter @guestfill/desktop build
