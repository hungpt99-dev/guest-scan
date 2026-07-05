import { logger } from "../lib/logger";
import { invokeIpc } from "../infra/ipc";

export type OcrUseCase = "MRZ" | "VISUAL" | "FALLBACK";

export type OcrOrientationMode = "NONE" | "CLASSIFY" | "CLASSIFY_AND_ROTATE";

export type OcrTextChunk = {
  text: string;
  confidence: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
};

export type OcrProviderResult = {
  lines: OcrTextChunk[];
  fullText: string;
  averageConfidence: number;
  useCase: OcrUseCase;
  orientation?: number;
  usedFallback: boolean;
  engineName: string;
  processingTimeMs: number;
};

export type OcrProviderSettings = {
  language: string;
  confidenceThreshold: number;
  maxImageWidth: number;
  useOrientationClassification: boolean;
  orientationMode: OcrOrientationMode;
  useDocumentCorrection: boolean;
  useImageUnwarping: boolean;
  enableGpu: boolean;
  preprocessingSteps: string[];
};

export type MrzOcrSettings = {
  characterWhitelist: string;
  confidenceThreshold: number;
  preprocessingScale: number;
  enableSharpening: boolean;
  enableDenoising: boolean;
  enableAdaptiveThreshold: boolean;
  enableDeskew: boolean;
  enableContrastEnhancement: boolean;
  enableMultipleVariants: boolean;
  grayscaleOnly: boolean;
};

