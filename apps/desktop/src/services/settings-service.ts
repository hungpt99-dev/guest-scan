import { logger } from "../lib/logger";
import { getById, put } from "../lib/db";

export type OcrEngineType = "paddle" | "tesseract" | "mock";

export type CameraDeviceConfig = {
  deviceId: string;
  label: string;
  resolution: { width: number; height: number };
};

export type ImageRetentionConfig = {
  enabled: boolean;
  maxAgeDays: number;
  maxImages: number;
  storagePath: string;
};

export type AutoFillProfileRef = {
  activeProfileId: string;
  enableTestMode: boolean;
};

export type AppOcrSettings = {
  engineType: OcrEngineType;
  paddleWorkerPath: string;
  paddleLanguage: string;
  tesseractPath: string;
  tesseractLanguage: string;
  enableFallback: boolean;
  ocrConfidenceThreshold: number;
  enableGpu: boolean;
};

export type AppSettings = {
  ocr: AppOcrSettings;
  camera: CameraDeviceConfig;
  imageRetention: ImageRetentionConfig;
  autoFill: AutoFillProfileRef;
  privacy: {
    maskDocumentNumberInLogs: boolean;
    maskFullNameInLogs: boolean;
    maskImagesInLogs: boolean;
    deleteTempImagesAfterProcessing: boolean;
    retentionEnabled: boolean;
  };
  theme: "light" | "dark";
  language: string;
  onboardingCompleted: boolean;
};

export type SettingsUpdate = {
  [P in keyof AppSettings]?: Partial<AppSettings[P]>;
};

export type SettingsChangeEvent = {
  key: keyof AppSettings;
  previousValue: unknown;
  newValue: unknown;
};

export type SettingsValidationResult = {
  valid: boolean;
  errors: SettingsValidationError[];
};

export type SettingsValidationError = {
  path: string;
  code: string;
  message: string;
};

export type SettingsChangeListener = (event: SettingsChangeEvent) => void;

const SETTINGS_KEY = "app_settings";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  ocr: {
    engineType: "paddle",
    paddleWorkerPath: "",
    paddleLanguage: "eng",
    tesseractPath: "",
    tesseractLanguage: "eng",
    enableFallback: true,
    ocrConfidenceThreshold: 0.6,
    enableGpu: false,
  },
  camera: {
    deviceId: "",
    label: "",
    resolution: { width: 1280, height: 720 },
  },
  imageRetention: {
    enabled: false,
    maxAgeDays: 7,
    maxImages: 100,
    storagePath: "",
  },
  autoFill: {
    activeProfileId: "",
    enableTestMode: true,
  },
  privacy: {
    maskDocumentNumberInLogs: true,
    maskFullNameInLogs: true,
    maskImagesInLogs: true,
    deleteTempImagesAfterProcessing: true,
    retentionEnabled: false,
  },
  theme: "light",
  language: "en",
  onboardingCompleted: false,
};

export interface SettingsStore {
  load(): Promise<AppSettings | undefined>;
  save(settings: AppSettings): Promise<void>;
}

export function createIndexedDbSettingsStore(): SettingsStore {
  return {
    async load(): Promise<AppSettings | undefined> {
      const entry = await getById<{ key: string; value: AppSettings }>("settings", SETTINGS_KEY);
      return entry?.value;
    },
    async save(settings: AppSettings): Promise<void> {
      await put("settings", { key: SETTINGS_KEY, value: settings });
    },
  };
}

export function createInMemorySettingsStore(initial?: AppSettings): SettingsStore {
  let stored: AppSettings | undefined = initial;
  return {
    async load(): Promise<AppSettings | undefined> {
      return stored;
    },
    async save(settings: AppSettings): Promise<void> {
      stored = { ...settings };
    },
  };
}

export interface SettingsService {
  loadSettings(): Promise<AppSettings>;
  getSettings(): AppSettings;
  updateSettings(update: SettingsUpdate): Promise<AppSettings>;
  resetSettings(): Promise<AppSettings>;
  validateSettings(settings: AppSettings): SettingsValidationResult;
  subscribe(listener: SettingsChangeListener): () => void;
  getOcrEngines(): OcrEngineType[];
  getSupportedLanguages(): string[];
}

