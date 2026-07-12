import { describe, it, expect, beforeEach } from "vitest";
import { createSettingsService, createInMemorySettingsStore, type AppSettings } from "../../services/settings-service";
import {
  createAuditLogService,
  createInMemoryAuditLogStore,
  type AuditLogService,
  type AuditLogEntry,
} from "../../services/audit-log-service";
import {
  createAutoFillMappingService,
  createInMemoryProfileStore,
  type AutoFillMappingService,
  type FieldMappingEntry,
  type OcrFieldKey,
} from "../../services/auto-fill-mapping-service";
import {
  createAutoFillExecutionService,
  type AutoFillExecutionService,
  type FillExecutor,
} from "../../services/auto-fill-execution-service";
import type { NormalizedFields } from "../../services/field_normalization_service";
import type { ConfirmedFields, EditableFields } from "../../services/staff_review_service";

function makeNormalizedFields(overrides: Partial<NormalizedFields> = {}): NormalizedFields {
  return {
    fullName: "MUSTER JOHN MICHAEL",
    firstName: "JOHN MICHAEL",
    lastName: "MUSTER",
    gender: "M",
    dateOfBirth: "1985-10-10",
    nationality: "UTO",
    countryCode: "UTO",
    documentType: "PASSPORT",
    documentNumber: "AB123456",
    passportNumber: "AB123456",
    idNumber: "",
    issueDate: "",
    expiryDate: "2020-01-01",
    issuingCountry: "UTO",
    mrzRaw: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
    mrzParsed: ["P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", "AB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<"],
    rawOriginal: {
      fullName: "MUSTER<<JOHN<MICHAEL",
      surname: "MUSTER",
      givenName: "JOHN MICHAEL",
      gender: "M",
      dateOfBirth: "851010",
      nationality: "UTO",
      issuingCountry: "UTO",
      documentType: "P",
      passportNumber: "AB123456",
      documentNumber: "AB123456",
      idNumber: "",
      issueDate: "",
      expiryDate: "200101",
      mrzRaw: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<4UTO8510105M2001012<<<<<<<<<<<<<<<<0<<",
    },
    ...overrides,
  };
}

function makeEditableFields(overrides: Partial<EditableFields> = {}): EditableFields {
  return {
    fullName: "MUSTER JOHN MICHAEL",
    firstName: "JOHN MICHAEL",
    lastName: "MUSTER",
    gender: "M",
    dateOfBirth: "1985-10-10",
    nationality: "UTO",
    countryCode: "UTO",
    documentType: "PASSPORT",
    documentNumber: "AB123456",
    passportNumber: "AB123456",
    idNumber: "",
    issueDate: "",
    expiryDate: "2020-01-01",
    issuingCountry: "UTO",
    ...overrides,
  };
}

function makeConfirmedFields(overrides: Partial<ConfirmedFields> = {}): ConfirmedFields {
  const fields = makeNormalizedFields();
  const edits = makeEditableFields();
  return {
    fields,
    edits,
    original: fields,
    lowConfidenceFields: [],
    confirmedAt: "2024-06-15T10:30:00Z",
    confirmedBy: "STAFF",
    ...overrides,
  };
}

function makeMapping(overrides: Partial<FieldMappingEntry> = {}): FieldMappingEntry {
  return {
    id: crypto.randomUUID(),
    ocrField: "fullName",
    formField: "guestName",
    required: false,
    enabled: true,
    ...overrides,
  };
}

function createMockExecutor(): FillExecutor {
  return {
    fillWebField: async () => {},
    fillDesktopField: async () => {},
    fillCopyAssistant: async () => {},
    focusTargetApp: async () => {},
    clickSubmitButton: async () => {},
    clickWebSubmit: async () => {},
  };
}

