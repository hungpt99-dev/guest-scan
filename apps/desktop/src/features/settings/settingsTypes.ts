export type AppSettings = {
  ocrWorkerPath: string;
  ocrLanguage: string;
  outputDirectory: string;
  tempDirectory: string;
  theme: "light" | "dark";
};

export type SettingsUpdate = Partial<AppSettings>;