export type VisualFieldZone = {
  fieldName: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisualOcrSettings = {
  enabled: boolean;
  zoneDefinitions: VisualFieldZone[];
  minOcrConfidence: number;
  fieldSpecificCleaning: boolean;
  enablePreprocessing: boolean;
};

export type FallbackOcrSettings = {
  enabled: boolean;
  engines: string[];
  confidenceThreshold: number;
  preferBetterConfidence: boolean;
};

export const DEFAULT_OCR_PROVIDER_SETTINGS: OcrProviderSettings = {
  language: "eng",
  confidenceThreshold: 0.6,
  maxImageWidth: 2048,
  useOrientationClassification: true,
  orientationMode: "CLASSIFY_AND_ROTATE",
  useDocumentCorrection: true,
  useImageUnwarping: false,
  enableGpu: false,
  preprocessingSteps: ["grayscale", "denoise", "contrast_enhance"],
};

export const DEFAULT_MRZ_OCR_SETTINGS: MrzOcrSettings = {
  characterWhitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<",
  confidenceThreshold: 0.3,
  preprocessingScale: 3,
  enableSharpening: true,
  enableDenoising: true,
  enableAdaptiveThreshold: true,
  enableDeskew: true,
  enableContrastEnhancement: true,
  enableMultipleVariants: true,
  grayscaleOnly: true,
};

export const DEFAULT_VISUAL_OCR_SETTINGS: VisualOcrSettings = {
  enabled: true,
  zoneDefinitions: [
    { fieldName: "surname", label: "Surname", x: 0.05, y: 0.12, width: 0.45, height: 0.06 },
    { fieldName: "givenName", label: "Given Names", x: 0.05, y: 0.19, width: 0.45, height: 0.06 },
    { fieldName: "nationality", label: "Nationality", x: 0.05, y: 0.28, width: 0.25, height: 0.05 },
    { fieldName: "dateOfBirth", label: "Date of Birth", x: 0.05, y: 0.34, width: 0.25, height: 0.05 },
    { fieldName: "gender", label: "Sex", x: 0.35, y: 0.34, width: 0.1, height: 0.05 },
    { fieldName: "placeOfBirth", label: "Place of Birth", x: 0.05, y: 0.4, width: 0.45, height: 0.05 },
    { fieldName: "passportNumber", label: "Passport No.", x: 0.5, y: 0.05, width: 0.4, height: 0.06 },
    { fieldName: "issueDate", label: "Date of Issue", x: 0.5, y: 0.28, width: 0.4, height: 0.05 },
    { fieldName: "expiryDate", label: "Date of Expiry", x: 0.5, y: 0.34, width: 0.4, height: 0.05 },
    { fieldName: "issuingAuthority", label: "Authority", x: 0.5, y: 0.4, width: 0.4, height: 0.05 },
    { fieldName: "idNumber", label: "ID Number", x: 0.05, y: 0.46, width: 0.45, height: 0.05 },
  ],
  minOcrConfidence: 0.5,
  fieldSpecificCleaning: true,
  enablePreprocessing: true,
};

export const DEFAULT_FALLBACK_OCR_SETTINGS: FallbackOcrSettings = {
  enabled: true,
  engines: ["tesseract", "easyocr"],
  confidenceThreshold: 0.4,
  preferBetterConfidence: true,
};

export type OcrDebugInfo = {
  rawText: string;
  cleanedText: string;
  lines: string[];
  averageConfidence: number;
  useCase: OcrUseCase;
  engineName: string;
  usedFallback: boolean;
  processingTimeMs: number;
  preprocessingSteps: string[];
  orientation?: number;
  imagePath: string;
  timestamp: string;
};

export interface OcrProvider {
  extractMrzText(imagePath: string, settings?: Partial<MrzOcrSettings>): Promise<OcrProviderResult>;

  extractVisualField(
    imagePath: string,
    zone: VisualFieldZone,
    settings?: Partial<VisualOcrSettings>,
  ): Promise<OcrProviderResult>;

  extractText(
    imagePath: string,
    useCase?: OcrUseCase,
    settings?: Partial<OcrProviderSettings>,
  ): Promise<OcrProviderResult>;

  isAvailable(): Promise<boolean>;

  getName(): string;

  getDebugInfo(imagePath: string): OcrDebugInfo | undefined;

  clearDebugInfo(): void;
}

type PaddleInvokeResult = {
  text: string;
  chunks: { text: string; confidence: number }[];
  orientation?: number;
};

export type PaddleOcrProviderOptions = {
  tesseractFallback?: { extractText(imagePath: string): Promise<OcrProviderResult> };
  enableFallback: boolean;
  baseSettings: Partial<OcrProviderSettings>;
  mrzSettings: Partial<MrzOcrSettings>;
  visualSettings: Partial<VisualOcrSettings>;
  fallbackSettings: Partial<FallbackOcrSettings>;
  debugMode: boolean;
};

const DEFAULT_PROVIDER_OPTIONS: PaddleOcrProviderOptions = {
  enableFallback: true,
  baseSettings: {},
  mrzSettings: {},
  visualSettings: {},
  fallbackSettings: {},
  debugMode: false,
};

export function createPaddleOcrProvider(options?: Partial<PaddleOcrProviderOptions>): OcrProvider {
  return new PaddleOcrProvider({
    ...DEFAULT_PROVIDER_OPTIONS,
    ...options,
  });
}

class PaddleOcrProvider implements OcrProvider {
  private initialized = false;
  private available = false;
  private options: PaddleOcrProviderOptions;
  private debugStore = new Map<string, OcrDebugInfo>();

  constructor(options: PaddleOcrProviderOptions) {
    this.options = options;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.available;
  }

  getName(): string {
    return "paddleocr";
  }

  async extractMrzText(imagePath: string, settings?: Partial<MrzOcrSettings>): Promise<OcrProviderResult> {
    const startTime = performance.now();
    const mergedSettings: MrzOcrSettings = {
      ...DEFAULT_MRZ_OCR_SETTINGS,
      ...this.options.mrzSettings,
      ...settings,
    };

    await this.ensureAvailable();

    let result: OcrProviderResult;
    let usedFallback = false;

    try {
      result = await this.invokePaddleOcr(imagePath, "MRZ", mergedSettings);
    } catch (error) {
      logger.warn("PaddleOcrProvider: MRZ OCR failed, trying fallback", { error });
      if (this.options.enableFallback && this.options.tesseractFallback) {
        const fallback = await this.options.tesseractFallback.extractText(imagePath);
        result = { ...fallback, useCase: "MRZ", usedFallback: true, engineName: "tesseract" };
        usedFallback = true;
      } else {
        throw error;
      }
    }

    const elapsed = performance.now() - startTime;
    result.processingTimeMs = elapsed;
    result.usedFallback = usedFallback;

    if (this.options.debugMode) {
      this.storeDebugInfo(imagePath, result, "MRZ", mergedSettings);
    }

    return result;
  }

  async extractVisualField(
    imagePath: string,
    zone: VisualFieldZone,
    settings?: Partial<VisualOcrSettings>,
  ): Promise<OcrProviderResult> {
    const startTime = performance.now();
    const mergedSettings: VisualOcrSettings = {
      ...DEFAULT_VISUAL_OCR_SETTINGS,
      ...this.options.visualSettings,
      ...settings,
    };

    await this.ensureAvailable();

    if (!mergedSettings.enabled) {
      return {
        lines: [],
        fullText: "",
        averageConfidence: 0,
        useCase: "VISUAL",
        usedFallback: false,
        engineName: this.getName(),
        processingTimeMs: 0,
      };
    }

    let result: OcrProviderResult;
    let usedFallback = false;

    try {
      result = await this.invokePaddleOcrOnZone(imagePath, zone, mergedSettings);
    } catch (error) {
      logger.warn("PaddleOcrProvider: visual field OCR failed, trying fallback", { field: zone.fieldName, error });
      if (this.options.enableFallback && this.options.tesseractFallback) {
        const fallback = await this.options.tesseractFallback.extractText(imagePath);
        result = { ...fallback, useCase: "VISUAL", usedFallback: true, engineName: "tesseract" };
        usedFallback = true;
      } else {
        throw error;
      }
    }

    result.useCase = "VISUAL";
    result.usedFallback = usedFallback;
    result.processingTimeMs = performance.now() - startTime;

    return result;
  }

  async extractText(
    imagePath: string,
    useCase: OcrUseCase = "FALLBACK",
    settings?: Partial<OcrProviderSettings>,
  ): Promise<OcrProviderResult> {
    const startTime = performance.now();
    const mergedSettings: OcrProviderSettings = {
      ...DEFAULT_OCR_PROVIDER_SETTINGS,
      ...this.options.baseSettings,
      ...settings,
    };

    await this.ensureAvailable();

    let result: OcrProviderResult;
    let usedFallback = false;

    try {
      result = await this.invokePaddleOcrGeneral(imagePath, mergedSettings);
    } catch (error) {
      logger.warn("PaddleOcrProvider: general OCR failed, trying fallback", { error });
      if (this.options.enableFallback && this.options.tesseractFallback) {
        const fallback = await this.options.tesseractFallback.extractText(imagePath);
        result = { ...fallback, useCase, usedFallback: true, engineName: "tesseract" };
        usedFallback = true;
      } else {
        throw error;
      }
    }

    result.useCase = useCase;
    result.usedFallback = usedFallback;
    result.processingTimeMs = performance.now() - startTime;

    return result;
  }

  getDebugInfo(imagePath: string): OcrDebugInfo | undefined {
    return this.debugStore.get(imagePath);
  }

  clearDebugInfo(): void {
    this.debugStore.clear();
  }

  private async initialize(): Promise<void> {
    this.initialized = true;
    this.available = false;

    try {
      this.available = await invokeIpc<boolean>("check_paddleocr_available");
      logger.info("PaddleOcrProvider: initialized", { available: this.available });
    } catch (error) {
      logger.warn("PaddleOcrProvider: initialization failed", error);
      this.available = false;
    }
  }

  private async ensureAvailable(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.available) {
      throw new Error("PaddleOCR provider is not available");
    }
  }

  private async invokePaddleOcr(
    imagePath: string,
    _useCase: OcrUseCase,
    _settings: MrzOcrSettings,
  ): Promise<OcrProviderResult> {
    const raw = await invokeIpc<PaddleInvokeResult>("extract_paddleocr_mrz", {
      imagePath,
      useOrientation: true,
    });

    const lines = raw.chunks.map((chunk) => ({
      text: this.filterMrzChars(chunk.text),
      confidence: chunk.confidence,
    }));

    const fullText = lines.map((l) => l.text).join("\n");
    const averageConfidence = lines.length > 0 ? lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length : 0;

    return {
      lines,
      fullText,
      averageConfidence,
      useCase: "MRZ",
      orientation: raw.orientation,
      usedFallback: false,
      engineName: this.getName(),
      processingTimeMs: 0,
    };
  }

  private async invokePaddleOcrOnZone(
    imagePath: string,
    zone: VisualFieldZone,
    _settings: VisualOcrSettings,
  ): Promise<OcrProviderResult> {
    const raw = await invokeIpc<PaddleInvokeResult>("extract_paddleocr_zone", {
      imagePath,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      zoneName: zone.fieldName,
    });

    const lines = raw.chunks.map((chunk) => ({
      text: chunk.text,
      confidence: chunk.confidence,
      boundingBox: chunk as unknown as { x: number; y: number; width: number; height: number } | undefined,
    }));

    const fullText = lines.map((l) => l.text).join("\n");
    const averageConfidence = lines.length > 0 ? lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length : 0;

    return {
      lines,
      fullText,
      averageConfidence,
      useCase: "VISUAL",
      usedFallback: false,
      engineName: this.getName(),
      processingTimeMs: 0,
    };
  }

  private async invokePaddleOcrGeneral(imagePath: string, settings: OcrProviderSettings): Promise<OcrProviderResult> {
    const raw = await invokeIpc<PaddleInvokeResult>("extract_paddleocr_general", {
      imagePath,
      useOrientation: settings.useOrientationClassification,
      useDocumentCorrection: settings.useDocumentCorrection,
      useImageUnwarping: settings.useImageUnwarping,
    });

    const lines = raw.chunks.map((chunk) => ({
      text: chunk.text,
      confidence: chunk.confidence,
    }));

    const fullText = lines.map((l) => l.text).join("\n");
    const averageConfidence = lines.length > 0 ? lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length : 0;

    return {
      lines,
      fullText,
      averageConfidence,
      useCase: "FALLBACK",
      orientation: raw.orientation,
      usedFallback: false,
      engineName: this.getName(),
      processingTimeMs: 0,
    };
  }

  private filterMrzChars(text: string): string {
    const valid = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<");
    return text
      .toUpperCase()
      .split("")
      .filter((ch) => valid.has(ch))
      .join("");
  }

  private storeDebugInfo(
    imagePath: string,
    result: OcrProviderResult,
    useCase: OcrUseCase,
    settings: MrzOcrSettings | VisualOcrSettings | OcrProviderSettings,
  ): void {
    const preprocessingSteps = "preprocessingSteps" in settings ? settings.preprocessingSteps : [];

    const info: OcrDebugInfo = {
      rawText: result.fullText,
      cleanedText: result.lines.map((l) => l.text).join("\n"),
      lines: result.lines.map((l) => l.text),
      averageConfidence: result.averageConfidence,
      useCase,
      engineName: result.engineName,
      usedFallback: result.usedFallback,
      processingTimeMs: result.processingTimeMs,
      preprocessingSteps: preprocessingSteps as string[],
      orientation: result.orientation,
      imagePath,
      timestamp: new Date().toISOString(),
    };

    this.debugStore.set(imagePath, info);
    logger.debug("PaddleOcrProvider: debug info stored", {
      imagePath: imagePath.replace(/\/[^/]+\.\w+$/, "/***"),
      useCase,
      averageConfidence: result.averageConfidence,
    });
  }
}