export function createSettingsService(store?: SettingsStore): SettingsService {
  return new DefaultSettingsService(store ?? createIndexedDbSettingsStore());
}

class DefaultSettingsService implements SettingsService {
  private currentSettings: AppSettings;
  private listeners: Set<SettingsChangeListener> = new Set();
  private loaded = false;

  constructor(private readonly store: SettingsStore) {
    this.currentSettings = { ...DEFAULT_APP_SETTINGS };
  }

  async loadSettings(): Promise<AppSettings> {
    try {
      const stored = await this.store.load();
      if (stored) {
        const merged = this.mergeWithDefaults(stored);
        const validation = this.validateSettings(merged);
        if (!validation.valid) {
          logger.warn("SettingsService: loaded settings have validation errors", {
            errors: validation.errors,
          });
        }
        this.currentSettings = merged;
      } else {
        this.currentSettings = { ...DEFAULT_APP_SETTINGS };
      }
    } catch (error) {
      logger.error("SettingsService: failed to load settings, using defaults", {
        error: String(error),
      });
      this.currentSettings = { ...DEFAULT_APP_SETTINGS };
    }

    this.loaded = true;
    logger.info("SettingsService: settings loaded", {
      engineType: this.currentSettings.ocr.engineType,
      onboardingCompleted: this.currentSettings.onboardingCompleted,
    });

    return { ...this.currentSettings };
  }

  getSettings(): AppSettings {
    if (!this.loaded) {
      logger.warn("SettingsService: settings accessed before load, returning defaults");
    }
    return { ...this.currentSettings };
  }

  async updateSettings(update: SettingsUpdate): Promise<AppSettings> {
    if (!this.loaded) {
      await this.loadSettings();
    }

    const previous = { ...this.currentSettings };
    const updated = this.applyUpdate(this.currentSettings, update);
    const validation = this.validateSettings(updated);

    if (!validation.valid) {
      logger.error("SettingsService: validation failed on update", {
        errors: validation.errors,
      });
      throw new SettingsValidationErrorImpl(
        "SETTINGS_VALIDATION_FAILED",
        "Settings validation failed",
        validation.errors,
      );
    }

    this.currentSettings = updated;

    try {
      await this.store.save(this.currentSettings);
      logger.info("SettingsService: settings saved", {
        engineType: this.currentSettings.ocr.engineType,
      });
    } catch (error) {
      logger.error("SettingsService: failed to persist settings", {
        error: String(error),
      });
      throw new Error(`SettingsService: failed to persist settings: ${error}`);
    }

    this.notifyChanges(previous, this.currentSettings);

    return { ...this.currentSettings };
  }

  async resetSettings(): Promise<AppSettings> {
    const previous = { ...this.currentSettings };
    this.currentSettings = { ...DEFAULT_APP_SETTINGS };

    try {
      await this.store.save(this.currentSettings);
      logger.info("SettingsService: settings reset to defaults");
    } catch (error) {
      logger.error("SettingsService: failed to persist reset settings", {
        error: String(error),
      });
    }

    this.notifyChanges(previous, this.currentSettings);

    return { ...this.currentSettings };
  }

