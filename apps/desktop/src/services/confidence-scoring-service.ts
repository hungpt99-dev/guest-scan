import type { OcrTextResult } from "../ocr/ocr_engine";
import type { NormalizedFields } from "./field_normalization_service";
import type { ImageQualityResult, ImageQualityWarning } from "./image_quality_service";
import type { ConfidenceLevel } from "@guestfill/shared";
import { createOcrConfidenceService, type OcrConfidenceService } from "./ocr_confidence_service";
import { logger } from "../lib/logger";

import type { FieldConfidenceScores } from "./ocr_confidence_service";
export type { FieldConfidenceScore, FieldConfidenceScores } from "./ocr_confidence_service";

export interface ConfidenceScoringService {
  calculateFieldScores(
    fields: NormalizedFields,
    rawOcrResult: OcrTextResult,
    qualityResult: ImageQualityResult,
    checkDigits?: Record<string, boolean>,
  ): FieldConfidenceScores;

  identifyLowConfidenceFields(scores: FieldConfidenceScores): string[];
}

const HIGH_THRESHOLD = 0.85;
const MEDIUM_THRESHOLD = 0.6;

const QUALITY_PENALTIES: Record<ImageQualityWarning, number> = {
  BLURRY: 0.15,
  TOO_DARK: 0.1,
  TOO_BRIGHT: 0.1,
  LOW_CONTRAST: 0.05,
  GLARE_DETECTED: 0.15,
  SKEWED: 0.08,
  LOW_RESOLUTION: 0.12,
  EDGES_NOT_VISIBLE: 0.1,
};

const QUALITY_PENALTY_CAP = 0.3;

const QUALITY_FIELD_IMPACT: Partial<Record<keyof FieldConfidenceScores, ImageQualityWarning[]>> = {
  fullName: ["BLURRY", "SKEWED"],
  firstName: ["BLURRY", "SKEWED"],
  lastName: ["BLURRY", "SKEWED"],
  gender: ["BLURRY"],
  dateOfBirth: ["BLURRY", "LOW_CONTRAST"],
  nationality: ["BLURRY", "LOW_CONTRAST"],
  countryCode: ["BLURRY", "LOW_CONTRAST"],
  documentType: ["BLURRY", "SKEWED"],
  documentNumber: ["BLURRY", "LOW_RESOLUTION", "LOW_CONTRAST"],
  passportNumber: ["BLURRY", "LOW_RESOLUTION", "LOW_CONTRAST"],
  idNumber: ["BLURRY", "LOW_RESOLUTION"],
  issueDate: ["BLURRY", "LOW_CONTRAST"],
  expiryDate: ["BLURRY", "LOW_CONTRAST"],
  issuingCountry: ["BLURRY", "LOW_CONTRAST"],
  mrzRaw: ["BLURRY", "SKEWED", "LOW_RESOLUTION", "GLARE_DETECTED"],
};

const FIELD_QUALITY_WARNING_LABELS: Record<ImageQualityWarning, string> = {
  BLURRY: "Image is blurry",
  TOO_DARK: "Image is too dark",
  TOO_BRIGHT: "Image is too bright",
  LOW_CONTRAST: "Image has low contrast",
  GLARE_DETECTED: "Glare or reflection detected on image",
  SKEWED: "Document is skewed or rotated",
  LOW_RESOLUTION: "Image resolution is below recommended minimum",
  EDGES_NOT_VISIBLE: "Document edges are not fully visible",
};

function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= HIGH_THRESHOLD) return "HIGH";
  if (score >= MEDIUM_THRESHOLD) return "MEDIUM";
  return "LOW";
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

function calculateQualityPenalty(warnings: ImageQualityWarning[]): number {
  if (warnings.length === 0) return 0;

  const total = warnings.reduce((sum, w) => sum + (QUALITY_PENALTIES[w] ?? 0), 0);

  return Math.min(total, QUALITY_PENALTY_CAP);
}

function buildQualityIssuesForField(field: keyof FieldConfidenceScores, warnings: ImageQualityWarning[]): string[] {
  const relevantWarnings = QUALITY_FIELD_IMPACT[field];
  if (!relevantWarnings) return [];

  const issues: string[] = [];
  for (const warning of warnings) {
    if (relevantWarnings.includes(warning)) {
      issues.push(FIELD_QUALITY_WARNING_LABELS[warning]);
    }
  }
  return issues;
}

const LOW_CONFIDENCE_LEVELS: ConfidenceLevel[] = ["LOW", "MEDIUM"];

export function createConfidenceScoringService(ocrConfidenceService?: OcrConfidenceService): ConfidenceScoringService {
  return new DefaultConfidenceScoringService(ocrConfidenceService ?? createOcrConfidenceService());
}

class DefaultConfidenceScoringService implements ConfidenceScoringService {
  constructor(private readonly ocrConfidenceService: OcrConfidenceService) {}

  calculateFieldScores(
    fields: NormalizedFields,
    rawOcrResult: OcrTextResult,
    qualityResult: ImageQualityResult,
    checkDigits?: Record<string, boolean>,
  ): FieldConfidenceScores {
    const baseScores = this.ocrConfidenceService.calculateConfidence(fields, rawOcrResult, checkDigits);

    const { warnings, metrics } = qualityResult;

    if (warnings.length === 0) {
      logger.debug("ConfidenceScoringService: no quality warnings, returning base scores");
      return baseScores;
    }

    const qualityPenalty = calculateQualityPenalty(warnings);

    logger.debug("ConfidenceScoringService: applying quality penalty", {
      warningCount: warnings.length,
      qualityPenalty,
      blurScore: metrics.blurScore,
      brightness: metrics.brightness,
      contrast: metrics.contrast,
      glareRatio: metrics.glareRatio,
      skewAngle: metrics.skewAngle,
    });

    const adjustedScores: Record<string, { score: number; issues: string[] }> = {};

    for (const [fieldKey, fieldScore] of Object.entries(baseScores)) {
      const field = fieldKey as keyof FieldConfidenceScores;

      let adjustedScore = fieldScore.score - qualityPenalty;
      adjustedScore = clampScore(adjustedScore);

      const qualityIssues = buildQualityIssuesForField(field, warnings);
      const mergedIssues = [...new Set([...fieldScore.issues, ...qualityIssues])];

      adjustedScores[fieldKey] = {
        score: adjustedScore,
        issues: mergedIssues,
      };
    }

    return Object.fromEntries(
      Object.entries(adjustedScores).map(([key, val]) => [
        key,
        {
          score: val.score,
          level: scoreToLevel(val.score),
          issues: val.issues,
        },
      ]),
    ) as FieldConfidenceScores;
  }

  identifyLowConfidenceFields(scores: FieldConfidenceScores): string[] {
    const low: string[] = [];
    for (const [field, score] of Object.entries(scores)) {
      if (LOW_CONFIDENCE_LEVELS.includes(score.level)) {
        low.push(field);
      }
    }
    return low;
  }
}
