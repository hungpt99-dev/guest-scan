import type { OcrEngine, OcrInput, OcrTextResult, OcrTextChunk } from "./ocr_engine";
import type { TesseractOcrEngine } from "./tesseract_ocr_engine";
import { isTauri } from "../lib/isTauri";
import { logger } from "../lib/logger";

const MRZ_VALID_CHARS = new Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<");

const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;

function filterMrzText(text: string): string {
  return text
    .toUpperCase()
    .split("")
    .filter((ch) => MRZ_VALID_CHARS.has(ch))
    .join("");
}

export type OcrFieldResult = {
  name: string;
  value: string;
  confidence: number;
};

export type OcrFieldResults = {
  fields: OcrFieldResult[];
  averageConfidence: number;
  fullText: string;
  usedFallback: boolean;
};

export class PaddleOcrEngine implements OcrEngine {
  private initialized = false;
  private available = false;
  private readonly tesseractFallback?: TesseractOcrEngine;
  private readonly confidenceThreshold: number;

  constructor(tesseractFallback?: TesseractOcrEngine, confidenceThreshold: number = DEFAULT_CONFIDENCE_THRESHOLD) {
    this.tesseractFallback = tesseractFallback;
    this.confidenceThreshold = confidenceThreshold;
  }

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
      logger.debug("PaddleOcrEngine: not in Tauri context, marking unavailable");
      return;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/tauri");
      this.available = await invoke<boolean>("check_paddleocr_available");
    } catch (error) {
      logger.warn("PaddleOcrEngine: availability check failed", error);
      this.available = false;
    }
  }

  async extractText(input: OcrInput): Promise<OcrTextResult> {
    return this.extractWithFallback(input, false);
  }

  async extractTextWithFields(input: OcrInput): Promise<OcrFieldResults> {
    return this.extractWithFallback(input, true) as Promise<OcrFieldResults>;
  }

  private async extractWithFallback(
    input: OcrInput,
    includeFields: boolean,
  ): Promise<OcrTextResult & Partial<Pick<OcrFieldResults, "fields" | "usedFallback">>> {
    await this.ensureInitialized();

    let paddleResult: OcrTextResult | null = null;
    let paddleError: unknown = null;

    try {
      paddleResult = await this.runPaddleOcr(input);
    } catch (error) {
      paddleError = error;
      logger.warn("PaddleOcrEngine: PaddleOCR failed", { error });
    }

    if (paddleResult && paddleResult.averageConfidence >= this.confidenceThreshold) {
      return this.buildResult(paddleResult, false, includeFields);
    }

    if (paddleResult && paddleResult.averageConfidence < this.confidenceThreshold && this.tesseractFallback) {
      logger.info("PaddleOcrEngine: PaddleOCR confidence below threshold, trying Tesseract fallback", {
        paddleConfidence: paddleResult.averageConfidence,
        threshold: this.confidenceThreshold,
      });

      const fallbackResult = await this.tryTesseractFallback(input, paddleResult);
      if (fallbackResult) {
        return this.buildResult(fallbackResult, true, includeFields);
      }
    }

    if (paddleError && this.tesseractFallback) {
      logger.info("PaddleOcrEngine: falling back to Tesseract after PaddleOCR error");
      const fallbackResult = await this.tryTesseractFallback(input, null);
      if (fallbackResult) {
        return this.buildResult(fallbackResult, true, includeFields);
      }
    }

    if (paddleResult) {
      logger.warn("PaddleOcrEngine: returning PaddleOCR result below threshold, no fallback available", {
        confidence: paddleResult.averageConfidence,
      });
      return this.buildResult(paddleResult, false, includeFields);
    }

    throw paddleError ?? new Error("PaddleOCR engine failed with no error details");
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.available) {
      throw new Error("PaddleOCR engine is not available");
    }
  }

  private async runPaddleOcr(input: OcrInput): Promise<OcrTextResult> {
    const { invoke } = await import("@tauri-apps/api/tauri");

    const raw = await invoke<{
      text: string;
      chunks: { text: string; confidence: number }[];
    }>("extract_paddleocr_mrz", { imagePath: input.imagePath });

    const lines: OcrTextChunk[] = raw.chunks.map((chunk) => ({
      text: filterMrzText(chunk.text),
      confidence: chunk.confidence,
    }));

    const fullText = lines.map((l) => l.text).join("\n");
    const averageConfidence = lines.length > 0 ? lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length : 0;

    return { lines, fullText, averageConfidence };
  }

  private async tryTesseractFallback(
    input: OcrInput,
    currentResult: OcrTextResult | null,
  ): Promise<OcrTextResult | null> {
    try {
      const fallbackResult = await this.tesseractFallback!.extractText(input);
      if (!currentResult || fallbackResult.averageConfidence > currentResult.averageConfidence) {
        logger.info("PaddleOcrEngine: Tesseract fallback produced better result", {
          tesseractConfidence: fallbackResult.averageConfidence,
          previousConfidence: currentResult?.averageConfidence,
        });
        return fallbackResult;
      }
      logger.info("PaddleOcrEngine: Tesseract fallback did not improve confidence, keeping PaddleOCR result", {
        tesseractConfidence: fallbackResult.averageConfidence,
        paddleConfidence: currentResult.averageConfidence,
      });
      return null;
    } catch (fallbackError) {
      logger.warn("PaddleOcrEngine: Tesseract fallback failed", fallbackError);
      return null;
    }
  }

  private buildResult(
    result: OcrTextResult,
    usedFallback: boolean,
    includeFields: boolean,
  ): OcrTextResult & Partial<Pick<OcrFieldResults, "fields" | "usedFallback">> {
    if (!includeFields) {
      return result;
    }

    return {
      ...result,
      fields: this.computeFieldConfidence(result),
      usedFallback,
    };
  }

  /*
   * Compute per-field confidence by mapping MRZ line positions to
   * logical fields. Each MRZ format (TD1/TD2/TD3) has fixed field
   * positions within its lines. We assign the confidence of the line(s)
   * a field belongs to, adjusting for empty or filler characters.
   */
  private computeFieldConfidence(result: OcrTextResult): OcrFieldResult[] {
    const lines = result.lines;
    const fields: OcrFieldResult[] = [];

    if (lines.length === 0) {
      return fields;
    }

    const line1 = lines[0]?.text ?? "";
    const line2 = lines[1]?.text ?? "";
    const line3 = lines[2]?.text ?? "";

    const line1Confidence = lines[0]?.confidence ?? 0;
    const line2Confidence = lines[1]?.confidence ?? 0;
    const line3Confidence = lines[2]?.confidence ?? 0;

    if (line1.length >= 44 && line2.length >= 44) {
      return this.computeTd3Fields(line1, line2, line1Confidence, line2Confidence);
    }
    if (line1.length >= 36 && line2.length >= 36) {
      return this.computeTd2Fields(line1, line2, line1Confidence, line2Confidence);
    }
    if (line1.length >= 30 && line2.length >= 30) {
      return this.computeTd1Fields(line1, line2, line3, line1Confidence, line2Confidence, line3Confidence);
    }

    return fields;
  }

  private computeTd3Fields(line1: string, line2: string, line1Conf: number, line2Conf: number): OcrFieldResult[] {
    const issuingCountry = line1.slice(2, 5).replace(/</g, "");
    const nameField = line1.slice(5, 44);
    const surname = nameField.split("<<")[0]?.replace(/</g, " ").trim() ?? "";
    const givenRaw = nameField.includes("<<") ? nameField.split("<<").slice(1).join("<").replace(/</g, " ").trim() : "";
    const fullName = [surname, givenRaw].filter(Boolean).join(" ");

    const passportNumber = line2.slice(0, 9).replace(/</g, "");
    const nationality = line2.slice(10, 13).replace(/</g, "");
    const dateOfBirth = line2.slice(13, 19);
    const gender = line2[20] ?? "";
    const expiryDate = line2.slice(21, 27);
    const optionalData = line2.slice(28, 42).replace(/</g, "").trim();

    return [
      { name: "issuingCountry", value: issuingCountry, confidence: this.fieldConfidence(issuingCountry, line1Conf) },
      { name: "surname", value: surname, confidence: this.fieldConfidence(surname, line1Conf) },
      { name: "givenName", value: givenRaw, confidence: this.fieldConfidence(givenRaw, line1Conf) },
      { name: "fullName", value: fullName, confidence: this.fieldConfidence(fullName, line1Conf) },
      { name: "passportNumber", value: passportNumber, confidence: this.fieldConfidence(passportNumber, line2Conf) },
      { name: "nationality", value: nationality, confidence: this.fieldConfidence(nationality, line2Conf) },
      { name: "dateOfBirth", value: dateOfBirth, confidence: this.fieldConfidence(dateOfBirth, line2Conf) },
      { name: "gender", value: gender, confidence: this.fieldConfidence(gender, line2Conf) },
      { name: "expiryDate", value: expiryDate, confidence: this.fieldConfidence(expiryDate, line2Conf) },
      { name: "optionalData", value: optionalData, confidence: this.fieldConfidence(optionalData, line2Conf) },
    ];
  }

  private computeTd2Fields(line1: string, line2: string, line1Conf: number, line2Conf: number): OcrFieldResult[] {
    const issuingCountry = line1.slice(2, 5).replace(/</g, "");
    const nameField = line1.slice(5, 36);
    const surname = nameField.split("<<")[0]?.replace(/</g, " ").trim() ?? "";
    const givenRaw = nameField.includes("<<") ? nameField.split("<<").slice(1).join("<").replace(/</g, " ").trim() : "";
    const fullName = [surname, givenRaw].filter(Boolean).join(" ");

    const passportNumber = line2.slice(0, 9).replace(/</g, "");
    const nationality = line2.slice(10, 13).replace(/</g, "");
    const dateOfBirth = line2.slice(13, 19);
    const gender = line2[20] ?? "";
    const expiryDate = line2.slice(21, 27);
    const optionalData = line2.slice(28, 35).replace(/</g, "").trim();

    return [
      { name: "issuingCountry", value: issuingCountry, confidence: this.fieldConfidence(issuingCountry, line1Conf) },
      { name: "surname", value: surname, confidence: this.fieldConfidence(surname, line1Conf) },
      { name: "givenName", value: givenRaw, confidence: this.fieldConfidence(givenRaw, line1Conf) },
      { name: "fullName", value: fullName, confidence: this.fieldConfidence(fullName, line1Conf) },
      { name: "passportNumber", value: passportNumber, confidence: this.fieldConfidence(passportNumber, line2Conf) },
      { name: "nationality", value: nationality, confidence: this.fieldConfidence(nationality, line2Conf) },
      { name: "dateOfBirth", value: dateOfBirth, confidence: this.fieldConfidence(dateOfBirth, line2Conf) },
      { name: "gender", value: gender, confidence: this.fieldConfidence(gender, line2Conf) },
      { name: "expiryDate", value: expiryDate, confidence: this.fieldConfidence(expiryDate, line2Conf) },
      { name: "optionalData", value: optionalData, confidence: this.fieldConfidence(optionalData, line2Conf) },
    ];
  }

  private computeTd1Fields(
    line1: string,
    line2: string,
    line3: string,
    line1Conf: number,
    line2Conf: number,
    line3Conf: number,
  ): OcrFieldResult[] {
    const issuingCountry = line1.slice(2, 5).replace(/</g, "");
    const nameField = line1.slice(5, 30);
    const surname = nameField.split("<<")[0]?.replace(/</g, " ").trim() ?? "";
    const givenRaw = nameField.includes("<<") ? nameField.split("<<").slice(1).join("<").replace(/</g, " ").trim() : "";
    const fullName = [surname, givenRaw].filter(Boolean).join(" ");

    const passportNumber = line2.slice(0, 9).replace(/</g, "");
    const nationality = line2.slice(10, 13).replace(/</g, "");
    const dateOfBirth = line2.slice(13, 19);
    const gender = line2[20] ?? "";
    const expiryDate = line2.slice(21, 27);
    const optionalData = (line2.slice(28, 30) + (line3 ?? "")).replace(/</g, " ").trim();

    const optionalConf = line3 ? (line2Conf + line3Conf) / 2 : line2Conf;

    return [
      { name: "issuingCountry", value: issuingCountry, confidence: this.fieldConfidence(issuingCountry, line1Conf) },
      { name: "surname", value: surname, confidence: this.fieldConfidence(surname, line1Conf) },
      { name: "givenName", value: givenRaw, confidence: this.fieldConfidence(givenRaw, line1Conf) },
      { name: "fullName", value: fullName, confidence: this.fieldConfidence(fullName, line1Conf) },
      { name: "passportNumber", value: passportNumber, confidence: this.fieldConfidence(passportNumber, line2Conf) },
      { name: "nationality", value: nationality, confidence: this.fieldConfidence(nationality, line2Conf) },
      { name: "dateOfBirth", value: dateOfBirth, confidence: this.fieldConfidence(dateOfBirth, line2Conf) },
      { name: "gender", value: gender, confidence: this.fieldConfidence(gender, line2Conf) },
      { name: "expiryDate", value: expiryDate, confidence: this.fieldConfidence(expiryDate, line2Conf) },
      { name: "optionalData", value: optionalData, confidence: this.fieldConfidence(optionalData, optionalConf) },
    ];
  }

  /*
   * Adjust per-field confidence: empty or all-filler fields get a penalty
   * since OCR produced no meaningful characters there.
   */
  private fieldConfidence(value: string, lineConfidence: number): number {
    if (!value || value.replace(/</g, "").trim().length === 0) {
      return Math.max(0, lineConfidence - 0.3);
    }
    return lineConfidence;
  }
}
