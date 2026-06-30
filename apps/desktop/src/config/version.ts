const STORAGE_KEY = "guestfill:app_version";
const BUILD_VERSION = "0.1.0";

function loadPersistedVersion(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? BUILD_VERSION;
  } catch {
    return BUILD_VERSION;
  }
}

export let APP_VERSION = loadPersistedVersion();

export function updateAppVersion(newVersion: string): void {
  APP_VERSION = newVersion;
  try {
    localStorage.setItem(STORAGE_KEY, newVersion);
  } catch {
    // storage unavailable
  }
}