  validateSettings(settings: AppSettings): SettingsValidationResult {
    const errors: SettingsValidationError[] = [];

    if (!["paddle", "tesseract", "mock"].includes(settings.ocr.engineType)) {
      errors.push({
        path: "ocr.engineType",
        code: "INVALID_ENGINE_TYPE",
        message: `Invalid OCR engine type: ${settings.ocr.engineType}`,
      });
    }

    if (settings.ocr.ocrConfidenceThreshold < 0 || settings.ocr.ocrConfidenceThreshold > 1) {
      errors.push({
        path: "ocr.ocrConfidenceThreshold",
        code: "INVALID_CONFIDENCE_THRESHOLD",
        message: "Confidence threshold must be between 0 and 1",
      });
    }

    if (settings.imageRetention.enabled) {
      if (settings.imageRetention.maxAgeDays < 1) {
        errors.push({
          path: "imageRetention.maxAgeDays",
          code: "INVALID_MAX_AGE",
          message: "Max age must be at least 1 day",
        });
      }
      if (settings.imageRetention.maxImages < 1) {
        errors.push({
          path: "imageRetention.maxImages",
          code: "INVALID_MAX_IMAGES",
          message: "Max images must be at least 1",
        });
      }
    }

    if (settings.camera.resolution.width <= 0 || settings.camera.resolution.height <= 0) {
      errors.push({
        path: "camera.resolution",
        code: "INVALID_RESOLUTION",
        message: "Camera resolution dimensions must be positive",
      });
    }

    if (!settings.language) {
      errors.push({
        path: "language",
        code: "EMPTY_LANGUAGE",
        message: "Language cannot be empty",
      });
    }

    if (!["light", "dark"].includes(settings.theme)) {
      errors.push({
        path: "theme",
        code: "INVALID_THEME",
        message: `Invalid theme: ${settings.theme}. Must be "light" or "dark"`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  subscribe(listener: SettingsChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getOcrEngines(): OcrEngineType[] {
    return ["paddle", "tesseract", "mock"];
  }

  getSupportedLanguages(): string[] {
    return ["eng", "chi", "jpn", "kor", "fra", "deu", "spa", "ita", "por", "rus", "ara", "hin"];
  }

  private mergeWithDefaults(stored: Partial<AppSettings>): AppSettings {
    return {
      ocr: { ...DEFAULT_APP_SETTINGS.ocr, ...(stored.ocr ?? {}) },
      camera: { ...DEFAULT_APP_SETTINGS.camera, ...(stored.camera ?? {}) },
      imageRetention: {
        ...DEFAULT_APP_SETTINGS.imageRetention,
        ...(stored.imageRetention ?? {}),
      },
      autoFill: { ...DEFAULT_APP_SETTINGS.autoFill, ...(stored.autoFill ?? {}) },
      privacy: { ...DEFAULT_APP_SETTINGS.privacy, ...(stored.privacy ?? {}) },
      theme: stored.theme ?? DEFAULT_APP_SETTINGS.theme,
      language: stored.language ?? DEFAULT_APP_SETTINGS.language,
      onboardingCompleted: stored.onboardingCompleted ?? DEFAULT_APP_SETTINGS.onboardingCompleted,
    };
  }

  private applyUpdate(settings: AppSettings, update: SettingsUpdate): AppSettings {
    return {
      ocr: update.ocr ? { ...settings.ocr, ...update.ocr } : settings.ocr,
      camera: update.camera ? { ...settings.camera, ...update.camera } : settings.camera,
      imageRetention: update.imageRetention
        ? { ...settings.imageRetention, ...update.imageRetention }
        : settings.imageRetention,
      autoFill: update.autoFill ? { ...settings.autoFill, ...update.autoFill } : settings.autoFill,
      privacy: update.privacy ? { ...settings.privacy, ...update.privacy } : settings.privacy,
      theme: update.theme ?? settings.theme,
      language: update.language ?? settings.language,
      onboardingCompleted: update.onboardingCompleted ?? settings.onboardingCompleted,
    } as AppSettings;
  }

  private notifyChanges(previous: AppSettings, current: AppSettings): void {
    for (const key of Object.keys(current) as (keyof AppSettings)[]) {
      const prevVal = previous[key];
      const newVal = current[key];
      if (!this.deepEqual(prevVal, newVal)) {
        const event: SettingsChangeEvent = {
          key,
          previousValue: prevVal,
          newValue: newVal,
        };
        for (const listener of this.listeners) {
          try {
            listener(event);
          } catch (error) {
            logger.error("SettingsService: change listener error", {
              error: String(error),
            });
          }
        }
      }
    }
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return a === b;

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((val, idx) => this.deepEqual(val, b[idx]));
    }

    if (typeof a === "object" && typeof b === "object") {
      const aKeys = Object.keys(a as Record<string, unknown>);
      const bKeys = Object.keys(b as Record<string, unknown>);
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every((key) =>
        this.deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
      );
    }

    return a === b;
  }
}

class SettingsValidationErrorImpl extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly validationErrors: SettingsValidationError[],
  ) {
    super(message);
    this.name = "SettingsValidationError";
  }
}
