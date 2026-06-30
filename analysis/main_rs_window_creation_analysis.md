# main.rs Window Creation Analysis

## File: `apps/desktop/src-tauri/src/main.rs`

## Summary

The main entry point is a minimal Tauri v1.6 app. It uses `tauri::Builder::default()` with no explicit window configuration, no `.setup()` hook, and no `.on_window_event()` handler. The app manages `AppState`, registers 10 commands, and runs.

## Critical Issue: Missing `windows` Configuration in `tauri.conf.json`

`apps/desktop/src-tauri/tauri.conf.json` (lines 12-57) defines `allowlist`, `bundle`, and `security` — but **no `windows` array**.

In Tauri v1, the main window is configured under `tauri.windows` in `tauri.conf.json`. Without it, Tauri's fallback behavior varies by platform. On macOS, this can result in:

- A window created with zero or default (non-visible) dimensions
- The window not appearing at all
- Being created offscreen or with incorrect screen placement

**Fix:** Add a `windows` array to `tauri.conf.json`:

```json
"tauri": {
  "windows": [
    {
      "title": "GuestFill",
      "width": 1200,
      "height": 800,
      "resizable": true,
      "fullscreen": false,
      "center": true
    }
  ],
  ...
}
```

## Secondary Issue: No `.setup()` Hook

The builder chain at `main.rs:15-33` does not call `.setup()`. This means:

- No programmatic window manipulation (sizing, centering, decorations)
- No error logging on app startup
- No platform-specific initialization (e.g., macOS menu bar, activation policy)
- No visibility into _why_ the window might fail to load

**Fix (complementary):** Add a `.setup()` closure to handle platform-specific behavior and add logging:

```rust
.setup(|app| {
    let window = tauri::WindowBuilder::new(app, "main", tauri::WindowUrl::App("index.html".into()))
        .title("GuestFill")
        .inner_size(1200.0, 800.0)
        .center()
        .build()?;
    #[cfg(target_os = "macos")]
    {
        use tauri::ActivationPolicy;
        app.set_activation_policy(ActivationPolicy::Regular);
    }
    Ok(())
})
```

## Possible Issue: Frontend Assets Missing

- `distDir` is set to `"../dist"` (relative to `src-tauri/`).
- If `apps/desktop/dist/` does not exist or was not built, the webview loads nothing → blank window.
- In development, `devPath: "http://localhost:1420"` requires the Vite dev server to be running.

## Platform-Specific Observations

| Factor                                   | Status                                     | Risk                                                     |
| ---------------------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| `windows_subsystem = "windows"`          | Line 1 — `cfg_attr(not(debug_assertions))` | Low — ignored on macOS                                   |
| No `windows` config in `tauri.conf.json` | Missing                                    | **High** — most likely macOS cause                       |
| No `.setup()` hook                       | Missing                                    | Medium — no diagnostics, no programmatic window creation |
| `csp: null`                              | Line 56                                    | Low — permissive but not a cause of blank window         |
| No plugin registrations                  | Missing                                    | Low — app doesn't appear to need plugins                 |
| Tauri version                            | 1.6                                        | Low — stable version range                               |

## Conclusion

The **most probable cause** of a blank window on macOS is the **absence of window configuration** in `tauri.conf.json`. Without `tauri.windows`, macOS may not render a visible window. The secondary contributor is the lack of a `.setup()` hook, which precludes programmatic window construction and error diagnostics.
