import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadSettings,
  saveSettings,
  getSettings,
  DEFAULT_FILL_SETTINGS,
} from "../../../features/settings/settingsStore";

vi.mock("../../../lib/db", () => {
  const store: Record<string, { key: string; value: unknown }> = {};
  return {
    getById: vi.fn(async (_storeName: string, key: string) => store[key] ?? undefined),
    put: vi.fn(async (_storeName: string, value: { key: string; value: unknown }) => {
      store[value.key] = value;
    }),
  };
});

describe("Settings E2E: full lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads default settings when nothing is stored", async () => {
    const settings = await loadSettings();
    expect(settings).toEqual(DEFAULT_FILL_SETTINGS);
    expect(settings.dateDisplayFormat).toBe("yyyy-MM-dd");
    expect(settings.localBridgePort).toBe(43175);
    expect(settings.enableGlobalShortcuts).toBe(false);
  });

  it("saves and loads settings from persistence", async () => {
    await saveSettings({ dateDisplayFormat: "dd/MM/yyyy", enableGlobalShortcuts: true });
    const loaded = await loadSettings();
    expect(loaded.dateDisplayFormat).toBe("dd/MM/yyyy");
    expect(loaded.enableGlobalShortcuts).toBe(true);
    expect(loaded.localBridgePort).toBe(43175);
  });

  it("returns current in-memory settings without DB read", async () => {
    await saveSettings({ defaultExcelFolder: "/path/to/excel" });
    const current = getSettings();
    expect(current.defaultExcelFolder).toBe("/path/to/excel");
  });

  it("merges partial updates with existing settings", async () => {
    await saveSettings({ clearClipboardAfterSeconds: 120 });
    await saveSettings({ maskDocumentNumberInLogs: false });
    const loaded = await loadSettings();
    expect(loaded.clearClipboardAfterSeconds).toBe(120);
    expect(loaded.maskDocumentNumberInLogs).toBe(false);
    expect(loaded.autoOpenNextGuestAfterFilled).toBe(true);
  });

  it("persists all setting fields correctly", async () => {
    const allFields: Record<string, unknown> = {
      defaultExcelFolder: "/data/excel",
      defaultTargetSystemId: "web_pms",
      dateDisplayFormat: "MM/dd/yyyy",
      autoOpenNextGuestAfterFilled: false,
      maskDocumentNumberInLogs: false,
      clearClipboardAfterSeconds: 30,
      enableGlobalShortcuts: true,
      enableBrowserExtension: false,
      enableDesktopAutomation: false,
      localBridgePort: 54321,
    };
    await saveSettings(allFields);
    const loaded = await loadSettings();
    expect(loaded.defaultExcelFolder).toBe("/data/excel");
    expect(loaded.defaultTargetSystemId).toBe("web_pms");
    expect(loaded.dateDisplayFormat).toBe("MM/dd/yyyy");
    expect(loaded.autoOpenNextGuestAfterFilled).toBe(false);
    expect(loaded.maskDocumentNumberInLogs).toBe(false);
    expect(loaded.clearClipboardAfterSeconds).toBe(30);
    expect(loaded.enableGlobalShortcuts).toBe(true);
    expect(loaded.enableBrowserExtension).toBe(false);
    expect(loaded.enableDesktopAutomation).toBe(false);
    expect(loaded.localBridgePort).toBe(54321);
  });

  it("resets to defaults when stored data is corrupted", async () => {
    const { getById } = await import("../../../lib/db");
    vi.mocked(getById).mockRejectedValueOnce(new Error("Corrupted data"));
    const settings = await loadSettings();
    expect(settings).toEqual(DEFAULT_FILL_SETTINGS);
  });

  it("handles multiple save and load cycles correctly", async () => {
    for (let i = 0; i < 5; i++) {
      await saveSettings({ clearClipboardAfterSeconds: 10 * (i + 1) });
      const loaded = await loadSettings();
      expect(loaded.clearClipboardAfterSeconds).toBe(10 * (i + 1));
    }
    expect(getSettings().clearClipboardAfterSeconds).toBe(50);
  });
});
