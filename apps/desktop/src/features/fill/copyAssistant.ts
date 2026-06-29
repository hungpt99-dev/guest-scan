import type { GuestRow, FillEvent, ConfidenceLevel, FieldMapping } from "@guestfill/shared";
import { DEFAULT_FIELD_ORDER } from "./fillConstants";
import { saveFillEvent } from "./fillStore";
import {
  getFieldAccuracyInfo,
  getAccuracyRecommendations,
  getAggregateAccuracy,
  applyTransformsWithValidation,
  getCrossFieldIssues,
  getFieldQuickFixes,
  type QuickFix,
} from "./safetyEngine";
export type AccuracyCheckResult = {
  success: boolean;
  warning?: string;
  level: ConfidenceLevel;
  score: number;
  issues: string[];
  recommendations: string[];
  quickFixes?: QuickFix[];
};

export async function copyField(guest: GuestRow, fieldName: string): Promise<boolean> {
  const value = (guest as Record<string, unknown>)[fieldName];
  if (value === undefined || value === null || value === "") {
    return false;
  }
  try {
    const { writeText } = await import("@tauri-apps/api/clipboard");
    await writeText(String(value));
    const event: FillEvent = {
      id: crypto.randomUUID(),
      sessionId: guest.sessionId,
      guestRowId: guest.id,
      eventType: "FIELD_COPIED",
      fieldName,
      status: "SUCCESS",
      createdAt: new Date().toISOString(),
    };
    await saveFillEvent(event);
    return true;
  } catch {
    const event: FillEvent = {
      id: crypto.randomUUID(),
      sessionId: guest.sessionId,
      guestRowId: guest.id,
      eventType: "FILL_FAILED",
      fieldName,
      status: "FAILURE",
      message: "CLIPBOARD_COPY_FAILED",
      createdAt: new Date().toISOString(),
    };
    await saveFillEvent(event);
    return false;
  }
}

export function checkFieldAccuracyBeforeCopy(guest: GuestRow, fieldName: string): AccuracyCheckResult {
  const accuracyInfo = getFieldAccuracyInfo(guest);
  const fieldAccuracy = accuracyInfo.find((a) => a.field === fieldName);
  const recommendations = getAccuracyRecommendations(guest);
  const fieldRecs = recommendations.filter((r) => r.field === fieldName);
  const quickFixes = getFieldQuickFixes(guest, fieldName);

  if (fieldAccuracy) {
    return {
      success: fieldAccuracy.score >= 0.7,
      warning:
        fieldAccuracy.score < 0.7
          ? `Low accuracy (${(fieldAccuracy.score * 100).toFixed(0)}%): ${fieldAccuracy.issues.join(", ")}`
          : undefined,
      level: fieldAccuracy.level,
      score: fieldAccuracy.score,
      issues: fieldAccuracy.issues,
      recommendations: fieldRecs.map((r) => r.message),
      quickFixes,
    };
  }

  return { success: true, level: "HIGH", score: 1.0, issues: [], recommendations: [], quickFixes };
}

export async function copyFieldWithAccuracyCheck(
  guest: GuestRow,
  fieldName: string,
  mapping?: FieldMapping,
): Promise<{ copied: boolean; accuracy?: AccuracyCheckResult; transformError?: string }> {
  const check = checkFieldAccuracyBeforeCopy(guest, fieldName);
  if (!check.success) {
    return { copied: false, accuracy: check };
  }

  let value = (guest as Record<string, unknown>)[fieldName];
  if (value === undefined || value === null || value === "") {
    return { copied: false, accuracy: { ...check, success: false, warning: "Field is empty" } };
  }

  if (mapping?.transform && mapping.transform.length > 0) {
    const validation = applyTransformsWithValidation(String(value), mapping.transform);
    if (!validation.valid) {
      return { copied: false, accuracy: check, transformError: validation.error };
    }
    value = validation.result;
  }

  try {
    const { writeText } = await import("@tauri-apps/api/clipboard");
    await writeText(String(value));
    const event: FillEvent = {
      id: crypto.randomUUID(),
      sessionId: guest.sessionId,
      guestRowId: guest.id,
      eventType: "FIELD_COPIED",
      fieldName,
      status: "SUCCESS",
      createdAt: new Date().toISOString(),
    };
    await saveFillEvent(event);
    return { copied: true, accuracy: check };
  } catch {
    const event: FillEvent = {
      id: crypto.randomUUID(),
      sessionId: guest.sessionId,
      guestRowId: guest.id,
      eventType: "FILL_FAILED",
      fieldName,
      status: "FAILURE",
      message: "CLIPBOARD_COPY_FAILED",
      createdAt: new Date().toISOString(),
    };
    await saveFillEvent(event);
    return { copied: false, accuracy: check };
  }
}

