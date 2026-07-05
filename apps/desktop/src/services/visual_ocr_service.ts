import { isTauri } from "../lib/isTauri";
import { invokeIpc } from "../infra/ipc";
import { logger } from "../lib/logger";
import type { OcrEngine, OcrInput, OcrTextResult } from "../ocr/ocr_engine";
import { PaddleOcrEngine } from "../ocr/paddle_ocr_engine";
import { TesseractOcrEngine } from "../ocr/tesseract_ocr_engine";
import { maskPassportNumber, maskFullName } from "@guestfill/shared";

export type VisualFieldZone = {
  fieldName: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const DEFAULT_PASSPORT_VISUAL_ZONES: VisualFieldZone[] = [
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
];

export type VisualFieldResult = {
  fieldName: string;
  value: string;
  rawValue: string;
  confidence: number;
  source: "visual_ocr" | "mrz" | "mrz_repaired" | "merged";
  croppedImagePath?: string;
};

export type FieldConflictInfo = {
  fieldName: string;
  mrzValue: string;
  visualValue: string;
  resolvedValue: string;
  resolvedFrom: VisualFieldResult["source"];
  confidence: number;
  hasConflict: boolean;
};

export type VisualOcrResult = {
  fieldResults: VisualFieldResult[];
  fieldConflicts: FieldConflictInfo[];
  visualConfidence: number;
  warnings: string[];
  hasConflicts: boolean;
};

export type VisualOcrServiceOptions = {
  enabled: boolean;
  zoneDefinitions: VisualFieldZone[];
  minOcrConfidence: number;
};

const DEFAULT_OPTIONS: VisualOcrServiceOptions = {
  enabled: true,
  zoneDefinitions: DEFAULT_PASSPORT_VISUAL_ZONES,
  minOcrConfidence: 0.5,
};

const JPEG_SAVE_QUALITY = 0.92;

export interface VisualOcrService {
  runVisualOcr(
    correctedImagePath: string,
    mrzValues: Record<string, string>,
    mrzCheckDigits: Record<string, boolean>,
  ): Promise<VisualOcrResult>;
}

export function createVisualOcrService(
  paddleOcr?: OcrEngine,
  tesseractOcr?: OcrEngine,
  options?: Partial<VisualOcrServiceOptions>,
): VisualOcrService {
  return new DefaultVisualOcrService(paddleOcr ?? new PaddleOcrEngine(), tesseractOcr ?? new TesseractOcrEngine(), {
    ...DEFAULT_OPTIONS,
    ...options,
  });
}

class DefaultVisualOcrService implements VisualOcrService {
  private paddleOcr: OcrEngine;
  private tesseractOcr: OcrEngine;
  private options: VisualOcrServiceOptions;

  constructor(paddleOcr: OcrEngine, tesseractOcr: OcrEngine, options: VisualOcrServiceOptions) {
    this.paddleOcr = paddleOcr;
    this.tesseractOcr = tesseractOcr;
    this.options = options;
  }

  async runVisualOcr(
    correctedImagePath: string,
    mrzValues: Record<string, string>,
    mrzCheckDigits: Record<string, boolean>,
  ): Promise<VisualOcrResult> {
    if (!this.options.enabled) {
      logger.info("VisualOcrService: visual OCR is disabled");
      return {
        fieldResults: [],
        fieldConflicts: [],
        visualConfidence: 0,
        warnings: [],
        hasConflicts: false,
      };
    }

    logger.info("VisualOcrService: running visual zone OCR", {
      zoneCount: this.options.zoneDefinitions.length,
      imagePath: correctedImagePath.replace(/\/[^/]+\.\w+$/, "/***"),
    });

    const regionResults: Array<{ result: VisualFieldResult; cropPath: string }> = [];
    const warnings: string[] = [];

    for (const zone of this.options.zoneDefinitions) {
      try {
        const cropPath = await this.cropVisualZone(correctedImagePath, zone);
        if (!cropPath) {
          logger.debug("VisualOcrService: zone crop failed, skipping", { field: zone.fieldName });
          continue;
        }

        const ocrResult = await this.runOcrOnCrop(cropPath, zone.fieldName);
        if (!ocrResult) {
          logger.debug("VisualOcrService: OCR failed for zone", { field: zone.fieldName });
          continue;
        }

        const cleanedValue = this.cleanVisualOcrText(ocrResult.fullText, zone.fieldName);
        const confidence = ocrResult.averageConfidence;

        regionResults.push({
          result: {
            fieldName: zone.fieldName,
            value: cleanedValue,
            rawValue: ocrResult.fullText,
            confidence,
            source: "visual_ocr",
            croppedImagePath: cropPath,
          },
          cropPath,
        });

        logger.debug("VisualOcrService: zone OCR complete", {
          field: zone.fieldName,
          value: this.maskFieldValue(zone.fieldName, cleanedValue),
          confidence,
        });
      } catch (error) {
        logger.warn("VisualOcrService: error processing zone", {
          field: zone.fieldName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (regionResults.length === 0) {
      warnings.push("LOW_CONFIDENCE_FIELD");
    }

    const fieldResults = regionResults.map((r) => r.result);
    const fieldConflicts = this.resolveConflicts(fieldResults, mrzValues, mrzCheckDigits);
    const hasConflicts = fieldConflicts.some((c) => c.hasConflict);
    const resolved = this.applyResolvedValues(fieldResults, fieldConflicts);

    if (hasConflicts) {
      warnings.push("VISUAL_MRZ_CONFLICT");
    }

    const visualConfidence = this.calculateVisualConfidence(resolved, mrzCheckDigits);

    logger.info("VisualOcrService: visual OCR complete", {
      fieldsExtracted: resolved.length,
      conflictsFound: fieldConflicts.filter((c) => c.hasConflict).length,
      visualConfidence,
      hasConflicts,
    });

    return {
      fieldResults: resolved,
      fieldConflicts,
      visualConfidence,
      warnings,
      hasConflicts,
    };
  }

  private async cropVisualZone(imagePath: string, zone: VisualFieldZone): Promise<string | null> {
    if (isTauri()) {
      return this.cropViaTauri(imagePath, zone);
    }
    return this.cropViaCanvas(imagePath, zone);
  }

  private async cropViaTauri(imagePath: string, zone: VisualFieldZone): Promise<string | null> {
    try {
      const result = await invokeIpc<string>("crop_visual_zone", {
        imagePath,
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
        zoneName: zone.fieldName,
      });
      return result;
    } catch (error) {
      logger.warn("VisualOcrService: Tauri crop failed for zone", {
        field: zone.fieldName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async cropViaCanvas(imagePath: string, zone: VisualFieldZone): Promise<string | null> {
    try {
      const img = await this.loadImage(imagePath);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        logger.warn("VisualOcrService: failed to get canvas context for zone crop");
        return null;
      }

      const cropX = Math.round(zone.x * img.width);
      const cropY = Math.round(zone.y * img.height);
      const cropW = Math.round(zone.width * img.width);
      const cropH = Math.round(zone.height * img.height);

      canvas.width = cropW;
      canvas.height = cropH;

      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      return await this.saveCanvasToFile(canvas, `visual_${zone.fieldName}`);
    } catch (error) {
      logger.warn("VisualOcrService: canvas crop failed", {
        field: zone.fieldName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private loadImage(imagePath: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${imagePath}`));
      img.src = imagePath;
    });
  }

  private saveCanvasToFile(canvas: HTMLCanvasElement, _prefix: string): Promise<string> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create blob from canvas"));
            return;
          }
          const url = URL.createObjectURL(blob);
          resolve(url);
        },
        "image/jpeg",
        JPEG_SAVE_QUALITY,
      );
    });
  }

  private async runOcrOnCrop(cropPath: string, fieldName: string): Promise<OcrTextResult | null> {
    const ocrInput: OcrInput = { imagePath: cropPath };

    try {
      return await this.paddleOcr.extractText(ocrInput);
    } catch {
      logger.debug("VisualOcrService: PaddleOCR failed for zone, trying Tesseract", { field: fieldName });
      try {
        return await this.tesseractOcr.extractText(ocrInput);
      } catch {
        logger.warn("VisualOcrService: all OCR engines failed for zone", { field: fieldName });
        return null;
      }
    }
  }

  private cleanVisualOcrText(text: string, fieldName: string): string {
    let cleaned = text.trim();

    cleaned = cleaned.replace(/\s+/g, " ").trim();

    switch (fieldName) {
      case "surname":
      case "givenName":
      case "placeOfBirth":
      case "issuingAuthority":
        cleaned = cleaned.replace(/[^A-Za-zÀ-ÖØ-öø-ÿĀ-ɏ\s'-]/g, "").trim();
        break;
      case "passportNumber":
      case "idNumber":
        cleaned = cleaned.toUpperCase().replace(/[^A-Z0-9]/g, "");
        break;
      case "nationality":
      case "issuingCountry":
        cleaned = cleaned
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 3);
        break;
      case "dateOfBirth":
      case "issueDate":
      case "expiryDate":
        cleaned = cleaned.replace(/[^0-9\-/]/g, "").trim();
        break;
      case "gender":
        cleaned = cleaned
          .toUpperCase()
          .replace(/[^MFX]/g, "")
          .slice(0, 1);
        break;
      default:
        cleaned = cleaned.replace(/[^\w\s-]/g, "").trim();
        break;
    }

    return cleaned;
  }

  private resolveConflicts(
    visualResults: VisualFieldResult[],
    mrzValues: Record<string, string>,
    mrzCheckDigits: Record<string, boolean>,
  ): FieldConflictInfo[] {
    const conflicts: FieldConflictInfo[] = [];

    for (const visual of visualResults) {
      const mrzValue = mrzValues[visual.fieldName] || "";
      if (!mrzValue) {
        conflicts.push({
          fieldName: visual.fieldName,
          mrzValue: "",
          visualValue: visual.value,
          resolvedValue: visual.value,
          resolvedFrom: "visual_ocr",
          confidence: visual.confidence,
          hasConflict: false,
        });
        continue;
      }

      const mrzCheckDigitKey = this.mrzFieldToCheckDigitKey(visual.fieldName);
      const checkDigitValid = mrzCheckDigitKey ? mrzCheckDigits[mrzCheckDigitKey] === true : false;

      const visualNormalized = visual.value.toUpperCase().trim();
      const mrzNormalized = mrzValue.toUpperCase().trim();

      const match = visualNormalized === mrzNormalized;

      if (match) {
        conflicts.push({
          fieldName: visual.fieldName,
          mrzValue,
          visualValue: visual.value,
          resolvedValue: mrzValue,
          resolvedFrom: "mrz",
          confidence: checkDigitValid ? 0.98 : 0.88,
          hasConflict: false,
        });
      } else {
        const mrzIsValid = mrzValue.length > 0;
        const preferMrz = mrzIsValid && (checkDigitValid || visual.confidence < 0.6);

        if (preferMrz) {
          const source = checkDigitValid ? "mrz" : "mrz_repaired";
          conflicts.push({
            fieldName: visual.fieldName,
            mrzValue,
            visualValue: visual.value,
            resolvedValue: mrzValue,
            resolvedFrom: source,
            confidence: checkDigitValid ? 0.95 : 0.85,
            hasConflict: true,
          });
        } else {
          conflicts.push({
            fieldName: visual.fieldName,
            mrzValue,
            visualValue: visual.value,
            resolvedValue: visual.value,
            resolvedFrom: "visual_ocr",
            confidence: visual.confidence,
            hasConflict: visual.confidence < 0.7,
          });
        }
      }
    }

    for (const [fieldName, mrzValue] of Object.entries(mrzValues)) {
      if (!mrzValue) continue;
      const alreadyInConflict = conflicts.some((c) => c.fieldName === fieldName);
      if (!alreadyInConflict) {
        conflicts.push({
          fieldName,
          mrzValue,
          visualValue: "",
          resolvedValue: mrzValue,
          resolvedFrom: "mrz",
          confidence: 0.95,
          hasConflict: false,
        });
      }
    }

    return conflicts;
  }

  private mrzFieldToCheckDigitKey(fieldName: string): string {
    const map: Record<string, string> = {
      passportNumber: "passport_number_valid",
      dateOfBirth: "date_of_birth_valid",
      expiryDate: "expiry_date_valid",
      idNumber: "optional_data_valid",
    };
    return map[fieldName] || "";
  }

  private applyResolvedValues(
    fieldResults: VisualFieldResult[],
    fieldConflicts: FieldConflictInfo[],
  ): VisualFieldResult[] {
    const conflictMap = new Map<string, FieldConflictInfo>();
    for (const conflict of fieldConflicts) {
      conflictMap.set(conflict.fieldName, conflict);
    }

    const seen = new Set<string>();
    const resolved: VisualFieldResult[] = [];

    for (const result of fieldResults) {
      const conflict = conflictMap.get(result.fieldName);
      if (conflict) {
        resolved.push({
          fieldName: result.fieldName,
          value: conflict.resolvedValue,
          rawValue: result.rawValue,
          confidence: conflict.confidence,
          source: conflict.resolvedFrom,
          croppedImagePath: result.croppedImagePath,
        });
        seen.add(result.fieldName);
      } else {
        resolved.push(result);
        seen.add(result.fieldName);
      }
    }

    for (const [fieldName, conflict] of conflictMap) {
      if (!seen.has(fieldName) && conflict.resolvedValue) {
        resolved.push({
          fieldName: conflict.fieldName,
          value: conflict.resolvedValue,
          rawValue: "",
          confidence: conflict.confidence,
          source: conflict.resolvedFrom,
        });
      }
    }

    return resolved;
  }

  private calculateVisualConfidence(resolved: VisualFieldResult[], mrzCheckDigits: Record<string, boolean>): number {
    if (resolved.length === 0) return 0;

    const mrzSources = resolved.filter((r) => r.source === "mrz");
    const mrzRepairedSources = resolved.filter((r) => r.source === "mrz_repaired");
    const visualSources = resolved.filter((r) => r.source === "visual_ocr");

    const mrzScore = mrzSources.length * 1.0 + mrzRepairedSources.length * 0.8;
    const visualScore = visualSources.reduce((sum, r) => sum + r.confidence, 0);

    const checkDigitBonus = Object.values(mrzCheckDigits).filter(Boolean).length * 0.05;

    const total = mrzScore + visualScore * 0.5 + checkDigitBonus;
    const maxScore = resolved.length * 1.0 + checkDigitBonus;

    return Math.min(1, Math.max(0, total / (maxScore || 1)));
  }

  private maskFieldValue(fieldName: string, value: string): string {
    if (fieldName === "passportNumber" || fieldName === "idNumber") {
      return maskPassportNumber(value);
    }
    if (fieldName === "surname" || fieldName === "givenName") {
      return maskFullName(value);
    }
    return value;
  }
}
