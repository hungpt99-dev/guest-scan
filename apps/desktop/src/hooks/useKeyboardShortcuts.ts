import { useEffect } from "react";

export interface ShortcutMap {
  [shortcut: string]: () => void;
}

function parseShortcut(shortcut: string): {
  key: string;
  needsCtrl: boolean;
  needsShift: boolean;
  needsAlt: boolean;
} {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts[parts.length - 1] ?? "";
  return {
    key,
    needsCtrl: parts.includes("ctrl"),
    needsShift: parts.includes("shift"),
    needsAlt: parts.includes("alt"),
  };
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (isInput) return;

      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const isAlt = e.altKey;

      for (const [shortcut, handler] of Object.entries(shortcuts)) {
        const parsed = parseShortcut(shortcut);
        if (
          e.key.toLowerCase() === parsed.key &&
          isCtrl === parsed.needsCtrl &&
          isShift === parsed.needsShift &&
          isAlt === parsed.needsAlt
        ) {
          e.preventDefault();
          handler();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts, enabled]);
}
