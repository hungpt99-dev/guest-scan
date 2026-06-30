import { logger } from "../lib/logger";
import { getAll, getById, put, remove, clearStore } from "../lib/db";
import { maskPassportNumber, maskIdNumber, maskFullName } from "@guestfill/shared";
import type { ConfirmedFields } from "./staff_review_service";
import {
  STORE_NAMES,
  DEFAULT_AUDIT_RETENTION_DAYS,
  DEFAULT_AUDIT_MAX_ENTRIES,
  DEFAULT_AUDIT_QUERY_LIMIT,
  MASK_MRZ_SHOW_CHARS,
  MASK_MRZ_SUFFIX,
  MASK_SHORT_VALUE_LENGTH,
  MASK_SHOW_CHARS,
} from "../config/constants";

// ── Event types ────────────────────────────────────────────────

export type AuditEventType =
  | "OCR_ATTEMPT"
  | "OCR_FAILURE"
  | "STAFF_EDIT"
  | "CONFIRMATION"
  | "AUTO_FILL"
  | "AUTO_FILL_FAILURE";

// ── Domain models ──────────────────────────────────────────────

export type AuditLogEntry = {
  id: string;
  eventType: AuditEventType;
  timestamp: string;
  sessionId: string;
  details: Record<string, unknown>;
};

export type AuditLogFilter = {
  eventTypes?: AuditEventType[];
  startDate?: string;
  endDate?: string;
  sessionId?: string;
  offset?: number;
  limit?: number;
};

export type AuditLogQueryResult = {
  entries: AuditLogEntry[];
  total: number;
  offset: number;
  limit: number;
};

export type AuditLogExportFormat = "json" | "csv";

export type AuditLogRetentionConfig = {
  maxAgeDays: number;
  maxEntries: number;
};

const STORE_NAME = STORE_NAMES.AUDIT_LOGS;
const DEFAULT_RETENTION: AuditLogRetentionConfig = {
  maxAgeDays: DEFAULT_AUDIT_RETENTION_DAYS,
  maxEntries: DEFAULT_AUDIT_MAX_ENTRIES,
};

// ── Sensitive-field patterns matched against detail keys ───────

const SENSITIVE_KEY_PATTERNS = [
  /^passportNumber$/i,
  /^documentNumber$/i,
  /^idNumber$/i,
  /^mrzRaw$/i,
  /^mrz$/i,
  /^fullMrz$/i,
  /^mrzParsed$/i,
  /^fullName$/i,
  /^firstName$/i,
  /^lastName$/i,
  /^surname$/i,
  /^givenName$/i,
  /^imagePath$/i,
  /^imageData$/i,
  /^base64Image$/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
}

function maskByKey(key: string, value: unknown): unknown {
  if (typeof value !== "string" || !value) return value;
  if (/passport/i.test(key)) return maskPassportNumber(value);
  if (/idNumber/i.test(key) || /^id$/i.test(key)) return maskIdNumber(value);
  if (
    /fullName/i.test(key) ||
    /surname/i.test(key) ||
    /givenName/i.test(key) ||
    /lastName/i.test(key) ||
    /firstName/i.test(key)
  ) {
    return maskFullName(value);
  }
  if (/mrz/i.test(key)) return value.length > 10 ? value.slice(0, MASK_MRZ_SHOW_CHARS) + MASK_MRZ_SUFFIX : MASK_MRZ_SUFFIX;
  if (/image/i.test(key)) return "[REDACTED]";
  if (value.length <= MASK_SHORT_VALUE_LENGTH) return value;
  return value.slice(0, MASK_SHOW_CHARS) + MASK_MRZ_SUFFIX + value.slice(-1);
}

