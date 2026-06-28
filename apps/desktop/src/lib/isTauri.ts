export function isTauri(): boolean {
  return typeof window !== "undefined" && typeof window.__TAURI_IPC__ !== "undefined" && window.__TAURI_IPC__ !== null;
}

export async function requireTauri(): Promise<void> {
  if (!isTauri()) {
    throw new Error(
      "GuestFill is running in a browser. Please run the app with `pnpm tauri dev` or open the built desktop app.",
    );
  }
}
