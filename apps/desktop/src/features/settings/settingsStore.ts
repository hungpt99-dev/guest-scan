import { getById, put } from "../../lib/db";
import {
  FILL_SETTINGS_KEY,
  DEFAULT_CLEAR_CLIPBOARD_AFTER_SECONDS,
  DEFAULT_LOCAL_BRIDGE_PORT,
  DEFAULT_TARGET_SYSTEM_ID,
  DEFAULT_DATE_DISPLAY_FORMAT,
} from "../../config/constants";

const SETTINGS_KEY = FILL_SETTINGS_KEY;

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
  defaultTargetSystemId: DEFAULT_TARGET_SYSTEM_ID,
  dateDisplayFormat: DEFAULT_DATE_DISPLAY_FORMAT,
  autoOpenNextGuestAfterFilled: true,
  maskDocumentNumberInLogs: true,
  clearClipboardAfterSeconds: DEFAULT_CLEAR_CLIPBOARD_AFTER_SECONDS,
  enableGlobalShortcuts: false,
  enableBrowserExtension: true,
  enableDesktopAutomation: true,
  localBridgePort: DEFAULT_LOCAL_BRIDGE_PORT,
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
