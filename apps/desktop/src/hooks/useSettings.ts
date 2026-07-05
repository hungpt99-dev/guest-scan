import { useState, useEffect, useCallback } from "react";
import { loadSettings, saveSettings, type FillSettings } from "../features/settings/settingsStore";

export interface UseSettingsReturn {
  settings: FillSettings | null;
  updateSetting: <K extends keyof FillSettings>(key: K, value: FillSettings[K]) => void;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<FillSettings | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  const updateSetting = useCallback(<K extends keyof FillSettings>(key: K, value: FillSettings[K]) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  return { settings, updateSetting };
}
