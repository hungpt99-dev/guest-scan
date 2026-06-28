import { getById, put } from "../../lib/db";

const SETTINGS_KEY = "fill_settings";

export type FillSettings = {
  defaultExcelFolder: string;
  defaultTargetSystemId: string;
  dateDisplayFormat: string;
  autoOpenNextGuestAfterFilled: boolean;
  maskDocumentNumberInLogs: boolean;
  clearClipboardAfterSeconds: number;
  enableGlobalShortcuts: boolean;
  enableBrowserExtension: boolean;
  enableDesktopAutomation: boolean;
  localBridgePort: number;
};

export const DEFAULT_FILL_SETTINGS: FillSettings = {
  defaultExcelFolder: "",
  defaultTargetSystemId: "copy_assistant",
  dateDisplayFormat: "yyyy-MM-dd",
  autoOpenNextGuestAfterFilled: true,
  maskDocumentNumberInLogs: true,
  clearClipboardAfterSeconds: 60,
  enableGlobalShortcuts: false,
  enableBrowserExtension: true,
  enableDesktopAutomation: true,
  localBridgePort: 43175,
};

let settings: FillSettings = { ...DEFAULT_FILL_SETTINGS };

export async function loadSettings(): Promise<FillSettings> {
  try {
    const stored = await getById<{ key: string; value: FillSettings }>("settings", SETTINGS_KEY);
    if (stored?.value) {
      settings = { ...DEFAULT_FILL_SETTINGS, ...stored.value };
    }
  } catch {
    settings = { ...DEFAULT_FILL_SETTINGS };
  }
  return settings;
}

export async function saveSettings(update: Partial<FillSettings>): Promise<void> {
  settings = { ...settings, ...update };
  await put("settings", { key: SETTINGS_KEY, value: settings });
}

export function getSettings(): FillSettings {
  return settings;
}
