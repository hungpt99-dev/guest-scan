"""Build the OCR worker as a standalone Windows executable using PyInstaller."""

import os
import shutil
import subprocess
import sys
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    output_dir = repo_root / "dist" / "ocr-worker"

    print("=" * 60)
    print("GuestFill OCR Worker Builder")
    print("=" * 60)

    if not _check_pyinstaller():
        print("Installing PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    print(f"\nBuilding OCR worker from: {repo_root}")
    print(f"Output directory: {output_dir}")

    if output_dir.exists():
        shutil.rmtree(output_dir)

    hook_path = repo_root / "scripts" / "hooks" / "hook-guestfill_ocr.py"
    hook_dir = hook_path.parent
    hook_dir.mkdir(parents=True, exist_ok=True)

    pyinstaller_args = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--name",
        "guestfill-ocr",
        "--onefile",
        "--clean",
        "--noconfirm",
        "--distpath",
        str(output_dir),
        "--workpath",
        str(repo_root / "build" / "pyinstaller"),
        "--specpath",
        str(repo_root),
        "--hidden-import",
        "cv2",
        "--hidden-import",
        "pytesseract",
        "--hidden-import",
        "openpyxl",
        "--hidden-import",
        "PIL",
        "--hidden-import",
        "PIL.Image",
        "--hidden-import",
        "numpy",
        "--add-data",
        f"{repo_root / 'guestfill_ocr'}{os.pathsep}guestfill_ocr",
        str(repo_root / "guestfill_ocr" / "__main__.py"),
    ]

    print("\nRunning PyInstaller...")
    result = subprocess.run(pyinstaller_args, cwd=repo_root)

    if result.returncode != 0:
        print(f"\nERROR: PyInstaller failed with code {result.returncode}")
        sys.exit(1)

    exe_path = output_dir / "guestfill-ocr.exe"
    if exe_path.exists():
        size_mb = exe_path.stat().st_size / (1024 * 1024)
        print(f"\nSUCCESS: {exe_path} ({size_mb:.1f} MB)")
    else:
        print("\nWARNING: Executable not found at expected path.")
        print(f"  Check: {output_dir}")

    print("\nBuild complete.")
    print("\nNext steps:")
    print("  1. Bundle with Tesseract:")
    print("     - Copy tesseract.exe and tessdata/ to the output folder")
    print("  2. Test the packaged worker:")
    print(f"     {exe_path} create-excel --request request.json --response response.json")
    print("  3. Include in the installer")


def _check_pyinstaller() -> bool:
    try:
        subprocess.run(
            [sys.executable, "-m", "PyInstaller", "--version"],
            capture_output=True,
            check=True,
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


if __name__ == "__main__":
    main()
