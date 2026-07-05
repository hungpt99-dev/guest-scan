import type { OcrProviderType, OcrResult, OcrProcessingOptions } from "@guestfill/shared";
import { logger } from "../../../lib/logger";
import { envConfig } from "../../../config/env";

export interface OcrProviderAdapter {
  readonly name: string;
  readonly type: OcrProviderType;

  processImage(imagePath: string, signal?: AbortSignal): Promise<OcrResult>;
  cancel?(): void;
  isAvailable(): boolean;
}

export type OcrProviderFactory = () => OcrProviderAdapter;

class OcrProviderRegistry {
  private providers = new Map<OcrProviderType, OcrProviderFactory>();
  private instances = new Map<OcrProviderType, OcrProviderAdapter>();

  register(type: OcrProviderType, factory: OcrProviderFactory): void {
    if (this.providers.has(type)) {
      logger.warn(`OcrProviderRegistry: provider "${type}" already registered, overwriting`);
    }
    this.providers.set(type, factory);
    logger.info(`OcrProviderRegistry: registered provider "${type}"`);
  }

  getProvider(type: OcrProviderType): OcrProviderAdapter {
    const existing = this.instances.get(type);
    if (existing) return existing;

    const factory = this.providers.get(type);
    if (!factory) {
      throw new Error(`OcrProviderRegistry: no provider registered for type "${type}"`);
    }

    const instance = factory();
    this.instances.set(type, instance);
    return instance;
  }

  getAvailableTypes(): OcrProviderType[] {
    return Array.from(this.providers.keys());
  }

  hasProvider(type: OcrProviderType): boolean {
    return this.providers.has(type);
  }

  async process(options: OcrProcessingOptions): Promise<OcrResult> {
    const provider = this.getProvider(options.provider);
    const startTime = performance.now();

    options.onStatusChange?.("UPLOADING");

    if (!provider.isAvailable()) {
      throw new Error(`OcrProviderRegistry: provider "${options.provider}" is not available`);
    }

    options.onStatusChange?.("PROCESSING");

    try {
      const result = await provider.processImage(options.imagePath, options.signal);
      const elapsed = performance.now() - startTime;

      logger.info("OcrProviderRegistry: processing completed", {
        provider: options.provider,
        processingTimeMs: Math.round(elapsed),
        overallConfidence: result.overallConfidence,
        warnings: result.warnings.length,
      });

      options.onStatusChange?.("COMPLETED");
      return {
        ...result,
        processingTimeMs: (result.processingTimeMs ?? 0) + Math.round(elapsed),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Processing failed";
      logger.error("OcrProviderRegistry: processing failed", {
        provider: options.provider,
        message,
      });
      options.onStatusChange?.("FAILED");
      throw error;
    }
  }

  clearInstances(): void {
    this.instances.clear();
    logger.debug("OcrProviderRegistry: cleared cached instances");
  }
}

export const ocrProviderRegistry = new OcrProviderRegistry();

export function processWithFallback(
  primary: OcrProviderType,
  fallback: OcrProviderType,
  imagePath: string,
  signal?: AbortSignal,
): Promise<OcrResult> {
  const tryProvider = async (type: OcrProviderType): Promise<OcrResult> => {
    const provider = ocrProviderRegistry.getProvider(type);
    return provider.processImage(imagePath, signal);
  };

  return tryProvider(primary).catch((error) => {
    logger.warn(`OcrProviderRegistry: primary provider "${primary}" failed, trying fallback "${fallback}"`, {
      error: error instanceof Error ? error.message : String(error),
    });

    if (envConfig.isDevelopment) {
      logger.debug("OcrProviderRegistry: fallback suppressed in development mode for debugging");
      throw error;
    }

    return tryProvider(fallback);
  });
}
