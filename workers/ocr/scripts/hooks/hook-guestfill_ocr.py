"""PyInstaller hook for guestfill_ocr module."""

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = collect_all("guestfill_ocr")
