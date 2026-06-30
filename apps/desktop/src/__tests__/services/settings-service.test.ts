import { describe, it, expect, beforeEach } from "vitest";
import {
  createSettingsService,
  createInMemorySettingsStore,
  type SettingsService,
  type AppSettings,
} from "../../services/settings-service";

function makeSettings(overrides: Record<string, unknown> = {}): AppSettings {
  return {
    ocr: {
      engineType: "paddle",
      paddleWorkerPath: "",
      paddleLanguage: "eng",
      tesseractPath: "",
      tesseractLanguage: "eng",
      enableFallback: true,
      ocrConfidenceThreshold: 0.6,
      enableGpu: false,
      ...(overrides.ocr as Record<string, unknown>),
    },
    camera: {
      deviceId: "default",
      label: "Default Camera",
      resolution: { width: 1280, height: 720 },
      ...(overrides.camera as Record<string, unknown>),
    },
    imageRetention: {
      enabled: false,
      maxAgeDays: 7,
      maxImages: 100,
      storagePath: "",
      ...(overrides.imageRetention as Record<string, unknown>),
    },
    autoFill: {
      activeProfileId: "",
      enableTestMode: true,
      ...(overrides.autoFill as Record<string, unknown>),
    },
    privacy: {
      maskDocumentNumberInLogs: true,
      maskFullNameInLogs: true,
      maskImagesInLogs: true,
      deleteTempImagesAfterProcessing: true,
      retentionEnabled: false,
      ...(overrides.privacy as Record<string, unknown>),
    },
    theme: (overrides.theme as string) ?? "light",
    language: (overrides.language as string) ?? "en",
    onboardingCompleted: (overrides.onboardingCompleted as boolean) ?? false,
  } as AppSettings;
}

