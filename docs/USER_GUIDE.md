# GuestFill User Guide

## Overview

GuestFill helps hotels convert passport/ID documents into reviewed Excel data, then fill guest information into hotel systems.

## Step 1: Create Excel from Documents

1. Open GuestFill and click **Create Excel from Documents** on the home screen.
2. Click **Select Files** or **Select Folder** to choose passport/ID images or PDFs.
3. Click **Choose Output File** to select where to save the Excel file.
4. Click **Create Excel** to run OCR.
5. Wait for processing to complete. A summary will appear.
6. Click **Open Excel** to review the generated file.

## Step 2: Review the Excel File

1. Open the generated Excel file.
2. Review every row:
   - **READY** — data looks correct, ready for auto-fill
   - **NEED_REVIEW** — check carefully, some fields may need correction
   - **FAILED** — OCR could not extract data, enter manually
3. Check the **ocr_warning** column for possible issues.
4. Add **room_number**, **arrival_date**, **departure_date**, and **reservation_code** if needed.
5. Change **status** to **READY** when the row is correct.
6. Save the Excel file.

## Step 3: Import Reviewed Excel

1. Back in GuestFill, click **Import Excel to Fill Guest Info** on the home screen.
2. Click **Select Excel File** and choose your reviewed Excel file.
3. Click **Import and Review**.
4. Review the import summary. Fix any issues shown.
5. Click **View Guest List** to see all imported guests.

## Step 4: Use Copy Assistant

1. In the Guest List, click **Fill** next to a guest.
2. The Fill Assistant shows all fields for that guest.
3. Click **Copy** next to any field to copy it to clipboard.
4. Use **← Prev Field** / **Next Field →** to navigate fields.
5. Use **← Prev** / **Next →** to navigate between guests.
6. Paste the copied values into your hotel system.

## Step 5: Track Fill Status

1. After filling a guest's information, click **Mark Filled**.
2. If you decide to skip a guest, click **Mark Skipped**.
3. The fill status is saved locally and shown in the Guest List.

## Step 6: Export Fill Log

1. Fill events are automatically logged.
2. To export the log, go to Settings and click **Export Fill Log**.
3. The log contains timestamped events with masked document numbers.

## Manual Save (Default)

GuestFill copies fields to clipboard. You must paste them and click Save in your hotel system manually. This is the default and safest mode.

## Auto Save (Optional)

1. Create a template in **Templates** screen.
2. Set **Save Mode** to **Auto**.
3. Configure the Auto Save selector.
4. Test the template before using with real data.
5. Auto Save will only run if all safety checks pass.

**Warning:** Auto Save can submit real guest data. Test carefully before using.
