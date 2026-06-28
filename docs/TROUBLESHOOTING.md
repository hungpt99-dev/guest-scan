# Troubleshooting

## OCR Cannot Read Image

**Error:** OCR output is empty or has very low confidence.

**Causes:**

- Image is too small or low resolution
- Image has glare, shadows, or is blurry
- Document is skewed or partially cut off
- MRZ area is not clearly visible

**Solutions:**

- Use images at least 800x600 pixels, ideally 1200+ pixels
- Scan documents on a flat surface with good lighting
- Avoid camera flash reflection
- Ensure the MRZ (machine-readable zone) at the bottom is fully visible
- Try converting PDF to image first

## Excel File Is Locked

**Error:** The Excel file is open. Please close it and try again.

**Cause:** The Excel file is currently open in another program (Microsoft Excel, Google Sheets, etc.).

**Solution:** Close the Excel file in all programs, then try again.

## Missing Required Column

**Error:** Missing required columns.

**Causes:** The Excel file does not have the columns GuestFill needs.

**Required columns:** `fullName`, `dateOfBirth`, `gender`, `documentType`

**Solution:** Make sure your Excel file includes these columns before importing.

## Tesseract Not Found

**Error:** Tesseract OCR engine not found.

**Cause:** Tesseract is not installed or not in the system PATH.

**Solution:** Reinstall GuestFill. If using the portable version, make sure the `tesseract/` folder is in the same directory as the OCR worker.

## Low Accuracy Warning on Copy

**Error:** A field shows a low accuracy warning when trying to copy.

**Causes:**

- Field value has suspicious format (e.g., name contains only digits)
- Passport/ID number doesn't match expected patterns
- Date is outside reasonable range or document has expired
- Gender value is unusual
- Nationality and issuing country don't match

**Solutions:**

- Manually verify the field value against the original document
- Edit the value in the Excel file and re-import
- If the value is correct, use copy anyway by confirming the warning
- Re-run OCR with a better quality image

## Auto Save Skipped

**Error:** Auto Save was skipped.

**Causes:**

- Template save mode is set to Manual
- Auto Save selector is not configured
- Required guest values are missing
- Safety checks failed

**Solution:** Manual Save is the default. To use Auto Save, configure it per-template and ensure all safety checks pass.

## Browser Extension Not Connected

**Error:** Browser extension is not connected.

**Cause:** The GuestFill desktop app is not running, or the local bridge port is blocked.

**Solutions:**

- Make sure GuestFill desktop app is running
- Check that browser extension is installed and enabled
- Verify local bridge port (default: 43175) is not blocked by firewall
- Restart browser and GuestFill

## Desktop Automation Not Working

**Error:** Desktop agent not running.

**Cause:** The desktop automation agent is not started or not installed.

**Solution:** Desktop automation is a planned feature. Use Copy Assistant instead.

## How to Export Diagnostics

1. Open GuestFill
2. Go to **Settings** → **Diagnostics**
3. Click **Export Diagnostic Report**
4. Save the file and share it with support
