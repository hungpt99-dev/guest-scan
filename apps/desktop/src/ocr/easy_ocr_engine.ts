import type { OcrEngine, OcrInput, OcrTextResult, OcrTextChunk } from "./ocr_engine";
import { isTauri } from "../lib/isTauri";
import { logger } from "../lib/logger";

const MRZ_VALID_CHARS = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<");

function filterMrzText(text: string): string {
  return text
    .toUpperCase()
    .split("")
    .filter((ch) => MRZ_VALID_CHARS.has(ch))
    .join("");
}

export class EasyOcrEngine implements OcrEngine {
  private initialized = false;
  private available = false;

  async isAvailable(): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.available;
  }

  private async initialize(): Promise<void> {
    this.initialized = true;
    this.available = false;

    if (!isTauri()) {
      logger.debug("EasyOcrEngine: not in Tauri context, marking unavailable");
      return;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/tauri");
      this.available = await invoke<boolean>("check_easyocr_available");
    } catch (error) {
      logger.warn("EasyOcrEngine: availability check failed", error);
      this.available = false;
    }
  }

  async extractText(input: OcrInput): Promise<OcrTextResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.available) {
      throw new Error("EasyOCR engine is not available");
    }

    const { invoke } = await import("@tauri-apps/api/tauri");

    const raw = await invoke<{
      text: string;
      chunks: { text: string; confidence: number }[];
    }>("extract_easyocr_mrz", { imagePath: input.imagePath });

    const lines: OcrTextChunk[] = raw.chunks.map((chunk) => ({
      text: filterMrzText(chunk.text),
      confidence: chunk.confidence,
    }));

    const fullText = lines.map((l) => l.text).join("\n");
    const averageConfidence = lines.length > 0 ? lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length : 0;

    return { lines, fullText, averageConfidence };
  }
}