describe("Settings Persistence Integration", () => {
  describe("in-memory store lifecycle", () => {
    it("loads defaults when store is empty", async () => {
      const store = createInMemorySettingsStore();
      const service = createSettingsService(store);
      const settings = await service.loadSettings();

      expect(settings.ocr.engineType).toBe("paddle");
      expect(settings.ocr.ocrConfidenceThreshold).toBe(0.6);
      expect(settings.privacy.maskDocumentNumberInLogs).toBe(true);
      expect(settings.theme).toBe("light");
      expect(settings.onboardingCompleted).toBe(false);
    });

    it("updates and persists settings across service instances", async () => {
      const store = createInMemorySettingsStore();
      const svc1 = createSettingsService(store);

      await svc1.loadSettings();
      await svc1.updateSettings({
        ocr: { engineType: "tesseract", ocrConfidenceThreshold: 0.8 },
        theme: "dark",
        privacy: { maskDocumentNumberInLogs: false },
        onboardingCompleted: true,
      });

      const svc2 = createSettingsService(store);
      const reloaded = await svc2.loadSettings();

      expect(reloaded.ocr.engineType).toBe("tesseract");
      expect(reloaded.ocr.ocrConfidenceThreshold).toBe(0.8);
      expect(reloaded.theme).toBe("dark");
      expect(reloaded.privacy.maskDocumentNumberInLogs).toBe(false);
      expect(reloaded.onboardingCompleted).toBe(true);
    });

    it("persists camera and auto-fill profile settings", async () => {
      const store = createInMemorySettingsStore();
      const svc = createSettingsService(store);

      await svc.loadSettings();
      await svc.updateSettings({
        camera: {
          deviceId: "camera-123",
          label: "HD Webcam",
          resolution: { width: 1920, height: 1080 },
        },
        autoFill: {
          activeProfileId: "profile-xyz",
          enableTestMode: false,
        },
      });

      const reloaded = createSettingsService(store);
      const settings = await reloaded.loadSettings();

      expect(settings.camera.deviceId).toBe("camera-123");
      expect(settings.camera.label).toBe("HD Webcam");
      expect(settings.camera.resolution.width).toBe(1920);
      expect(settings.autoFill.activeProfileId).toBe("profile-xyz");
      expect(settings.autoFill.enableTestMode).toBe(false);
    });

    it("resets to defaults and persists reset", async () => {
      const store = createInMemorySettingsStore();
      const svc = createSettingsService(store);

      await svc.loadSettings();
      await svc.updateSettings({ theme: "dark", language: "chi" });
      await svc.resetSettings();

      const reloaded = createSettingsService(store);
      const settings = await reloaded.loadSettings();

      expect(settings.theme).toBe("light");
      expect(settings.language).toBe("en");
      expect(settings.ocr.engineType).toBe("paddle");
    });

    it("merges partial stored settings with defaults", async () => {
      const partial = { theme: "dark" as const };
      const store = createInMemorySettingsStore(partial as AppSettings);
      const svc = createSettingsService(store);
      const settings = await svc.loadSettings();

      expect(settings.theme).toBe("dark");
      expect(settings.ocr.engineType).toBe("paddle");
      expect(settings.privacy.maskDocumentNumberInLogs).toBe(true);
    });
  });

  describe("settings validation", () => {
    it("rejects invalid OCR engine type", async () => {
      const store = createInMemorySettingsStore();
      const svc = createSettingsService(store);
      await svc.loadSettings();

      await expect(svc.updateSettings({ ocr: { engineType: "invalid" as never } })).rejects.toThrow();
    });

    it("rejects out-of-range confidence threshold", async () => {
      const store = createInMemorySettingsStore();
      const svc = createSettingsService(store);
      await svc.loadSettings();

      await expect(svc.updateSettings({ ocr: { ocrConfidenceThreshold: 1.5 } })).rejects.toThrow();
    });

    it("rejects invalid theme", async () => {
      const store = createInMemorySettingsStore();
      const svc = createSettingsService(store);
      await svc.loadSettings();

      await expect(svc.updateSettings({ theme: "blue" as never })).rejects.toThrow();
    });
  });

  describe("settings change listeners", () => {
    it("notifies listeners on settings change", async () => {
      const svc = createSettingsService(createInMemorySettingsStore());
      await svc.loadSettings();

      const events: Array<{ key: string; from: unknown; to: unknown }> = [];
      svc.subscribe((event) => {
        events.push({ key: event.key, from: event.previousValue, to: event.newValue });
      });

      await svc.updateSettings({ theme: "dark" });

      expect(events.length).toBeGreaterThan(0);
      const themeEvent = events.find((e) => e.key === "theme");
      expect(themeEvent).toBeDefined();
      expect(themeEvent!.from).toBe("light");
      expect(themeEvent!.to).toBe("dark");
    });
  });
});

