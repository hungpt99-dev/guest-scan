import type {
  OcrProvider,
  OcrResult,
  OcrProviderType,
  OcrProcessingStatus,
  GuestRow,
  OcrWarningCode,
} from "@guestfill/shared";
import { getOcrProviderRegistry } from "./provider-factory";
import { runOcrWithFallback } from "./provider-registry";
import type { OcrWithFallbackResult } from "./provider-registry";
import { mapOcrResultToGuestRow, logOcrCompletion } from "./utils/mapping";
import { logger } from "../lib/logger";
import { isTauri } from "../lib/isTauri";

export type OcrControllerState = {
  status: OcrProcessingStatus;
  providerType: OcrProviderType | null;
  ocrResult: OcrResult | null;
  mappedGuest: Partial<GuestRow> | null;
  fieldConfidence: Record<string, number>;
  warnings: OcrWarningCode[];
  error: string | null;
  lastImagePath: string | null;
  usedFallback: boolean;
  fallbackChain: string[];
};

function buildInitialState(): OcrControllerState {
  return {
    status: "IDLE",
    providerType: null,
    ocrResult: null,
    mappedGuest: null,
    fieldConfidence: {},
    warnings: [],
    error: null,
    lastImagePath: null,
    usedFallback: false,
    fallbackChain: [],
  };
}

export class OcrController {
  private state: OcrControllerState = buildInitialState();
  private provider: OcrProvider | null = null;

  /** @internal Accept an optional pre-created provider for testing */
  constructor(private readonly testProvider?: OcrProvider) {}

  getState(): OcrControllerState {
    return { ...this.state };
  }

  async processOcr(
    imagePath: string,
    preferredProvider?: OcrProviderType,
    signal?: AbortSignal,
  ): Promise<{ guest: Partial<GuestRow>; result: OcrResult }> {
    this.state = {
      ...buildInitialState(),
      status: "UPLOADING",
      providerType: preferredProvider ?? null,
      lastImagePath: imagePath,
    };

    try {
      this.state = { ...this.state, status: "PROCESSING" };

      if (signal?.aborted) {
        throw new DOMException("OCR was canceled", "AbortError");
      }

      let result: OcrWithFallbackResult;

      if (this.testProvider) {
        const testResult = await this.testProvider.processImage(imagePath, signal);
        result = {
          result: testResult,
          provider: this.testProvider.type,
          usedFallback: false,
          fallbackChain: [this.testProvider.type],
        };
      } else {
        const registry = getOcrProviderRegistry();
        result = await runOcrWithFallback(imagePath, registry, preferredProvider, signal);
      }

      const mappedGuest = mapOcrResultToGuestRow(result.result);

      const fieldConfidence = this.buildFieldConfidence(result.result.fields);

      this.state = {
        ...this.state,
        status: "COMPLETED",
        providerType: result.provider,
        ocrResult: result.result,
        mappedGuest,
        fieldConfidence,
        warnings: result.result.warnings,
        error: null,
        usedFallback: result.usedFallback,
        fallbackChain: result.fallbackChain,
      };

      logOcrCompletion(result.result, mappedGuest);

      return { guest: mappedGuest, result: result.result };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        this.state = {
          ...this.state,
          status: "IDLE",
          error: "OCR processing was canceled",
        };
        throw error;
      }

      const message = error instanceof Error ? error.message : "OCR processing failed";
      logger.error("OcrController: processing failed", this.sanitizeLogContext({ error: message }));

      this.state = {
        ...this.state,
        status: "FAILED",
        error: message,
      };

      throw error;
    }
  }

  async retryOcr(signal?: AbortSignal): Promise<{ guest: Partial<GuestRow>; result: OcrResult }> {
    const { providerType, lastImagePath } = this.state;

    if (!providerType || !lastImagePath) {
      throw new Error("No previous OCR to retry. Call processOcr first.");
    }

    return this.processOcr(lastImagePath, providerType, signal);
  }

  clearExtractedData(): void {
    this.provider?.cancel?.();
    this.provider = null;
    this.cleanupCurrentImage();
    this.state = buildInitialState();

    logger.info("OcrController: extracted data cleared");
  }

  private async cleanupCurrentImage(): Promise<void> {
    const { lastImagePath } = this.state;
    if (!lastImagePath) return;

    try {
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/tauri");
        await invoke("remove_temp_file", { path: lastImagePath }).catch(() => {
          // File may already be deleted — ignore
        });
      }
    } catch {
      // Cleanup is best-effort; never throw from cleanup
    }
  }

  private isSensitiveLogKey(key: string): boolean {
    return /passport|passportNumber|idNumber|fullName|rawText|mrzCode|dateOfBirth|dob|imagePath|base64Image/i.test(key);
  }

  private sanitizeLogContext(context: Record<string, unknown>): Record<string, unknown> {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      if (this.isSensitiveLogKey(key)) {
        safe[key] = "[REDACTED]";
      } else {
        safe[key] = value;
      }
    }
    return safe;
  }

  private buildFieldConfidence(fields: Record<string, { confidence: number } | undefined>): Record<string, number> {
    const map: Record<string, number> = {};
    for (const [key, field] of Object.entries(fields)) {
      if (field) {
        map[key] = field.confidence;
      }
    }
    return map;
  }
}
