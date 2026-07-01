import { logger } from "../lib/logger";
import { parseMrz } from "./mrz_parser";
import type { PaddleOcrEngine } from "./paddle_ocr_engine";
import type { TesseractOcrEngine } from "./tesseract_ocr_engine";
import type { EasyOcrEngine } from "./easy_ocr_engine";

export type OcrInput = {
  imagePath: string;
};

export type OcrTextChunk = {
  text: string;
  confidence: number;
};

export type OcrTextResult = {
  lines: OcrTextChunk[];
  fullText: string;
  averageConfidence: number;
};

export interface OcrEngine {
  extractText(input: OcrInput): Promise<OcrTextResult>;
  isAvailable?(): Promise<boolean>;
}

export type OcrEngineType = "paddle" | "tesseract" | "easyocr";

export type PreprocessingVariant = {
  name: string;
  description: string;
};

export type OcrVariantResult = {
  variantName: string;
  engineType: OcrEngineType;
  result: OcrTextResult;
  mrzValid: boolean;
  mrzFormat: string;
  score: number;
};

export type MultiPassResult = {
  bestResult: OcrVariantResult;
  allResults: OcrVariantResult[];
  engineUsed: OcrEngineType;
  variantUsed: string;
  fallbackTriggered: boolean;
};

export type OcrEngineConfig = {
  primaryEngine: OcrEngineType;
  fallbackEngines: OcrEngineType[];
  confidenceThreshold: number;
  mrzValidationWeight: number;
  confidenceWeight: number;
  variants: PreprocessingVariant[];
};

const DEFAULT_VARIANTS: PreprocessingVariant[] = [
  { name: "standard", description: "Standard preprocessing (CLAHE + denoise + deskew)" },
  { name: "high_contrast", description: "High contrast enhancement" },
  { name: "denoised", description: "Light denoising only" },
  { name: "sharpened", description: "Sharpening emphasis" },
];

const DEFAULT_CONFIG: OcrEngineConfig = {
  primaryEngine: "paddle",
  fallbackEngines: ["tesseract", "easyocr"],
  confidenceThreshold: 0.6,
  mrzValidationWeight: 0.4,
  confidenceWeight: 0.6,
  variants: DEFAULT_VARIANTS,
};

function calculateScore(result: OcrTextResult, mrzValid: boolean, config: OcrEngineConfig): number {
  const confScore = result.averageConfidence * config.confidenceWeight;
  const validationScore = mrzValid ? config.mrzValidationWeight : 0;
  const lineCountBonus = Math.min(result.lines.length / 3, 1) * 0.1;
  return confScore + validationScore + lineCountBonus;
}

export class OcrEngineManager {
  private paddleEngine?: PaddleOcrEngine;
  private tesseractEngine?: TesseractOcrEngine;
  private easyOcrEngine?: EasyOcrEngine;
  private config: OcrEngineConfig;

  constructor(
    paddleEngine?: PaddleOcrEngine,
    tesseractEngine?: TesseractOcrEngine,
    easyOcrEngine?: EasyOcrEngine,
    config?: Partial<OcrEngineConfig>,
  ) {
    this.paddleEngine = paddleEngine;
    this.tesseractEngine = tesseractEngine;
    this.easyOcrEngine = easyOcrEngine;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setConfig(config: Partial<OcrEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private getEngine(type: OcrEngineType): OcrEngine | undefined {
    switch (type) {
      case "paddle":
        return this.paddleEngine;
      case "tesseract":
        return this.tesseractEngine;
      case "easyocr":
        return this.easyOcrEngine;
    }
  }

  async extractText(input: OcrInput): Promise<OcrTextResult> {
    const multiPass = await this.extractWithMultiPass(input);
    return multiPass.bestResult.result;
  }

  async extractWithMultiPass(input: OcrInput): Promise<MultiPassResult> {
    const allResults: OcrVariantResult[] = [];
    let fallbackTriggered = false;

    for (const variant of this.config.variants) {
      const variantResult = await this.tryEngineOnVariant(input, variant, this.config.primaryEngine);
      if (variantResult) {
        allResults.push(variantResult);
      }
    }

    if (allResults.length === 0) {
      for (const fallbackType of this.config.fallbackEngines) {
        fallbackTriggered = true;
        logger.info("OcrEngineManager: primary engine failed, trying fallback", { fallback: fallbackType });

        for (const variant of this.config.variants) {
          const variantResult = await this.tryEngineOnVariant(input, variant, fallbackType);
          if (variantResult) {
            allResults.push(variantResult);
          }
        }

        if (allResults.length > 0) break;
      }
    }

    if (allResults.length === 0) {
      throw new Error("All OCR engines failed to produce a result");
    }

    allResults.sort((a, b) => b.score - a.score);
    const bestResult = allResults[0]!;

    logger.info("OcrEngineManager: selected best result", {
      variant: bestResult.variantName,
      engine: bestResult.engineType,
      score: bestResult.score,
      confidence: bestResult.result.averageConfidence,
      mrzValid: bestResult.mrzValid,
    });

    return {
      bestResult,
      allResults,
      engineUsed: bestResult.engineType,
      variantUsed: bestResult.variantName,
      fallbackTriggered,
    };
  }

  private async tryEngineOnVariant(
    input: OcrInput,
    variant: PreprocessingVariant,
    engineType: OcrEngineType,
  ): Promise<OcrVariantResult | null> {
    const engine = this.getEngine(engineType);
    if (!engine) {
      logger.debug("OcrEngineManager: engine not configured", { engineType });
      return null;
    }

    if (engine.isAvailable) {
      const available = await engine.isAvailable();
      if (!available) {
        logger.debug("OcrEngineManager: engine not available", { engineType });
        return null;
      }
    }

    try {
      const result = await engine.extractText(input);
      if (!result || result.lines.length === 0) {
        logger.debug("OcrEngineManager: empty result from engine", { engineType, variant: variant.name });
        return null;
      }

      const mrzResult = parseMrz(result.lines.map((l) => l.text));
      const mrzFormat = mrzResult.format;
      const mrzValid = mrzResult.overallValid;
      const score = calculateScore(result, mrzValid, this.config);

      return {
        variantName: variant.name,
        engineType,
        result,
        mrzValid,
        mrzFormat: mrzFormat === "UNKNOWN" ? "none" : mrzFormat,
        score,
      };
    } catch (error) {
      logger.debug("OcrEngineManager: engine failed on variant", {
        engineType,
        variant: variant.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async extractWithAllEngines(input: OcrInput): Promise<OcrVariantResult[]> {
    const allResults: OcrVariantResult[] = [];
    const engineTypes: OcrEngineType[] = [this.config.primaryEngine, ...this.config.fallbackEngines];

    const seen = new Set<string>();

    for (const engineType of engineTypes) {
      for (const variant of this.config.variants) {
        const key = `${engineType}:${variant.name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const result = await this.tryEngineOnVariant(input, variant, engineType);
        if (result) {
          allResults.push(result);
        }
      }
    }

    allResults.sort((a, b) => b.score - a.score);
    return allResults;
  }
}