describe("SettingsService", () => {
  let service: SettingsService;

  beforeEach(() => {
    const store = createInMemorySettingsStore();
    service = createSettingsService(store);
  });

  describe("loadSettings", () => {
    it("loads default settings when no stored settings exist", async () => {
      const settings = await service.loadSettings();
      expect(settings.ocr.engineType).toBe("paddle");
      expect(settings.ocr.ocrConfidenceThreshold).toBe(0.6);
      expect(settings.privacy.maskDocumentNumberInLogs).toBe(true);
      expect(settings.onboardingCompleted).toBe(false);
      expect(settings.theme).toBe("light");
    });

    it("loads previously saved settings", async () => {
      const store = createInMemorySettingsStore(makeSettings({ theme: "dark" }));
      const svc = createSettingsService(store);
      const settings = await svc.loadSettings();
      expect(settings.theme).toBe("dark");
    });

    it("merges partial stored settings with defaults", async () => {
      const store = createInMemorySettingsStore({
        theme: "dark",
      } as AppSettings);
      const svc = createSettingsService(store);
      const settings = await svc.loadSettings();
      expect(settings.theme).toBe("dark");
      expect(settings.ocr.engineType).toBe("paddle");
      expect(settings.privacy.maskDocumentNumberInLogs).toBe(true);
    });

    it("returns defaults when stored data is invalid", async () => {
      const store = createInMemorySettingsStore(undefined);
      const svc = createSettingsService(store);
      const settings = await svc.loadSettings();
      expect(settings.theme).toBe("light");
      expect(settings.ocr.engineType).toBe("paddle");
    });
  });

  describe("getSettings", () => {
    it("returns current settings in memory", async () => {
      await service.loadSettings();
      const settings = service.getSettings();
      expect(settings.ocr.engineType).toBe("paddle");
    });

    it("returns defaults if load was not called", () => {
      const settings = service.getSettings();
      expect(settings.ocr.engineType).toBe("paddle");
    });

    it("returns a copy, not a reference", async () => {
      await service.loadSettings();
      const settings = service.getSettings();
      settings.theme = "dark";
      expect(service.getSettings().theme).toBe("light");
    });
  });

  describe("updateSettings", () => {
    it("updates a single nested field", async () => {
      await service.loadSettings();
      const updated = await service.updateSettings({
        ocr: { engineType: "tesseract" },
      });
      expect(updated.ocr.engineType).toBe("tesseract");
      expect(updated.ocr.paddleLanguage).toBe("eng");
    });

    it("persists updates across load cycles", async () => {
      const store = createInMemorySettingsStore();
      const svc = createSettingsService(store);
      await svc.loadSettings();
      await svc.updateSettings({ theme: "dark" });

      const svc2 = createSettingsService(store);
      const reloaded = await svc2.loadSettings();
      expect(reloaded.theme).toBe("dark");
    });

    it("updates multiple nested fields at once", async () => {
      await service.loadSettings();
      const updated = await service.updateSettings({
        ocr: { engineType: "tesseract", ocrConfidenceThreshold: 0.8 },
        privacy: { maskDocumentNumberInLogs: false },
      });
      expect(updated.ocr.engineType).toBe("tesseract");
      expect(updated.ocr.ocrConfidenceThreshold).toBe(0.8);
      expect(updated.privacy.maskDocumentNumberInLogs).toBe(false);
    });

    it("rejects invalid confidence threshold", async () => {
      await service.loadSettings();
      await expect(
        service.updateSettings({
          ocr: { ocrConfidenceThreshold: 1.5 },
        }),
      ).rejects.toThrow();
    });

    it("rejects invalid engine type", async () => {
      await service.loadSettings();
      await expect(
        service.updateSettings({
          ocr: { engineType: "invalid" as never },
        }),
      ).rejects.toThrow();
    });

    it("rejects invalid theme", async () => {
      await service.loadSettings();
      await expect(service.updateSettings({ theme: "blue" as never })).rejects.toThrow();
    });

    it("rejects negative camera resolution", async () => {
      await service.loadSettings();
      await expect(
        service.updateSettings({
          camera: { resolution: { width: -1, height: 720 } },
        }),
      ).rejects.toThrow();
    });
  });

  describe("resetSettings", () => {
    it("resets all settings to defaults", async () => {
      await service.loadSettings();
      await service.updateSettings({
        theme: "dark",
        ocr: { engineType: "tesseract" },
        onboardingCompleted: true,
      });
      const reset = await service.resetSettings();
      expect(reset.theme).toBe("light");
      expect(reset.ocr.engineType).toBe("paddle");
      expect(reset.onboardingCompleted).toBe(false);
    });

    it("persists reset across load", async () => {
      const store = createInMemorySettingsStore();
      const svc = createSettingsService(store);
      await svc.loadSettings();
      await svc.updateSettings({ theme: "dark" });
      await svc.resetSettings();

      const svc2 = createSettingsService(store);
      const reloaded = await svc2.loadSettings();
      expect(reloaded.theme).toBe("light");
    });
  });

  describe("subscribe", () => {
    it("notifies listeners on settings change", async () => {
      await service.loadSettings();
      const events: unknown[] = [];
      const unsubscribe = service.subscribe((event) => {
        events.push(event);
      });

      await service.updateSettings({ theme: "dark" });

      expect(events.length).toBeGreaterThan(0);
      expect((events[0] as Record<string, unknown>).key).toBe("theme");
      expect((events[0] as Record<string, unknown>).previousValue).toBe("light");
      expect((events[0] as Record<string, unknown>).newValue).toBe("dark");

      unsubscribe();
    });

    it("stops notifying after unsubscribe", async () => {
      await service.loadSettings();
      let callCount = 0;
      const unsubscribe = service.subscribe(() => {
        callCount++;
      });
      unsubscribe();
      await service.updateSettings({ theme: "dark" });
      expect(callCount).toBe(0);
    });

    it("supports multiple listeners", async () => {
      await service.loadSettings();
      let count1 = 0;
      let count2 = 0;
      service.subscribe(() => {
        count1++;
      });
      service.subscribe(() => {
        count2++;
      });
      await service.updateSettings({ theme: "dark" });
      expect(count1).toBeGreaterThan(0);
      expect(count2).toBeGreaterThan(0);
    });

    it("does not notify when no actual change occurs", async () => {
      await service.loadSettings();
      let callCount = 0;
      service.subscribe(() => {
        callCount++;
      });
      await service.updateSettings({ ocr: { engineType: "paddle" } });
      expect(callCount).toBe(0);
    });
  });

  describe("validateSettings", () => {
    it("returns valid for default settings", () => {
      const result = service.validateSettings(makeSettings());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("detects invalid engine type", () => {
      const result = service.validateSettings(makeSettings({ ocr: { engineType: "unknown" as never } }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_ENGINE_TYPE")).toBe(true);
    });

    it("detects out-of-range confidence threshold", () => {
      const result = service.validateSettings(makeSettings({ ocr: { ocrConfidenceThreshold: -0.1 } }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_CONFIDENCE_THRESHOLD")).toBe(true);
    });

    it("detects invalid theme", () => {
      const result = service.validateSettings(makeSettings({ theme: "blue" as never }));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_THEME")).toBe(true);
    });

    it("detects invalid image retention when enabled", () => {
      const result = service.validateSettings(
        makeSettings({
          imageRetention: { enabled: true, maxAgeDays: 0, maxImages: 0 },
        }),
      );
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === "INVALID_MAX_AGE")).toBe(true);
      expect(result.errors.some((e) => e.code === "INVALID_MAX_IMAGES")).toBe(true);
    });

    it("does not flag image retention when disabled", () => {
      const result = service.validateSettings(
        makeSettings({
          imageRetention: { enabled: false, maxAgeDays: 0, maxImages: 0 },
        }),
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("getOcrEngines", () => {
    it("returns all supported engine types", () => {
      const engines = service.getOcrEngines();
      expect(engines).toContain("paddle");
      expect(engines).toContain("tesseract");
      expect(engines).toContain("mock");
    });
  });

  describe("getSupportedLanguages", () => {
    it("returns supported OCR languages", () => {
      const languages = service.getSupportedLanguages();
      expect(languages).toContain("eng");
      expect(languages).toContain("chi");
      expect(languages).toContain("jpn");
    });
  });

  describe("full lifecycle", () => {
    it("supports multiple update cycles", async () => {
      const store = createInMemorySettingsStore();
      const svc = createSettingsService(store);

      await svc.loadSettings();

      await svc.updateSettings({
        ocr: { engineType: "tesseract", ocrConfidenceThreshold: 0.7 },
      });
      await svc.updateSettings({ theme: "dark" });
      await svc.updateSettings({
        camera: { resolution: { width: 1920, height: 1080 } },
      });
      await svc.updateSettings({
        privacy: { maskDocumentNumberInLogs: false },
      });
      await svc.updateSettings({ language: "chi" });

      await svc.updateSettings({ onboardingCompleted: true });

      const final = svc.getSettings();
      expect(final.ocr.engineType).toBe("tesseract");
      expect(final.ocr.ocrConfidenceThreshold).toBe(0.7);
      expect(final.theme).toBe("dark");
      expect(final.camera.resolution.width).toBe(1920);
      expect(final.camera.resolution.height).toBe(1080);
      expect(final.privacy.maskDocumentNumberInLogs).toBe(false);
      expect(final.language).toBe("chi");
      expect(final.onboardingCompleted).toBe(true);
    });

    it("persists all settings after full lifecycle", async () => {
      const store = createInMemorySettingsStore();
      const svc = createSettingsService(store);

      await svc.loadSettings();
      await svc.updateSettings({
        ocr: { engineType: "tesseract" },
        theme: "dark",
        onboardingCompleted: true,
      });

      const svc2 = createSettingsService(store);
      const reloaded = await svc2.loadSettings();
      expect(reloaded.ocr.engineType).toBe("tesseract");
      expect(reloaded.theme).toBe("dark");
      expect(reloaded.onboardingCompleted).toBe(true);
    });
  });
});
