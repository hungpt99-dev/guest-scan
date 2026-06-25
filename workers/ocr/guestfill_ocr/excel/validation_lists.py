"""Excel data validation lists."""

from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation


def add_status_dropdown(ws, num_rows: int, status_col: str = "T") -> None:
    if num_rows < 2:
        return
    dv = DataValidation(
        type="list",
        formula1='"READY,NEED_REVIEW,FAILED,FILLED,SKIPPED"',
        allow_blank=True,
    )
    dv.error = "Please select a valid status"
    dv.errorTitle = "Invalid Status"
    ws.add_data_validation(dv)
    dv.add(f"{status_col}2:{status_col}{num_rows + 1}")


def add_filters(ws, num_cols: int, num_rows: int) -> None:
    if num_rows < 1:
        return
    ws.auto_filter.ref = f"A1:{get_column_letter(num_cols)}{num_rows + 1}"
