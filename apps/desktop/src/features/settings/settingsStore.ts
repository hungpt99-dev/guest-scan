import type { AppSettings } from "./settingsTypes";
import { DEFAULT_SETTINGS } from "./defaultSettings";

let settings: AppSettings = { ...DEFAULT_SETTINGS };

export async function loadSettings(): Promise<AppSettings> {
  try {
    const { invoke } = await import("@tauri-apps/api/tauri");
    const loaded = await invoke<AppSettings>("load_settings");
    settings = { ...DEFAULT_SETTINGS, ...loaded };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
  return settings;
}

export async function saveSettings(update: Partial<AppSettings>): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/tauri");
  settings = { ...settings, ...update };
  await invoke("save_settings", { settings });
}

export function getSettings(): AppSettings {
  return settings;
}
