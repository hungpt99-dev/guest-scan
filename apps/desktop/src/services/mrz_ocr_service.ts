import type { MrzCropResult, MrzPreprocessingVariant } from "./mrz_cropper";
import type { OcrEngine, OcrInput, OcrTextResult } from "../ocr/ocr_engine";
import { PaddleOcrEngine } from "../ocr/paddle_ocr_engine";
import { TesseractOcrEngine } from "../ocr/tesseract_ocr_engine";
import type { MrzParserService, MrzParseResult } from "./mrz_parser_service";
import { createMrzParserService } from "./mrz_parser_service";
import { logger } from "../lib/logger";
import { maskPassportNumber } from "@guestfill/shared";

const MRZ_VALID_CHARS_PATTERN = /[^ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<]/g;

export type MrzOcrVariantResult = {
  variantName: string;
  rawText: string;
  cleanedText: string;
  lines: string[];
  averageConfidence: number;
  mrzParseResult: MrzParseResult;
  validationScore: number;
  totalScore: number;
};

export type MrzOcrResult = {
  bestResult: MrzOcrVariantResult;
  allResults: MrzOcrVariantResult[];
  engineUsed: string;
  mrzDetected: boolean;
};

export type MrzOcrServiceOptions = {
  confidenceThreshold?: number;
  validationWeight?: number;
  confidenceWeight?: number;
};

const DEFAULT_OPTIONS: Required<MrzOcrServiceOptions> = {
  confidenceThreshold: 0.3,
  validationWeight: 0.5,
  confidenceWeight: 0.5,
};

export interface MrzOcrService {
  runMrzOcrVariants(input: MrzCropResult): Promise<MrzOcrResult>;
}

export function createMrzOcrService(
  paddleOcr?: OcrEngine,
  tesseractOcr?: OcrEngine,
  mrzParser?: MrzParserService,
  options?: MrzOcrServiceOptions,
): MrzOcrService {
  return new DefaultMrzOcrService(
    paddleOcr ?? new PaddleOcrEngine(),
    tesseractOcr ?? new TesseractOcrEngine(),
    mrzParser ?? createMrzParserService(),
    { ...DEFAULT_OPTIONS, ...options },
  );
}

class DefaultMrzOcrService implements MrzOcrService {
  private paddleOcr: OcrEngine;
  private tesseractOcr: OcrEngine;
  private mrzParser: MrzParserService;
  private options: Required<MrzOcrServiceOptions>;

  constructor(
    paddleOcr: OcrEngine,
    tesseractOcr: OcrEngine,
    mrzParser: MrzParserService,
    options: Required<MrzOcrServiceOptions>,
  ) {
    this.paddleOcr = paddleOcr;
    this.tesseractOcr = tesseractOcr;
    this.mrzParser = mrzParser;
    this.options = options;
  }

  async runMrzOcrVariants(input: MrzCropResult): Promise<MrzOcrResult> {
    const variantResults: MrzOcrVariantResult[] = [];

    for (const variant of input.variants) {
      try {
        const result = await this.runOcrOnVariant(variant);
        if (result) {
          variantResults.push(result);
          logger.debug("MrzOcrService: variant OCR complete", {
            variant: variant.name,
            confidence: result.averageConfidence,
            validationScore: result.validationScore,
            totalScore: result.totalScore,
            passportNumber: maskPassportNumber(result.mrzParseResult.passportNumber),
          });
        }
      } catch (error) {
        logger.warn("MrzOcrService: variant OCR failed", {
          variant: variant.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (variantResults.length === 0 && input.detected) {
      try {
        const fallbackResult = await this.runOcrOnImage(input.croppedImagePath, "cropped_fallback");
        if (fallbackResult) {
          variantResults.push(fallbackResult);
        }
      } catch (error) {
        logger.warn("MrzOcrService: fallback OCR on cropped image failed", error);
      }
    }

    variantResults.sort((a, b) => b.totalScore - a.totalScore);

    const bestResult = variantResults[0] ?? this.emptyVariantResult();
    const mrzDetected =
      bestResult.mrzParseResult.passportNumber.length > 0 || bestResult.mrzParseResult.surname.length > 0;

    logger.info("MrzOcrService: selected best variant", {
      variant: bestResult.variantName,
      totalScore: bestResult.totalScore,
      confidence: bestResult.averageConfidence,
      validationScore: bestResult.validationScore,
      mrzDetected,
      format: bestResult.mrzParseResult.mrzLines.length > 0 ? "TD3" : "UNKNOWN",
      variantsProcessed: variantResults.length,
      maskedPassport: maskPassportNumber(bestResult.mrzParseResult.passportNumber),
    });

    return {
      bestResult,
      allResults: variantResults,
      engineUsed: "paddle",
      mrzDetected,
    };
  }

  private async runOcrOnVariant(variant: MrzPreprocessingVariant): Promise<MrzOcrVariantResult | null> {
    return this.runOcrOnImage(variant.imagePath, variant.name);
  }

  private async runOcrOnImage(imagePath: string, name: string): Promise<MrzOcrVariantResult | null> {
    const ocrInput: OcrInput = { imagePath };

    let ocrResult: OcrTextResult;
    let engineUsed = "paddle";

    try {
      ocrResult = await this.paddleOcr.extractText(ocrInput);
    } catch {
      logger.info("MrzOcrService: PaddleOCR failed for variant, trying Tesseract", {
        variant: name,
      });
      try {
        ocrResult = await this.tesseractOcr.extractText(ocrInput);
        engineUsed = "tesseract";
      } catch {
        logger.warn("MrzOcrService: all OCR engines failed for variant", {
          variant: name,
        });
        return null;
      }
    }

    if (ocrResult.averageConfidence < this.options.confidenceThreshold) {
      logger.debug("MrzOcrService: OCR confidence below threshold for variant", {
        variant: name,
        confidence: ocrResult.averageConfidence,
        threshold: this.options.confidenceThreshold,
      });
    }

    const rawText = ocrResult.fullText;
    const lines = ocrResult.lines.map((l) => this.cleanMrzText(l.text));
    const cleanedText = lines.join("\n");
    const averageConfidence = ocrResult.averageConfidence;

    const mrzParseResult = this.mrzParser.parseMrzLines(lines);
    const validationScore = this.calculateValidationScore(mrzParseResult);
    const totalScore = this.calculateTotalScore(averageConfidence, validationScore);

    return {
      variantName: `${name}_${engineUsed}`,
      rawText,
      cleanedText,
      lines,
      averageConfidence,
      mrzParseResult,
      validationScore,
      totalScore,
    };
  }

  private cleanMrzText(text: string): string {
    return text.toUpperCase().replace(MRZ_VALID_CHARS_PATTERN, "").trim();
  }

  private calculateValidationScore(parseResult: MrzParseResult): number {
    const checkDigits = parseResult.checkDigits;
    if (!checkDigits || Object.keys(checkDigits).length === 0) return 0;

    const validCount = Object.values(checkDigits).filter(Boolean).length;
    const totalCount = Object.values(checkDigits).length;

    if (totalCount === 0) return 0;
    return validCount / totalCount;
  }

  private calculateTotalScore(confidence: number, validationScore: number): number {
    return confidence * this.options.confidenceWeight + validationScore * this.options.validationWeight;
  }

  private emptyVariantResult(): MrzOcrVariantResult {
    const empty = this.mrzParser.parseMrzLines([]);
    return {
      variantName: "none",
      rawText: "",
      cleanedText: "",
      lines: [],
      averageConfidence: 0,
      mrzParseResult: empty,
      validationScore: 0,
      totalScore: 0,
    };
  }
}
