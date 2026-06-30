# Security

## Data Sensitivity

Passport and ID data is highly sensitive. GuestFill is designed with privacy as a core requirement.

## Rules

1. **No external API calls by default.** All processing is local. Do not add network requests without explicit user configuration.
2. **No hidden network requests.** Every network request must be visible and configurable.
3. **No logging of sensitive data.** Never log passport numbers, ID numbers, full names, or raw OCR text.
4. **No logging full Excel rows.** Summary statistics only.
5. **Temporary files must be cleaned.** Use the designated temp directory and clean up after processing.
6. **Reviewed Excel is the source of truth.** OCR output is draft data and must be reviewed before use.
7. **Local files only.** The app only reads files explicitly selected by the user.
8. **Clipboard access only when triggered.** Clipboard operations require explicit user action.
9. **Browser extension bridge** binds to `127.0.0.1:43175` only (localhost), with token-based auth via `X-GuestFill-Token` header.
10. **Tauri capabilities** restrict Rust commands to approved APIs. Adding a new Tauri command requires updating the capability manifest.

## Data Masking

Use the masking utility for any display or logging of partially sensitive data:

```
A12345678 → A123****
123456789012 → 1234****
```

## Environment Variables

| Variable                | Purpose                                   | Required |
| ----------------------- | ----------------------------------------- | -------- |
| `GUESTFILL_BRIDGE_PORT` | Localhost bridge port (default: 43175)    | No       |
| `GUESTFILL_LOG_LEVEL`   | Logging verbosity (debug/info/warn/error) | No       |
| `GUESTFILL_OCR_TIMEOUT` | OCR worker timeout in seconds             | No       |

See `.env.example` for the full list with defaults.