export function copyFieldWithWarning(guest: GuestRow, fieldName: string): { success: boolean; warning?: string } {
  const accuracyInfo = getFieldAccuracyInfo(guest);
  const fieldAccuracy = accuracyInfo.find((a) => a.field === fieldName);
  if (fieldAccuracy && fieldAccuracy.score < 0.7) {
    const recommendations = getAccuracyRecommendations(guest);
    const fieldRecs = recommendations.filter((r) => r.field === fieldName);
    const extra = fieldRecs.length > 0 ? ` Suggestions: ${fieldRecs.map((r) => r.message).join("; ")}` : "";
    return {
      success: false,
      warning: `Low accuracy (${(fieldAccuracy.score * 100).toFixed(0)}%): ${fieldAccuracy.issues.join(", ")}.${extra}`,
    };
  }
  return { success: true };
}

export function getFieldAccuracyLevel(
  guest: GuestRow,
  fieldName: string,
): { level: string; score: number; issues: string[]; recommendations: string[]; quickFixes: QuickFix[] } {
  const accuracyInfo = getFieldAccuracyInfo(guest);
  const fieldAccuracy = accuracyInfo.find((a) => a.field === fieldName);
  const recommendations = getAccuracyRecommendations(guest);
  const fieldRecs = recommendations.filter((r) => r.field === fieldName);
  const quickFixes = getFieldQuickFixes(guest, fieldName);
  if (fieldAccuracy) {
    return {
      level: fieldAccuracy.level,
      score: fieldAccuracy.score,
      issues: fieldAccuracy.issues,
      recommendations: fieldRecs.map((r) => r.message),
      quickFixes,
    };
  }
  return { level: "HIGH", score: 1.0, issues: [], recommendations: [], quickFixes };
}

export function getQuickFixesForField(guest: GuestRow, fieldName: string): QuickFix[] {
  return getFieldQuickFixes(guest, fieldName);
}

export function getAccuracySummary(guest: GuestRow): {
  totalFields: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  warnings: string[];
  recommendations: string[];
  overallScore: number;
  overallLevel: ConfidenceLevel;
} {
  const aggregate = getAggregateAccuracy(guest);
  const highConfidence = aggregate.perField.filter((a) => a.level === "HIGH").length;
  const mediumConfidence = aggregate.perField.filter((a) => a.level === "MEDIUM").length;
  const lowConfidence = aggregate.perField.filter((a) => a.level === "LOW").length;
  const warnings = aggregate.perField.flatMap((a) => a.issues.map((i) => `${a.field}: ${i}`));
  const crossFieldIssues = getCrossFieldIssues(guest);
  return {
    totalFields: aggregate.perField.length,
    highConfidence,
    mediumConfidence,
    lowConfidence,
    warnings: [...warnings, ...crossFieldIssues],
    recommendations: aggregate.recommendations.map((r) => `[${r.priority}] ${r.field}: ${r.message}`),
    overallScore: aggregate.overallScore,
    overallLevel: aggregate.overallLevel,
  };
}

export function getFieldValue(guest: GuestRow, fieldName: string): string {
  const value = (guest as Record<string, unknown>)[fieldName];
  if (value === undefined || value === null) return "";
  return String(value);
}

export function getFieldsInOrder(
  guest: GuestRow,
  fieldOrder?: string[],
): Array<{
  key: string;
  label: string;
  value: string;
  accuracyLevel: ConfidenceLevel;
  accuracyScore: number;
  ocrConfidence?: number;
}> {
  const order = fieldOrder ?? DEFAULT_FIELD_ORDER;
  const labelMap: Record<string, string> = {
    fullName: "Full Name",
    surname: "Surname",
    givenName: "Given Name",
    passportNumber: "Passport Number",
    idNumber: "ID Number",
    nationality: "Nationality",
    dateOfBirth: "Date of Birth",
    gender: "Gender",
    passportExpiryDate: "Passport Expiry Date",
    idExpiryDate: "ID Expiry Date",
    issuingCountry: "Issuing Country",
    issuingAuthority: "Issuing Authority",
    documentType: "Document Type",
    roomNumber: "Room Number",
    arrivalDate: "Arrival Date",
    departureDate: "Departure Date",
    reservationCode: "Reservation Code",
    note: "Note",
  };
  const accuracies = getFieldAccuracyInfo(guest);
  const accuracyMap = new Map(
    accuracies.map((a) => [
      a.field,
      { level: a.level, score: a.score, ocrConfidence: guest.fieldConfidence?.[a.field] },
    ]),
  );
  return order
    .filter((key) => key in guest)
    .map((key) => {
      const acc = accuracyMap.get(key);
      return {
        key,
        label: labelMap[key] ?? key,
        value: getFieldValue(guest, key),
        accuracyLevel: acc?.level ?? "HIGH",
        accuracyScore: acc?.score ?? 1.0,
        ocrConfidence: acc?.ocrConfidence,
      };
    });
}

