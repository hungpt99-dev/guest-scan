import { useState, useEffect } from "react";
import Card from "../components/common/Card";
import OcrProviderCredentials from "../components/settings/OcrProviderCredentials";
import { DEFAULT_KEYBOARD_SHORTCUTS } from "../features/fill/fillConstants";
import { loadSettings, saveSettings, type FillSettings } from "../features/settings/settingsStore";

export default function SettingsScreen() {
  const [settings, setSettings] = useState<FillSettings | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const update = (key: keyof FillSettings, value: unknown) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  };

  if (!settings) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <Card title="General">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Default Excel Folder</label>
            <input
              type="text"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={settings.defaultExcelFolder}
              onChange={(e) => update("defaultExcelFolder", e.target.value)}
              placeholder="Leave empty for system default"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Default Target System</label>
            <select
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={settings.defaultTargetSystemId}
              onChange={(e) => update("defaultTargetSystemId", e.target.value)}
            >
              <option value="copy_assistant">Copy Assistant</option>
              <option value="web">Web Browser</option>
              <option value="desktop">Desktop Application</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Date Display Format</label>
            <select
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={settings.dateDisplayFormat}
              onChange={(e) => update("dateDisplayFormat", e.target.value)}
            >
              <option value="yyyy-MM-dd">yyyy-MM-dd</option>
              <option value="dd/MM/yyyy">dd/MM/yyyy</option>
              <option value="MM/dd/yyyy">MM/dd/yyyy</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.autoOpenNextGuestAfterFilled}
                onChange={(e) => update("autoOpenNextGuestAfterFilled", e.target.checked)}
              />
              Auto-open next guest after filling
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.maskDocumentNumberInLogs}
                onChange={(e) => update("maskDocumentNumberInLogs", e.target.checked)}
              />
              Mask document numbers in logs
            </label>
          </div>
        </div>
      </Card>

      <OcrProviderCredentials />

      <Card title="Auto-fill">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Clear clipboard after (seconds, 0 = never)
            </label>
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={settings.clearClipboardAfterSeconds}
              onChange={(e) => update("clearClipboardAfterSeconds", parseInt(e.target.value) || 0)}
              min={0}
              max={300}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enableGlobalShortcuts}
                onChange={(e) => update("enableGlobalShortcuts", e.target.checked)}
              />
              Enable global keyboard shortcuts (disabled by default)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enableBrowserExtension}
                onChange={(e) => update("enableBrowserExtension", e.target.checked)}
              />
              Enable browser extension bridge
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enableDesktopAutomation}
                onChange={(e) => update("enableDesktopAutomation", e.target.checked)}
              />
              Enable desktop automation agent
            </label>
          </div>
          {settings.enableBrowserExtension && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Local Bridge Port</label>
              <input
                type="number"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={settings.localBridgePort}
                onChange={(e) => update("localBridgePort", parseInt(e.target.value) || 43175)}
                min={1024}
                max={65535}
              />
            </div>
          )}
        </div>
      </Card>

      <Card title="Keyboard Shortcuts">
        <p className="mb-4 text-sm text-gray-500">Default shortcuts (only active when GuestFill is focused):</p>
        <div className="space-y-2">
          {Object.entries(DEFAULT_KEYBOARD_SHORTCUTS).map(([key, shortcut]) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-gray-600">{formatShortcutName(key)}</span>
              <span className="font-mono text-gray-900">{shortcut}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-gray-400">
          Global shortcuts are disabled by default for security. Enable them above.
        </p>
      </Card>

      <Card title="Safety">
        <div className="space-y-2 text-sm text-gray-600">
          <p>• Auto Save is disabled by default for all templates.</p>
          <p>• Auto Save can only be enabled per-template, never globally.</p>
          <p>• Auto Save requires safety checks to pass before running.</p>
          <p>
            • Emergency stop shortcut: <kbd className="rounded bg-gray-100 px-1 font-mono">Ctrl+Alt+Esc</kbd>
          </p>
          <p>• Manual Save is the default behavior for all fill operations.</p>
        </div>
      </Card>
    </div>
  );
}

function formatShortcutName(name: string): string {
  const map: Record<string, string> = {
    copyCurrentField: "Copy Current Field",
    nextField: "Next Field",
    previousField: "Previous Field",
    nextGuest: "Next Guest",
    markFilled: "Mark Filled",
    markSkipped: "Mark Skipped",
    emergencyStop: "Emergency Stop",
  };
  return map[name] || name;
}
