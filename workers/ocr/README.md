# GuestFill OCR Worker

Python OCR worker for extracting guest information from passport/ID documents.

## Usage

```bash
python -m guestfill_ocr create-excel --request request.json --response response.json
```

## Structure

```
workers/ocr/
  guestfill_ocr/          Main Python package
    cli/                  CLI argument parsing and I/O
    config/               Configuration defaults
    common/               Shared utilities (errors, result, logging)
    main.py               OCR processing entry point
  tests/                  Test directory
    unit/                 Unit tests
    integration/          Integration tests
  requirements.txt        Python dependencies
  pyproject.toml          Package configuration
```
