export type AppSettings = {
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
  fieldOrder: string[];
  keyboardShortcuts: {
    copyCurrentField: string;
    nextField: string;
    previousField: string;
    nextGuest: string;
    markFilled: string;
    markSkipped: string;
    emergencyStop: string;
  };
};

export type SettingsUpdate = Partial<AppSettings>;