describe("Audit Log Integration", () => {
  let auditService: AuditLogService;
  let sessionId: string;

  beforeEach(() => {
    const store = createInMemoryAuditLogStore();
    auditService = createAuditLogService(store);
    sessionId = crypto.randomUUID();
  });

  describe("OCR attempt and failure flow", () => {
    it("records OCR attempt then failure on same session", async () => {
      await auditService.recordOcrAttempt(sessionId, {
        imageSize: "1920x1080",
        documentType: "PASSPORT",
      });

      await auditService.recordOcrFailure(sessionId, "Image too blurry", {
        stage: "quality_check",
        blurScore: 15,
      });

      const result = await auditService.query({ sessionId });
      expect(result.total).toBe(2);

      const events = result.entries.map((e) => e.eventType);
      expect(events).toContain("OCR_ATTEMPT");
      expect(events).toContain("OCR_FAILURE");
    });

    it("masks sensitive data in OCR attempt details", async () => {
      await auditService.recordOcrAttempt(sessionId, {
        passportNumber: "AB1234567",
        fullName: "JOHN DOE",
        imagePath: "/tmp/passport.jpg",
        documentType: "PASSPORT",
      });

      const result = await auditService.query({ sessionId });
      const entry = result.entries[0]!;
      expect(entry.details.passportNumber).toContain("*");
      expect(entry.details.fullName).toContain("*");
      expect(entry.details.imagePath).toBe("[REDACTED]");
      expect(entry.details.documentType).toBe("PASSPORT");
    });
  });

  describe("staff edit and confirmation flow", () => {
    it("records staff edit then confirmation in correct order", async () => {
      const confirmed = makeConfirmedFields({ lowConfidenceFields: ["dateOfBirth"] });

      await auditService.recordOcrAttempt(sessionId, { documentType: "PASSPORT" });
      await auditService.recordStaffEdit(sessionId, "dateOfBirth", {
        oldValue: "1985-10-10",
        newValue: "1985-10-11",
      });
      await auditService.recordConfirmation(sessionId, confirmed);

      const result = await auditService.query({ sessionId });
      expect(result.total).toBe(3);

      const eventTypes = result.entries.map((e) => e.eventType);
      expect(eventTypes).toContain("OCR_ATTEMPT");
      expect(eventTypes).toContain("STAFF_EDIT");
      expect(eventTypes).toContain("CONFIRMATION");
    });

    it("masks sensitive fields in confirmation", async () => {
      const confirmed = makeConfirmedFields();
      await auditService.recordConfirmation(sessionId, confirmed);

      const result = await auditService.query({ sessionId });
      const details = result.entries[0]!.details;
      const fields = details.fields as Record<string, unknown>;

      expect(fields.passportNumber).toContain("*");
      expect(fields.fullName).toContain("*");
      expect(fields.nationality).toBe("UTO");
    });

    it("records edit count in confirmation", async () => {
      const modified = makeNormalizedFields({ firstName: "JOHNNY" });
      const confirmed = makeConfirmedFields({
        fields: modified,
        edits: makeEditableFields({ firstName: "JOHNNY" }),
        original: makeNormalizedFields(),
      });

      await auditService.recordConfirmation(sessionId, confirmed);
      const result = await auditService.query({ sessionId });
      expect(result.entries[0]!.details.editCount).toBe(1);
    });
  });

  describe("auto-fill audit flow", () => {
    it("records successful auto-fill event", async () => {
      await auditService.recordAutoFill(sessionId, "profile-1", 5, true);
      const result = await auditService.query({ sessionId });

      expect(result.total).toBe(1);
      expect(result.entries[0]!.eventType).toBe("AUTO_FILL");
      expect(result.entries[0]!.details.profileId).toBe("profile-1");
      expect(result.entries[0]!.details.fieldCount).toBe(5);
      expect(result.entries[0]!.details.success).toBe(true);
    });

    it("records auto-fill failure event", async () => {
      await auditService.recordAutoFill(sessionId, "profile-2", 2, false, {
        error: "Target window not found",
      });

      const result = await auditService.query({ sessionId });
      expect(result.entries[0]!.eventType).toBe("AUTO_FILL_FAILURE");
      expect(result.entries[0]!.details.error).toBe("Target window not found");
    });

    it("records full OCR-to-auto-fill audit trail", async () => {
      const confirmed = makeConfirmedFields();

      await auditService.recordOcrAttempt(sessionId, { documentType: "PASSPORT" });
      await auditService.recordConfirmation(sessionId, confirmed);
      await auditService.recordAutoFill(sessionId, "profile-alpha", 7, true);

      const result = await auditService.query({ sessionId });
      expect(result.total).toBe(3);

      const eventTypes = result.entries.map((e) => e.eventType);
      expect(eventTypes).toContain("AUTO_FILL");
      expect(eventTypes).toContain("CONFIRMATION");
      expect(eventTypes).toContain("OCR_ATTEMPT");
    });
  });

  describe("audit log query and filtering", () => {
    it("filters by event type", async () => {
      await auditService.recordOcrAttempt("s1", {});
      await auditService.recordOcrFailure("s1", "Error");
      await auditService.recordAutoFill("s1", "p1", 1, true);

      const attempts = await auditService.query({ eventTypes: ["OCR_ATTEMPT"] });
      expect(attempts.total).toBe(1);
      expect(attempts.entries[0]!.eventType).toBe("OCR_ATTEMPT");
    });

    it("filters by session ID", async () => {
      await auditService.recordOcrAttempt("session-a", {});
      await auditService.recordOcrAttempt("session-b", {});

      const result = await auditService.query({ sessionId: "session-a" });
      expect(result.total).toBe(1);
    });

    it("paginates results", async () => {
      for (let i = 0; i < 5; i++) {
        await auditService.recordOcrAttempt(`session-${i}`, {});
      }

      const page1 = await auditService.query({ limit: 2, offset: 0 });
      expect(page1.entries).toHaveLength(2);
      expect(page1.total).toBe(5);
    });

    it("applies retention policy", async () => {
      const store = createInMemoryAuditLogStore();
      const svc = createAuditLogService(store, { maxAgeDays: 1, maxEntries: 1000 });

      const oldEntry: AuditLogEntry = {
        id: "old-entry",
        eventType: "OCR_ATTEMPT",
        timestamp: new Date("2020-01-01").toISOString(),
        sessionId: "old",
        details: {},
      };
      await store.put(oldEntry);
      await svc.recordOcrAttempt("new", {});

      const removed = await svc.applyRetentionPolicy();
      expect(removed).toBe(1);

      const remaining = await svc.query();
      expect(remaining.total).toBe(1);
      expect(remaining.entries[0]!.sessionId).toBe("new");
    });
  });
});

