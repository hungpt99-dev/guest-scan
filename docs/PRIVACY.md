# Privacy Policy

## Local-First Design

GuestFill is a local-first application. All processing happens on your computer. No guest data is uploaded to any cloud service by default.

## What Data Is Stored Locally

Guest data is stored in a local database on your computer:

- Guest name, passport number, ID number, nationality, date of birth, gender
- Room number, arrival/departure dates, reservation code
- OCR confidence scores and warnings
- Fill status and event logs

## What Data Is NOT Collected

GuestFill does **not** collect or transmit:

- Passport or ID images
- Full passport numbers (masked in logs)
- Full ID numbers (masked in logs)
- Date of birth in logs
- Raw OCR text
- Source document images
- Usage analytics
- Personal information about the user

## Network Access

GuestFill does not make network requests by default.

Optional features that may use local network:

- **Browser extension bridge** — connects to GuestFill desktop app on `127.0.0.1:43175` (localhost only)
- **Online OCR fallback** — disabled by default, requires explicit user configuration

## Data Retention

Guest data is stored until you delete import sessions.

To delete all data:

1. Open GuestFill
2. Go to Settings
3. Click **Delete All Import Sessions**
4. Click **Clear Fill Logs**

## Third-Party Software

GuestFill includes:

- **Tesseract OCR** (Apache 2.0 License) — local OCR engine
- **OpenCV** (Apache 2.0 License) — image processing

These run entirely locally. No data is sent to third parties.

## Security

- All processing is local
- No cloud database
- No user account required
- No analytics
- Temporary files are cleaned after processing
- Document numbers are masked in logs by default

## Changes to This Policy

We may update this privacy policy. Check the GuestFill website or GitHub repository for updates.

## Contact

For privacy questions, open an issue on the GuestFill GitHub repository.
