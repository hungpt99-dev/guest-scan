"""Create the Diagnostics sheet."""

from guestfill_ocr.excel.columns import DIAGNOSTIC_COLUMNS
from guestfill_ocr.excel.styles import auto_width, style_header


def write_diagnostics_sheet(ws, diagnostics: list[dict]) -> None:
    for col_idx, col_name in enumerate(DIAGNOSTIC_COLUMNS, 1):
        ws.cell(row=1, column=col_idx, value=col_name)

    for row_idx, diagnostic in enumerate(diagnostics, 2):
        for col_idx, col_name in enumerate(DIAGNOSTIC_COLUMNS, 1):
            value = diagnostic.get(col_name, "")
            ws.cell(row=row_idx, column=col_idx, value=value)

    style_header(ws, len(DIAGNOSTIC_COLUMNS))
    auto_width(ws, len(DIAGNOSTIC_COLUMNS))