describe("Auto-Fill Execution Integration", () => {
  let mappingService: AutoFillMappingService;
  let executionService: AutoFillExecutionService;
  let mockExecutor: FillExecutor;

  beforeEach(() => {
    const profileStore = createInMemoryProfileStore();
    mappingService = createAutoFillMappingService(profileStore);
    mockExecutor = createMockExecutor();
    executionService = createAutoFillExecutionService(mockExecutor);
  });

  describe("mapping service to execution service flow", () => {
    it("applies mappings then executes fill with result", async () => {
      const fields = makeNormalizedFields();
      const profile = await mappingService.createProfile("Test PMS", "copy_assistant");
      const fullNameMap = makeMapping({
        id: crypto.randomUUID(),
        ocrField: "fullName" as OcrFieldKey,
        formField: "guestName",
        required: true,
        enabled: true,
      });
      const passportMap = makeMapping({
        id: crypto.randomUUID(),
        ocrField: "passportNumber" as OcrFieldKey,
        formField: "passportNo",
        required: true,
        enabled: true,
      });
      await mappingService.addMapping(profile.id, fullNameMap);
      await mappingService.addMapping(profile.id, passportMap);

      const applied = await mappingService.applyMappings(fields, profile.id);

      expect(applied.mappedCount).toBe(2);
      expect(applied.fieldValues.guestName).toBe("MUSTER JOHN MICHAEL");
      expect(applied.fieldValues.passportNo).toBe("AB123456");
      expect(applied.validationErrors).toHaveLength(0);

      const execResult = await executionService.executeFill(
        applied.fieldValues,
        (await mappingService.getProfile(profile.id))!,
      );

      expect(execResult.overallStatus).toBe("SUCCESS");
      expect(execResult.filledCount).toBe(2);
      expect(execResult.failedCount).toBe(0);
    });

    it("handles partial field mapping gracefully", async () => {
      const fields = makeNormalizedFields();
      const profile = await mappingService.createProfile("Partial PMS", "copy_assistant");
      await mappingService.setMappings(profile.id, [
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "fullName" as OcrFieldKey,
          formField: "guestName",
        }),
      ]);

      const applied = await mappingService.applyMappings(fields, profile.id);
      expect(applied.mappedCount).toBe(1);
      expect(applied.unmappedOcrFields.length).toBeGreaterThan(0);

      const execResult = await executionService.executeFill(
        applied.fieldValues,
        (await mappingService.getProfile(profile.id))!,
      );
      expect(execResult.overallStatus).toBe("SUCCESS");
      expect(execResult.filledCount).toBe(1);
    });
  });

  describe("test mode flow", () => {
    it("previews fill without executing", async () => {
      const fields = makeNormalizedFields();
      const profile = await mappingService.createProfile("Test PMS", "web");
      await mappingService.setMappings(profile.id, [
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "fullName" as OcrFieldKey,
          formField: "guestName",
        }),
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "passportNumber" as OcrFieldKey,
          formField: "passportNo",
        }),
      ]);

      const applied = await mappingService.applyMappings(fields, profile.id);

      const testResult = await executionService.testFill(
        applied.fieldValues,
        (await mappingService.getProfile(profile.id))!,
      );

      expect(testResult.previews).toHaveLength(2);
      expect(testResult.previews[0]!.formField).toBe("guestName");
      expect(testResult.previews[0]!.value).toBe("MUSTER JOHN MICHAEL");
      expect(testResult.previews[1]!.formField).toBe("passportNo");
      expect(testResult.previews[1]!.value).toBe("AB123456");
      expect(testResult.overallWouldSucceed).toBe(true);
    });

    it("reports warnings for missing field values in test", async () => {
      const profile = await mappingService.createProfile("Test PMS", "copy_assistant");
      await mappingService.setMappings(profile.id, [
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "fullName" as OcrFieldKey,
          formField: "guestName",
        }),
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "passportNumber" as OcrFieldKey,
          formField: "passportNo",
        }),
      ]);

      const testResult = await executionService.testFill(
        { guestName: "JOHN DOE" },
        (await mappingService.getProfile(profile.id))!,
      );

      expect(testResult.overallWouldSucceed).toBe(false);
      expect(testResult.warnings.length).toBeGreaterThan(0);
    });

    it("masks sensitive values in test previews", async () => {
      const profile = await mappingService.createProfile("Test PMS", "copy_assistant");
      await mappingService.setMappings(profile.id, [
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "passportNumber" as OcrFieldKey,
          formField: "passportNo",
        }),
      ]);

      const preview = await executionService.testFill(
        { passportNo: "AB1234567" },
        (await mappingService.getProfile(profile.id))!,
      );

      expect(preview.previews[0]!.maskedValue).toBe("AB***7");
    });
  });

  describe("validation before fill", () => {
    it("blocks fill when required fields are missing", async () => {
      const profile = await mappingService.createProfile("Strict PMS", "copy_assistant");
      await mappingService.setMappings(profile.id, [
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "fullName" as OcrFieldKey,
          formField: "guestName",
          required: true,
        }),
      ]);

      const result = await executionService.executeFill({}, profile);
      expect(result.overallStatus).toBe("FAILED");
      expect(result.failedCount).toBeGreaterThan(0);
    });

    it("validates date format before fill", async () => {
      const profile = await mappingService.createProfile("Date PMS", "copy_assistant");
      await mappingService.setMappings(profile.id, [
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "dateOfBirth" as OcrFieldKey,
          formField: "birthDate",
        }),
      ]);

      const validation = await executionService.validateBeforeFill({ birthDate: "not-a-date" }, profile);

      expect(validation.valid).toBe(false);
      expect(validation.errors[0]!.code).toBe("INVALID_FORMAT");
    });

    it("validates gender format before fill", async () => {
      const profile = await mappingService.createProfile("Gender PMS", "copy_assistant");
      await mappingService.setMappings(profile.id, [
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "gender" as OcrFieldKey,
          formField: "guestGender",
        }),
      ]);

      const validation = await executionService.validateBeforeFill({ guestGender: "INVALID" }, profile);

      expect(validation.valid).toBe(false);
      expect(validation.errors[0]!.code).toBe("INVALID_FORMAT");
    });

    it("evaluates safety rules during validation", async () => {
      const profile = await mappingService.createProfile("Safe PMS", "copy_assistant");
      await mappingService.setMappings(profile.id, [
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "fullName" as OcrFieldKey,
          formField: "guestName",
          required: true,
        }),
      ]);
      profile.safetyRules = [
        {
          id: "safety-1",
          type: "field_exists",
          config: { field: "guestName" },
        },
      ];
      await mappingService.saveProfile(profile);

      const result = await executionService.executeFill({}, profile);
      expect(result.overallStatus).toBe("FAILED");
    });
  });

  describe("multi-profile workflow", () => {
    it("switch between profiles and execute fill", async () => {
      const pmsA = await mappingService.createProfile("PMS A", "copy_assistant");
      const pmsB = await mappingService.createProfile("PMS B", "web");

      await mappingService.setMappings(pmsA.id, [
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "fullName" as OcrFieldKey,
          formField: "guestName",
        }),
      ]);
      await mappingService.setMappings(pmsB.id, [
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "fullName" as OcrFieldKey,
          formField: "customerName",
        }),
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "passportNumber" as OcrFieldKey,
          formField: "docNumber",
        }),
      ]);

      const fields = makeNormalizedFields();

      const resultA = mappingService.applyMappingsWithProfile(fields, pmsA);
      expect(resultA.fieldValues.guestName).toBe("MUSTER JOHN MICHAEL");
      expect(resultA.mappedCount).toBe(1);

      const resultB = mappingService.applyMappingsWithProfile(fields, pmsB);
      expect(resultB.fieldValues.customerName).toBe("MUSTER JOHN MICHAEL");
      expect(resultB.fieldValues.docNumber).toBe("AB123456");
      expect(resultB.mappedCount).toBe(2);
    });
  });

  describe("auto-fill executor delegation", () => {
    it("delegates to fillCopyAssistant for copy_assistant target", async () => {
      let called = false;
      const executor: FillExecutor = {
        ...createMockExecutor(),
        fillCopyAssistant: async (_value: string) => {
          called = true;
        },
      };
      executionService = createAutoFillExecutionService(executor);

      const profile = await mappingService.createProfile("Copy PMS", "copy_assistant");
      await mappingService.setMappings(profile.id, [
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "fullName" as OcrFieldKey,
          formField: "guestName",
        }),
      ]);

      await executionService.executeFill({ guestName: "JOHN DOE" }, profile);
      expect(called).toBe(true);
    });

    it("delegates to fillWebField for web target", async () => {
      let capturedValue = "";
      const executor: FillExecutor = {
        ...createMockExecutor(),
        fillWebField: async (_field: string, value: string) => {
          capturedValue = value;
        },
      };
      executionService = createAutoFillExecutionService(executor);

      const profile = await mappingService.createProfile("Web PMS", "web");
      await mappingService.setMappings(profile.id, [
        makeMapping({
          id: crypto.randomUUID(),
          ocrField: "fullName" as OcrFieldKey,
          formField: "guestName",
        }),
      ]);

      await executionService.executeFill({ guestName: "JOHN DOE" }, profile);
      expect(capturedValue).toBe("JOHN DOE");
    });
  });
});

