"""Create the Errors sheet."""

from guestfill_ocr.excel.columns import ERROR_COLUMNS
from guestfill_ocr.excel.styles import auto_width, style_header


def write_errors_sheet(ws, errors: list[dict]) -> None:
    for col_idx, col_name in enumerate(ERROR_COLUMNS, 1):
        ws.cell(row=1, column=col_idx, value=col_name)

    for row_idx, error in enumerate(errors, 2):
        for col_idx, col_name in enumerate(ERROR_COLUMNS, 1):
            value = error.get(col_name, "")
            ws.cell(row=row_idx, column=col_idx, value=value)

    style_header(ws, len(ERROR_COLUMNS))
    auto_width(ws, len(ERROR_COLUMNS))
