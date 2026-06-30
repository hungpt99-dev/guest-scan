import { describe, it, expect, beforeEach } from "vitest";
import {
  createAuditLogService,
  createInMemoryAuditLogStore,
  type AuditLogService,
  type AuditLogEntry,
} from "../../services/audit-log-service";
import type { NormalizedFields } from "../../services/field_normalization_service";
import type { ConfirmedFields, EditableFields } from "../../services/staff_review_service";

function makeNormalizedFields(overrides: Partial<NormalizedFields> = {}): NormalizedFields {
  return {
    fullName: "JANE DOE",
    firstName: "JANE",
    lastName: "DOE",
    gender: "F",
    dateOfBirth: "1990-05-15",
    nationality: "VNM",
    countryCode: "VNM",
    documentType: "PASSPORT",
    documentNumber: "AB1234567",
    passportNumber: "AB1234567",
    idNumber: "",
    issueDate: "",
    expiryDate: "2030-08-20",
    issuingCountry: "VNM",
    mrzRaw: "P<VNMDOE<<JANE<<<<<<<<<<<<<<<<<<<<<<",
    mrzParsed: ["P<VNMDOE<<JANE<<<<<<<<<<<<<<<<<<<<<<"],
    rawOriginal: {
      fullName: "DOE<<JANE",
      surname: "DOE",
      givenName: "JANE",
      gender: "F",
      dateOfBirth: "900515",
      nationality: "VNM",
      issuingCountry: "VNM",
      documentType: "P",
      passportNumber: "AB1234567",
      documentNumber: "AB1234567",
      idNumber: "",
      issueDate: "",
      expiryDate: "300820",
      mrzRaw: "P<VNMDOE<<JANE<<<<<<<<<<<<<<<<<<<<<<",
    },
    ...overrides,
  };
}

function makeEditableFields(overrides: Partial<EditableFields> = {}): EditableFields {
  return {
    fullName: "JANE DOE",
    firstName: "JANE",
    lastName: "DOE",
    gender: "F",
    dateOfBirth: "1990-05-15",
    nationality: "VNM",
    countryCode: "VNM",
    documentType: "PASSPORT",
    documentNumber: "AB1234567",
    passportNumber: "AB1234567",
    idNumber: "",
    issueDate: "",
    expiryDate: "2030-08-20",
    issuingCountry: "VNM",
    ...overrides,
  };
}

function makeConfirmedFields(overrides: Partial<ConfirmedFields> = {}): ConfirmedFields {
  const original = makeNormalizedFields();
  const edits = makeEditableFields();
  return {
    fields: original,
    edits,
    original,
    lowConfidenceFields: [],
    confirmedAt: "2024-06-15T10:30:00Z",
    confirmedBy: "STAFF",
    ...overrides,
  };
}

