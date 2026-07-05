import { isTauri } from "../lib/isTauri";

export interface PlatformInfo {
  isTauri: boolean;
  isBrowser: boolean;
}

export interface UsePlatformReturn {
  platform: PlatformInfo;
}

export function usePlatform(): UsePlatformReturn {
  const platform: PlatformInfo = {
    isTauri: isTauri(),
    isBrowser: !isTauri(),
  };

  return { platform };
}
