import type { ExtractedField, ExtractedFields, ConfidenceLevel, DocumentType, Gender } from "@guestfill/shared";

const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.5;

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return "HIGH";
  if (score >= MEDIUM_CONFIDENCE_THRESHOLD) return "MEDIUM";
  return "LOW";
}

export function makeField(value: string, confidence: number, source?: ExtractedField["source"]): ExtractedField {
  return { value, confidence, ...(source ? { source } : {}) };
}

export function normalizeDate(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const isoMatch = raw.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]!}-${isoMatch[2]!.padStart(2, "0")}-${isoMatch[3]!.padStart(2, "0")}`;
  }

  const euMatch = raw.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (euMatch) {
    return `${euMatch[3]!}-${euMatch[2]!.padStart(2, "0")}-${euMatch[1]!.padStart(2, "0")}`;
  }

  const cleaned = raw.replace(/[^0-9]/g, "");
  if (cleaned.length === 8) {
    const y = cleaned.slice(0, 4);
    const m = cleaned.slice(4, 6);
    const d = cleaned.slice(6, 8);
    const year = parseInt(y, 10);
    if (year >= 1900 && year <= 2100) {
      return `${y}-${m}-${d}`;
    }
  }
  if (cleaned.length === 6) {
    const y = parseInt(cleaned.slice(0, 2), 10);
    const m = cleaned.slice(2, 4);
    const d = cleaned.slice(4, 6);
    const fullYear = y >= 70 ? 1900 + y : 2000 + y;
    return `${fullYear}-${m}-${d}`;
  }

  return null;
}

export function normalizeGender(raw: string): Gender {
  const upper = raw.toUpperCase().trim();
  if (upper === "M" || upper === "MALE") return "M";
  if (upper === "F" || upper === "FEMALE") return "F";
  if (upper === "X") return "X";
  return "UNKNOWN";
}

export function normalizeDocumentType(raw: string): DocumentType {
  const upper = raw.toUpperCase().trim();
  if (upper === "PASSPORT" || upper === "P" || upper === "PN" || upper === "PD" || upper.includes("PASSPORT")) {
    return "PASSPORT";
  }
  if (upper === "ID_CARD" || upper === "ID" || upper === "I" || upper === "IDENTITY" || upper === "IDENTIFICATION") {
    return "ID_CARD";
  }
  return "UNKNOWN";
}

export function normalizeCountryCode(raw: string): string {
  return raw
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 3);
}

export function normalizeDocumentNumber(raw: string): string {
  return raw
    .replace(/[^A-Z0-9]/g, "")
    .toUpperCase()
    .trim();
}

export function checkDateExpired(dateStr: string): boolean | undefined {
  const date = new Date(dateStr + "T23:59:59Z");
  if (isNaN(date.getTime())) return undefined;
  return date < new Date();
}

export function checkDateExpiringSoon(dateStr: string): boolean {
  const date = new Date(dateStr + "T00:00:00Z");
  if (isNaN(date.getTime())) return false;
  const threeMonths = new Date();
  threeMonths.setMonth(threeMonths.getMonth() + 3);
  return date <= threeMonths;
}

export function buildFieldConfidence(fields: ExtractedFields): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [key, field] of Object.entries(fields)) {
    if (field) {
      map[key] = field.confidence;
    }
  }
  return map;
}