function maskDetails(details: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (isSensitiveKey(key)) {
      masked[key] = maskByKey(key, value);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      masked[key] = maskDetails(value as Record<string, unknown>);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

// ── Store abstraction ──────────────────────────────────────────

export interface AuditLogStore {
  getAll(): Promise<AuditLogEntry[]>;
  getById(id: string): Promise<AuditLogEntry | undefined>;
  put(entry: AuditLogEntry): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

export function createIndexedDbAuditLogStore(): AuditLogStore {
  return {
    async getAll(): Promise<AuditLogEntry[]> {
      return getAll<AuditLogEntry>(STORE_NAME);
    },
    async getById(id: string): Promise<AuditLogEntry | undefined> {
      return getById<AuditLogEntry>(STORE_NAME, id);
    },
    async put(entry: AuditLogEntry): Promise<void> {
      await put(STORE_NAME, entry);
    },
    async remove(id: string): Promise<void> {
      await remove(STORE_NAME, id);
    },
    async clear(): Promise<void> {
      await clearStore(STORE_NAME);
    },
  };
}

export function createInMemoryAuditLogStore(): AuditLogStore {
  const entries = new Map<string, AuditLogEntry>();
  return {
    async getAll(): Promise<AuditLogEntry[]> {
      return Array.from(entries.values());
    },
    async getById(id: string): Promise<AuditLogEntry | undefined> {
      return entries.get(id);
    },
    async put(entry: AuditLogEntry): Promise<void> {
      entries.set(entry.id, entry);
    },
    async remove(id: string): Promise<void> {
      entries.delete(id);
    },
    async clear(): Promise<void> {
      entries.clear();
    },
  };
}

// ── Service interface ──────────────────────────────────────────

export interface AuditLogService {
  recordOcrAttempt(sessionId: string, details?: Record<string, unknown>): Promise<AuditLogEntry>;

  recordOcrFailure(sessionId: string, error: string, details?: Record<string, unknown>): Promise<AuditLogEntry>;

  recordStaffEdit(sessionId: string, fieldName: string, details?: Record<string, unknown>): Promise<AuditLogEntry>;

  recordConfirmation(sessionId: string, confirmation: ConfirmedFields): Promise<AuditLogEntry>;

  recordAutoFill(
    sessionId: string,
    profileId: string,
    fieldCount: number,
    success: boolean,
    details?: Record<string, unknown>,
  ): Promise<AuditLogEntry>;

  query(filter?: AuditLogFilter): Promise<AuditLogQueryResult>;
  getEntry(id: string): Promise<AuditLogEntry | undefined>;

  exportLogs(filter: AuditLogFilter, format: AuditLogExportFormat): Promise<string>;

  applyRetentionPolicy(config?: Partial<AuditLogRetentionConfig>): Promise<number>;

  clearAll(): Promise<void>;
}

// ── Factory ────────────────────────────────────────────────────

export function createAuditLogService(
  store?: AuditLogStore,
  retention?: Partial<AuditLogRetentionConfig>,
): AuditLogService {
  return new DefaultAuditLogService(store ?? createInMemoryAuditLogStore(), { ...DEFAULT_RETENTION, ...retention });
}

// ── Helpers ────────────────────────────────────────────────────

function makeEntry(eventType: AuditEventType, sessionId: string, details: Record<string, unknown>): AuditLogEntry {
  return {
    id: crypto.randomUUID(),
    eventType,
    timestamp: new Date().toISOString(),
    sessionId,
    details,
  };
}

function filterEntries(entries: AuditLogEntry[], filter?: AuditLogFilter): AuditLogEntry[] {
  if (!filter) return entries;

  let result = [...entries];

  if (filter.eventTypes && filter.eventTypes.length > 0) {
    const types = new Set(filter.eventTypes);
    result = result.filter((e) => types.has(e.eventType));
  }

  if (filter.startDate) {
    const start = new Date(filter.startDate).getTime();
    if (!isNaN(start)) {
      result = result.filter((e) => new Date(e.timestamp).getTime() >= start);
    }
  }

  if (filter.endDate) {
    const end = new Date(filter.endDate).getTime();
    if (!isNaN(end)) {
      result = result.filter((e) => new Date(e.timestamp).getTime() <= end);
    }
  }

  if (filter.sessionId) {
    result = result.filter((e) => e.sessionId === filter.sessionId);
  }

  return result;
}

function paginateEntries(entries: AuditLogEntry[], offset: number, limit: number): AuditLogEntry[] {
  const start = Math.max(0, offset);
  const end = limit > 0 ? start + limit : entries.length;
  return entries.slice(start, end);
}

function toCsv(entries: AuditLogEntry[]): string {
  const headers = ["id", "eventType", "timestamp", "sessionId", "details"];
  const escape = (v: unknown): string => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = entries.map((e) =>
    [
      escape(e.id),
      escape(e.eventType),
      escape(e.timestamp),
      escape(e.sessionId),
      escape(JSON.stringify(e.details)),
    ].join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

// ── Implementation ─────────────────────────────────────────────

class DefaultAuditLogService implements AuditLogService {
  constructor(
    private readonly store: AuditLogStore,
    private readonly retention: AuditLogRetentionConfig,
  ) {}

  async recordOcrAttempt(sessionId: string, details?: Record<string, unknown>): Promise<AuditLogEntry> {
    const safeDetails = maskDetails(details ?? {});

    const entry = makeEntry("OCR_ATTEMPT", sessionId, safeDetails);

    logger.info("AuditLogService: OCR attempt", {
      sessionId,
      ...safeDetails,
    });

    await this.store.put(entry);
    return entry;
  }

  async recordOcrFailure(sessionId: string, error: string, details?: Record<string, unknown>): Promise<AuditLogEntry> {
    const safeDetails = maskDetails({
      error,
      ...details,
    });

    const entry = makeEntry("OCR_FAILURE", sessionId, safeDetails);

    logger.warn("AuditLogService: OCR failure", {
      sessionId,
      error,
    });

    await this.store.put(entry);
    return entry;
  }

  async recordStaffEdit(
    sessionId: string,
    fieldName: string,
    details?: Record<string, unknown>,
  ): Promise<AuditLogEntry> {
    const safeDetails = maskDetails({
      fieldName,
      ...details,
    });

    const entry = makeEntry("STAFF_EDIT", sessionId, safeDetails);

    logger.info("AuditLogService: staff edit", {
      sessionId,
      fieldName,
    });

    await this.store.put(entry);
    return entry;
  }

  async recordConfirmation(sessionId: string, confirmation: ConfirmedFields): Promise<AuditLogEntry> {
    const safeDetails = maskDetails({
      confirmedBy: confirmation.confirmedBy,
      confirmedAt: confirmation.confirmedAt,
      lowConfidenceFields: confirmation.lowConfidenceFields,
      editCount: Object.keys(confirmation.edits).filter(
        (k) =>
          confirmation.edits[k as keyof typeof confirmation.edits] !==
          confirmation.original[k as keyof typeof confirmation.original],
      ).length,
      fields: {
        documentType: confirmation.fields.documentType,
        nationality: confirmation.fields.nationality,
        countryCode: confirmation.fields.countryCode,
        issuingCountry: confirmation.fields.issuingCountry,
        gender: confirmation.fields.gender,
        passportNumber: maskPassportNumber(confirmation.fields.passportNumber),
        documentNumber: maskPassportNumber(confirmation.fields.documentNumber),
        idNumber: maskIdNumber(confirmation.fields.idNumber),
        fullName: maskFullName(confirmation.fields.fullName),
        dateOfBirth: confirmation.fields.dateOfBirth,
        expiryDate: confirmation.fields.expiryDate,
      },
    });

    const entry = makeEntry("CONFIRMATION", sessionId, safeDetails);

    logger.info("AuditLogService: confirmation", {
      sessionId,
      confirmedBy: confirmation.confirmedBy,
      editCount: safeDetails.editCount,
    });

    await this.store.put(entry);
    return entry;
  }

  async recordAutoFill(
    sessionId: string,
    profileId: string,
    fieldCount: number,
    success: boolean,
    details?: Record<string, unknown>,
  ): Promise<AuditLogEntry> {
    const safeDetails = maskDetails({
      profileId,
      fieldCount,
      success,
      ...details,
    });

    const eventType: AuditEventType = success ? "AUTO_FILL" : "AUTO_FILL_FAILURE";

    const entry = makeEntry(eventType, sessionId, safeDetails);

    if (success) {
      logger.info("AuditLogService: auto-fill completed", {
        sessionId,
        profileId,
        fieldCount,
      });
    } else {
      logger.warn("AuditLogService: auto-fill failed", {
        sessionId,
        profileId,
        fieldCount,
      });
    }

    await this.store.put(entry);
    return entry;
  }

  async query(filter?: AuditLogFilter): Promise<AuditLogQueryResult> {
    const all = await this.store.getAll();
    const filtered = filterEntries(all, filter);

    const sorted = filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? DEFAULT_AUDIT_QUERY_LIMIT;

    return {
      total: sorted.length,
      offset,
      limit,
      entries: paginateEntries(sorted, offset, limit),
    };
  }

  async getEntry(id: string): Promise<AuditLogEntry | undefined> {
    return this.store.getById(id);
  }

  async exportLogs(filter: AuditLogFilter, format: AuditLogExportFormat): Promise<string> {
    const all = await this.store.getAll();
    const filtered = filterEntries(all, filter);

    const sorted = filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (format === "csv") {
      return toCsv(sorted);
    }

    return JSON.stringify(sorted, null, 2);
  }

  async applyRetentionPolicy(config?: Partial<AuditLogRetentionConfig>): Promise<number> {
    const effective = { ...this.retention, ...config };
    const all = await this.store.getAll();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - effective.maxAgeDays);
    const cutoffTime = cutoff.getTime();

    const sorted = all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const toRemove: string[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const entryTime = new Date(sorted[i]!.timestamp).getTime();

      const exceedsMaxAge = entryTime < cutoffTime;
      const exceedsMaxEntries = i >= effective.maxEntries;

      if (exceedsMaxAge || exceedsMaxEntries) {
        toRemove.push(sorted[i]!.id);
      }
    }

    for (const id of toRemove) {
      await this.store.remove(id);
    }

    if (toRemove.length > 0) {
      logger.info("AuditLogService: retention policy applied", {
        removedCount: toRemove.length,
        maxAgeDays: effective.maxAgeDays,
        maxEntries: effective.maxEntries,
        remainingCount: sorted.length - toRemove.length,
      });
    }

    return toRemove.length;
  }

  async clearAll(): Promise<void> {
    await this.store.clear();
    logger.info("AuditLogService: all entries cleared");
  }
}