export function navigateField(currentIndex: number, totalFields: number, direction: "next" | "prev"): number {
  if (direction === "next") {
    return Math.min(currentIndex + 1, totalFields - 1);
  }
  return Math.max(currentIndex - 1, 0);
}

export function navigateGuest(currentIndex: number, totalGuests: number, direction: "next" | "prev"): number {
  if (direction === "next") {
    return Math.min(currentIndex + 1, totalGuests - 1);
  }
  return Math.max(currentIndex - 1, 0);
}

export function getHighConfidenceFields(guest: GuestRow): string[] {
  const fields = getFieldsInOrder(guest);
  return fields.filter((f) => f.accuracyLevel === "HIGH" && f.value !== "").map((f) => f.key);
}

export function getMediumConfidenceFields(guest: GuestRow): string[] {
  const fields = getFieldsInOrder(guest);
  return fields.filter((f) => f.accuracyLevel === "MEDIUM" && f.value !== "").map((f) => f.key);
}

export type BatchCopyResult = {
  copied: string[];
  failed: string[];
  skipped: string[];
  total: number;
  successCount: number;
};

export async function copyAllHighConfidenceFields(guest: GuestRow): Promise<BatchCopyResult> {
  const highConfKeys = getHighConfidenceFields(guest);
  const copied: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  for (const key of highConfKeys) {
    const value = (guest as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === "") {
      skipped.push(key);
      continue;
    }

    try {
      const { writeText } = await import("@tauri-apps/api/clipboard");
      await writeText(String(value));
      copied.push(key);

      const event: FillEvent = {
        id: crypto.randomUUID(),
        sessionId: guest.sessionId,
        guestRowId: guest.id,
        eventType: "FIELD_COPIED",
        fieldName: key,
        status: "SUCCESS",
        createdAt: new Date().toISOString(),
      };
      await saveFillEvent(event);
    } catch {
      failed.push(key);
      const event: FillEvent = {
        id: crypto.randomUUID(),
        sessionId: guest.sessionId,
        guestRowId: guest.id,
        eventType: "FILL_FAILED",
        fieldName: key,
        status: "FAILURE",
        message: "CLIPBOARD_COPY_FAILED",
        createdAt: new Date().toISOString(),
      };
      await saveFillEvent(event);
    }
  }

  return { copied, failed, skipped, total: highConfKeys.length, successCount: copied.length };
}

export function getBatchCopyPreview(guest: GuestRow): {
  highConfidence: Array<{ key: string; label: string }>;
  mediumConfidence: Array<{ key: string; label: string }>;
  lowConfidence: Array<{ key: string; label: string }>;
  totalFields: number;
} {
  const fields = getFieldsInOrder(guest);
  const labelMap: Record<string, string> = {
    fullName: "Full Name",
    surname: "Surname",
    givenName: "Given Name",
    passportNumber: "Passport Number",
    idNumber: "ID Number",
    nationality: "Nationality",
    dateOfBirth: "Date of Birth",
    gender: "Gender",
    passportExpiryDate: "Passport Expiry Date",
    idExpiryDate: "ID Expiry Date",
    issuingCountry: "Issuing Country",
    roomNumber: "Room Number",
    arrivalDate: "Arrival Date",
    departureDate: "Departure Date",
    reservationCode: "Reservation Code",
    note: "Note",
  };

  const highConfidence = fields
    .filter((f) => f.accuracyLevel === "HIGH" && f.value !== "")
    .map((f) => ({ key: f.key, label: labelMap[f.key] ?? f.key }));
  const mediumConfidence = fields
    .filter((f) => f.accuracyLevel === "MEDIUM" && f.value !== "")
    .map((f) => ({ key: f.key, label: labelMap[f.key] ?? f.key }));
  const lowConfidence = fields
    .filter((f) => f.accuracyLevel === "LOW" && f.value !== "")
    .map((f) => ({ key: f.key, label: labelMap[f.key] ?? f.key }));

  return {
    highConfidence,
    mediumConfidence,
    lowConfidence,
    totalFields: fields.length,
  };
}