describe("End-to-end: Settings → OCR attempt → Confirm → Auto-fill → Audit trail", () => {
  it("completes full workflow integration", async () => {
    const settingsStore = createInMemorySettingsStore();
    const settingsService = createSettingsService(settingsStore);
    const auditStore = createInMemoryAuditLogStore();
    const auditService = createAuditLogService(auditStore);
    const profileStore = createInMemoryProfileStore();
    const mappingService = createAutoFillMappingService(profileStore);
    const mockExecutor = createMockExecutor();
    const executionService = createAutoFillExecutionService(mockExecutor);

    const sessionId = crypto.randomUUID();

    await settingsService.loadSettings();
    const updatedSettings = await settingsService.updateSettings({
      ocr: { engineType: "tesseract", enableFallback: true },
      autoFill: { enableTestMode: true, activeProfileId: "profile-main" },
    });
    expect(updatedSettings.ocr.engineType).toBe("tesseract");
    expect(updatedSettings.ocr.enableFallback).toBe(true);

    const profile = await mappingService.createProfile("Main PMS", "copy_assistant");
    await mappingService.setMappings(profile.id, [
      makeMapping({
        id: crypto.randomUUID(),
        ocrField: "fullName" as OcrFieldKey,
        formField: "guestName",
      }),
      makeMapping({
        id: crypto.randomUUID(),
        ocrField: "passportNumber" as OcrFieldKey,
        formField: "passportNo",
      }),
      makeMapping({
        id: crypto.randomUUID(),
        ocrField: "dateOfBirth" as OcrFieldKey,
        formField: "birthDate",
      }),
      makeMapping({
        id: crypto.randomUUID(),
        ocrField: "nationality" as OcrFieldKey,
        formField: "nationality",
      }),
    ]);

    await auditService.recordOcrAttempt(sessionId, {
      engineType: settingsService.getSettings().ocr.engineType,
      documentType: "PASSPORT",
      profileId: profile.id,
    });

    const fields = makeNormalizedFields();
    const confirmed = makeConfirmedFields({ fields });

    await auditService.recordConfirmation(sessionId, confirmed);

    const applied = mappingService.applyMappingsWithProfile(fields, profile);
    expect(applied.mappedCount).toBe(4);
    expect(applied.fieldValues.guestName).toBe("MUSTER JOHN MICHAEL");
    expect(applied.fieldValues.passportNo).toBe("AB123456");

    const execResult = await executionService.executeFill(applied.fieldValues, profile);
    expect(execResult.overallStatus).toBe("SUCCESS");
    expect(execResult.filledCount).toBe(4);

    await auditService.recordAutoFill(sessionId, profile.id, execResult.filledCount, true);

    const auditTrail = await auditService.query({ sessionId });
    expect(auditTrail.total).toBe(3);

    const eventOrder = auditTrail.entries.map((e) => e.eventType);
    expect(eventOrder).toContain("OCR_ATTEMPT");
    expect(eventOrder).toContain("CONFIRMATION");
    expect(eventOrder).toContain("AUTO_FILL");

    const loadedSettings = settingsService.getSettings();
    expect(loadedSettings.ocr.engineType).toBe("tesseract");
    expect(loadedSettings.autoFill.activeProfileId).toBe("profile-main");
  });
});
