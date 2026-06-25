"""Create the Instructions sheet."""

from openpyxl.styles import Font


def write_instructions(ws) -> None:
    instructions = [
        ["GuestFill OCR Export - Instructions"],
        [""],
        ["1. Open the Guests sheet."],
        ["2. Review every row."],
        ["3. Rows with NEED_REVIEW must be checked carefully."],
        ["4. Rows with FAILED must be entered manually."],
        ["5. Check the ocr_warning column for possible issues."],
        ["6. Add room number, arrival date, departure date, and reservation code if needed."],
        ["7. Change status to READY when the row is correct."],
        ["8. Save this Excel file."],
        ["9. Import the reviewed Excel file into GuestFill Auto-fill."],
        [""],
        ["Status values: READY = Correct, can be auto-filled."],
        ["               NEED_REVIEW = Needs manual review."],
        ["               FAILED = OCR could not extract data."],
        [""],
        ["This Excel file was exported by GuestFill OCR Worker."],
    ]
    for i, row in enumerate(instructions, 1):
        for j, cell_value in enumerate(row, 1):
            cell = ws.cell(row=i, column=j, value=cell_value)
            if i == 1:
                cell.font = Font(bold=True, size=14)
            elif i == len(instructions):
                cell.font = Font(italic=True, color="888888")
    ws.column_dimensions["A"].width = 80