describe("AuditLogService", () => {
  let service: AuditLogService;

  beforeEach(() => {
    const store = createInMemoryAuditLogStore();
    service = createAuditLogService(store);
  });

  describe("recordOcrAttempt", () => {
    it("records an OCR attempt event", async () => {
      const entry = await service.recordOcrAttempt("session-1", {
        documentType: "PASSPORT",
        imageSize: "1024x768",
      });

      expect(entry.eventType).toBe("OCR_ATTEMPT");
      expect(entry.sessionId).toBe("session-1");
      expect(entry.id).toBeTruthy();
      expect(entry.timestamp).toBeTruthy();
      expect(entry.details.documentType).toBe("PASSPORT");
    });

    it("masks sensitive fields in OCR attempt", async () => {
      const entry = await service.recordOcrAttempt("session-1", {
        passportNumber: "AB1234567",
        fullName: "JANE DOE",
      });

      expect(entry.details.passportNumber).not.toBe("AB1234567");
      expect(entry.details.passportNumber).toContain("*");
      expect(entry.details.fullName).not.toBe("JANE DOE");
      expect(entry.details.fullName).toContain("*");
    });

    it("handles empty details", async () => {
      const entry = await service.recordOcrAttempt("session-1");
      expect(entry.eventType).toBe("OCR_ATTEMPT");
      expect(entry.sessionId).toBe("session-1");
    });
  });

  describe("recordOcrFailure", () => {
    it("records an OCR failure event with error message", async () => {
      const entry = await service.recordOcrFailure("session-1", "Image too blurry", { stage: "quality_check" });

      expect(entry.eventType).toBe("OCR_FAILURE");
      expect(entry.sessionId).toBe("session-1");
      expect(entry.details.error).toBe("Image too blurry");
      expect(entry.details.stage).toBe("quality_check");
    });

    it("masks sensitive data in failure details", async () => {
      const entry = await service.recordOcrFailure("session-1", "MRZ not found", {
        imagePath: "/tmp/passport.jpg",
      });

      expect(entry.details.imagePath).toBe("[REDACTED]");
    });
  });

  describe("recordStaffEdit", () => {
    it("records a staff edit event", async () => {
      const entry = await service.recordStaffEdit("session-1", "dateOfBirth", {
        oldValue: "1990-05-15",
        newValue: "1990-05-16",
      });

      expect(entry.eventType).toBe("STAFF_EDIT");
      expect(entry.sessionId).toBe("session-1");
      expect(entry.details.fieldName).toBe("dateOfBirth");
      expect(entry.details.oldValue).toBe("1990-05-15");
      expect(entry.details.newValue).toBe("1990-05-16");
    });

    it("masks edits to sensitive fields", async () => {
      const entry = await service.recordStaffEdit("session-1", "passportNumber", {
        oldValue: "AB1234567",
        newValue: "XY9876543",
      });

      const details = entry.details as Record<string, unknown>;
      expect(details.fieldName).toBe("passportNumber");
      expect(typeof details.oldValue).toBe("string");
      expect(typeof details.newValue).toBe("string");
    });
  });

  describe("recordConfirmation", () => {
    it("records a confirmation event", async () => {
      const confirmed = makeConfirmedFields({
        lowConfidenceFields: ["dateOfBirth"],
      });

      const entry = await service.recordConfirmation("session-1", confirmed);

      expect(entry.eventType).toBe("CONFIRMATION");
      expect(entry.sessionId).toBe("session-1");
      expect(entry.details.confirmedBy).toBe("STAFF");
      expect(entry.details.lowConfidenceFields).toEqual(["dateOfBirth"]);
    });

    it("masks sensitive field values in confirmation", async () => {
      const confirmed = makeConfirmedFields({
        fields: makeNormalizedFields({ idNumber: "ID9876543" }),
        edits: makeEditableFields({ idNumber: "ID9876543" }),
        original: makeNormalizedFields({ idNumber: "ID9876543" }),
      });

      const entry = await service.recordConfirmation("session-1", confirmed);

      const fields = entry.details.fields as Record<string, unknown>;
      expect(fields.passportNumber).toContain("*");
      expect(fields.idNumber).toContain("*");
      expect(fields.fullName).toContain("*");
    });

    it("records confirmation without edits", async () => {
      const confirmed = makeConfirmedFields();
      const entry = await service.recordConfirmation("session-1", confirmed);

      expect(entry.details.editCount).toBe(0);
    });
  });

  describe("recordAutoFill", () => {
    it("records a successful auto-fill event", async () => {
      const entry = await service.recordAutoFill("session-1", "profile-1", 5, true);

      expect(entry.eventType).toBe("AUTO_FILL");
      expect(entry.sessionId).toBe("session-1");
      expect(entry.details.profileId).toBe("profile-1");
      expect(entry.details.fieldCount).toBe(5);
      expect(entry.details.success).toBe(true);
    });

    it("records a failed auto-fill event", async () => {
      const entry = await service.recordAutoFill("session-1", "profile-1", 3, false, {
        error: "Target window not found",
      });

      expect(entry.eventType).toBe("AUTO_FILL_FAILURE");
      expect(entry.details.success).toBe(false);
      expect(entry.details.error).toBe("Target window not found");
    });

    it("masks sensitive details in auto-fill", async () => {
      const entry = await service.recordAutoFill("session-1", "profile-1", 2, true, {
        passportNumber: "AB1234567",
      });

      expect(entry.details.passportNumber).not.toBe("AB1234567");
      expect(entry.details.passportNumber).toContain("*");
    });
  });

  describe("query", () => {
    beforeEach(async () => {
      await service.recordOcrAttempt("session-1", { docType: "PASSPORT" });
      await service.recordOcrFailure("session-1", "Blurry image");
      await service.recordOcrAttempt("session-2", { docType: "ID" });
      await service.recordAutoFill("session-1", "profile-1", 3, true);
    });

    it("returns all entries when no filter is applied", async () => {
      const result = await service.query();
      expect(result.total).toBe(4);
      expect(result.entries).toHaveLength(4);
    });

    it("filters by event type", async () => {
      const result = await service.query({
        eventTypes: ["OCR_ATTEMPT"],
      });

      expect(result.total).toBe(2);
      expect(result.entries.every((e) => e.eventType === "OCR_ATTEMPT")).toBe(true);
    });

    it("filters by session ID", async () => {
      const result = await service.query({ sessionId: "session-2" });
      expect(result.total).toBe(1);
      expect(result.entries[0]!.sessionId).toBe("session-2");
    });

    it("filters by date range", async () => {
      const pastDate = "2020-01-01T00:00:00Z";
      const futureDate = "2099-01-01T00:00:00Z";

      const pastResult = await service.query({
        startDate: pastDate,
        endDate: futureDate,
      });
      expect(pastResult.total).toBe(4);
    });

    it("returns entries sorted newest first", async () => {
      const result = await service.query();
      for (let i = 1; i < result.entries.length; i++) {
        const prevTime = new Date(result.entries[i - 1]!.timestamp).getTime();
        const currTime = new Date(result.entries[i]!.timestamp).getTime();
        expect(prevTime).toBeGreaterThanOrEqual(currTime);
      }
    });

    it("paginates results", async () => {
      const result = await service.query({ limit: 2, offset: 0 });
      expect(result.entries).toHaveLength(2);
      expect(result.total).toBe(4);
    });

    it("returns empty results when no entries match", async () => {
      const result = await service.query({
        eventTypes: ["CONFIRMATION"],
      });

      expect(result.total).toBe(0);
      expect(result.entries).toHaveLength(0);
    });
  });

  describe("getEntry", () => {
    it("returns an entry by ID", async () => {
      const recorded = await service.recordOcrAttempt("session-1");
      const found = await service.getEntry(recorded.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(recorded.id);
    });

    it("returns undefined for non-existent entry", async () => {
      const found = await service.getEntry("non-existent");
      expect(found).toBeUndefined();
    });
  });

  describe("exportLogs", () => {
    beforeEach(async () => {
      await service.recordOcrAttempt("session-1", { docType: "PASSPORT" });
      await service.recordOcrFailure("session-1", "Blurry");
    });

    it("exports as JSON", async () => {
      const json = await service.exportLogs({}, "json");
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
    });

    it("exports as CSV", async () => {
      const csv = await service.exportLogs({}, "csv");
      expect(csv).toContain("id,eventType,timestamp,sessionId,details");
      expect(csv).toContain("OCR_ATTEMPT");
      expect(csv).toContain("OCR_FAILURE");
    });

    it("filters exported data", async () => {
      const json = await service.exportLogs({ eventTypes: ["OCR_ATTEMPT"] }, "json");
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]!.eventType).toBe("OCR_ATTEMPT");
    });
  });

  describe("applyRetentionPolicy", () => {
    it("removes entries older than max age", async () => {
      const store = createInMemoryAuditLogStore();
      const serviceWithRetention = createAuditLogService(store, {
        maxAgeDays: 30,
        maxEntries: 10000,
      });

      const oldEntry: AuditLogEntry = {
        id: "old-entry",
        eventType: "OCR_ATTEMPT",
        timestamp: new Date("2020-01-01").toISOString(),
        sessionId: "session-old",
        details: {},
      };
      await store.put(oldEntry);
      await serviceWithRetention.recordOcrAttempt("session-new");

      const removed = await serviceWithRetention.applyRetentionPolicy();
      expect(removed).toBe(1);

      const remaining = await serviceWithRetention.query();
      expect(remaining.total).toBe(1);
      expect(remaining.entries[0]!.id).not.toBe("old-entry");
    });

    it("removes entries exceeding max count", async () => {
      const store = createInMemoryAuditLogStore();
      const service2 = createAuditLogService(store, {
        maxAgeDays: 36500,
        maxEntries: 2,
      });

      await service2.recordOcrAttempt("session-1");
      await service2.recordOcrAttempt("session-1");
      await service2.recordOcrAttempt("session-1");
      await service2.recordOcrAttempt("session-1");

      const removed = await service2.applyRetentionPolicy();
      expect(removed).toBe(2);

      const remaining = await service2.query();
      expect(remaining.total).toBe(2);
    });

    it("returns 0 when nothing exceeds retention", async () => {
      const store = createInMemoryAuditLogStore();
      const service2 = createAuditLogService(store, {
        maxAgeDays: 36500,
        maxEntries: 100,
      });

      await service2.recordOcrAttempt("session-1");
      await service2.recordOcrAttempt("session-2");

      const removed = await service2.applyRetentionPolicy();
      expect(removed).toBe(0);
    });

    it("accepts per-call retention override", async () => {
      const store = createInMemoryAuditLogStore();
      const service2 = createAuditLogService(store);

      await service2.recordOcrAttempt("session-1");
      const oldEntry: AuditLogEntry = {
        id: "very-old",
        eventType: "OCR_ATTEMPT",
        timestamp: new Date("2020-01-01").toISOString(),
        sessionId: "session-old",
        details: {},
      };
      await store.put(oldEntry);

      const removed = await service2.applyRetentionPolicy({ maxAgeDays: 1, maxEntries: 10000 });
      expect(removed).toBe(1);
    });
  });

  describe("clearAll", () => {
    it("removes all entries", async () => {
      await service.recordOcrAttempt("session-1");
      await service.recordOcrFailure("session-1", "Error");

      await service.clearAll();

      const result = await service.query();
      expect(result.total).toBe(0);
    });
  });

  describe("masking", () => {
    it("masks passport number in details", async () => {
      const entry = await service.recordOcrAttempt("session-1", {
        passportNumber: "AB1234567",
      });

      expect(entry.details.passportNumber).toMatch(/^AB12\*+/);
      expect(entry.details.passportNumber).not.toBe("AB1234567");
    });

    it("masks ID number in details", async () => {
      const entry = await service.recordOcrAttempt("session-1", {
        idNumber: "123456789",
      });

      expect(entry.details.idNumber).toBe("1234*****");
    });

    it("masks full name in details", async () => {
      const entry = await service.recordOcrAttempt("session-1", {
        fullName: "JANE DOE",
      });

      expect(entry.details.fullName).toMatch(/JANE/);
      expect(entry.details.fullName).toContain("*");
    });

    it("masks image paths in details", async () => {
      const entry = await service.recordOcrAttempt("session-1", {
        imagePath: "/tmp/passport.jpg",
      });

      expect(entry.details.imagePath).toBe("[REDACTED]");
    });

    it("does not mask non-sensitive fields", async () => {
      const entry = await service.recordOcrAttempt("session-1", {
        documentType: "PASSPORT",
        nationality: "VNM",
        confidence: 0.95,
      });

      expect(entry.details.documentType).toBe("PASSPORT");
      expect(entry.details.nationality).toBe("VNM");
      expect(entry.details.confidence).toBe(0.95);
    });

    it("masks nested sensitive objects", async () => {
      const entry = await service.recordOcrAttempt("session-1", {
        fields: {
          passportNumber: "AB1234567",
          fullName: "JANE DOE",
          nationality: "VNM",
        },
      });

      const fields = entry.details.fields as Record<string, unknown>;
      expect(fields.passportNumber).toContain("*");
      expect(fields.fullName).toContain("*");
      expect(fields.nationality).toBe("VNM");
    });
  });

  describe("store abstraction", () => {
    it("uses in-memory store by default", async () => {
      const defaultService = createAuditLogService();
      const entry = await defaultService.recordOcrAttempt("session-1");
      expect(entry.id).toBeTruthy();
      const found = await defaultService.getEntry(entry.id);
      expect(found).toBeDefined();
    });
  });
});
