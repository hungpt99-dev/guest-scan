# Installation Guide

## System Requirements

- **OS:** Windows 10/11 (64-bit), macOS 12+, or Linux (x86_64)
- **RAM:** 4 GB minimum, 8 GB recommended
- **Storage:** 500 MB free space (additional ~500 MB for PaddleOCR models)
- **Display:** 1280x720 minimum resolution

## Installing GuestFill

### Windows

#### Standard Installation

1. Download the latest `GuestFill-Setup-vX.X.X.exe` from the releases page.
2. Double-click the installer and follow the wizard.
3. Launch GuestFill from the Start Menu or Desktop shortcut.

#### Portable Version

1. Download the portable ZIP file from the releases page.
2. Extract to any folder (e.g., `C:\GuestFill`).
3. Run `GuestFill.exe` from the extracted folder.

### macOS

1. Download the latest `GuestFill-vX.X.X.dmg` from the releases page.
2. Open the DMG and drag GuestFill to the Applications folder.
3. Launch GuestFill from Applications (may require Gatekeeper approval on first run).

### Linux

1. Download the latest `.AppImage` from the releases page.
2. Make executable: `chmod +x GuestFill-vX.X.X.AppImage`
3. Run: `./GuestFill-vX.X.X.AppImage`

## After Installation

1. Launch GuestFill.
2. The Home screen shows two main options:
   - **Create Excel from Documents** — OCR workflow
   - **Import Excel to Fill Guest Info** — Auto-fill workflow

## Verifying Installation

1. Open GuestFill.
2. The app should show the Home screen.
3. Go to Settings and verify all sections load.

## Development Installation (from source)

```bash
# Prerequisites: Node.js 22+, pnpm 10+, Rust toolchain, Python 3.10+
pnpm install
pnpm check-env           # Verify required tools and versions
pnpm verify-workspace    # Verify project structure integrity
```

For OCR worker development, you may also need:

```bash
cd workers/ocr
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
# PaddleOCR models download automatically on first run
```

## Uninstalling

### Windows

1. Go to Windows Settings → Apps → GuestFill → Uninstall.
2. To remove all data, delete the `GuestFill` folder in `%APPDATA%`.

### macOS

1. Delete GuestFill from the Applications folder.
2. Remove data: `rm -rf ~/Library/Application\ Support/com.guestfill.app`

### Linux

1. Delete the AppImage file.
2. Remove data: `rm -rf ~/.local/share/com.guestfill.app`

## Troubleshooting Installation

### App does not start

- Check your OS meets minimum requirements
- Reinstall the app
- Check antivirus/firewall logs (may quarantine new software)
- macOS: Check Gatekeeper settings if app is blocked

### OCR does not work

- Make sure the installation completed fully
- Windows: Check that `guestfill-ocr.exe` exists in the installation folder
- macOS/Linux: Ensure Python 3.10+ is available if running in dev mode
- PaddleOCR models download automatically on first OCR job (requires internet on first run)
