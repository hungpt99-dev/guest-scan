import { describe, it, expect, beforeEach } from "vitest";
import {
  createAutoFillExecutionService,
  type AutoFillExecutionService,
  type AutoFillProfile,
  type FieldMappingEntry,
  type FieldFillTarget,
  type FillExecutor,
} from "../../services/auto-fill-execution-service";
import type { TargetSystemType, SafetyRule } from "@guestfill/shared";

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

function makeProfile(
  overrides: Partial<AutoFillProfile> & {
    mappings?: FieldMappingEntry[];
    targetSystem?: TargetSystemType;
    safetyRules?: SafetyRule[];
  } = {},
): AutoFillProfile {
  return {
    id: "test-profile",
    name: "Test Profile",
    description: "",
    targetSystem: "copy_assistant",
    mappings: [],
    safetyRules: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    isDefault: false,
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

describe("AutoFillExecutionService", () => {
  let service: AutoFillExecutionService;
  let mockExecutor: FillExecutor;

  beforeEach(() => {
    mockExecutor = createMockExecutor();
    service = createAutoFillExecutionService(mockExecutor);
  });

  describe("executeFill", () => {
    it("fills all enabled mapped fields successfully", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({ ocrField: "fullName", formField: "guestName" }),
          makeMapping({ ocrField: "passportNumber", formField: "passportNo" }),
        ],
      });

      const result = await service.executeFill({ guestName: "JANE DOE", passportNo: "XY9876543" }, profile);

      expect(result.overallStatus).toBe("SUCCESS");
      expect(result.filledCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(result.skippedCount).toBe(0);
      expect(result.fieldResults[0]!.status).toBe("FILLED");
      expect(result.fieldResults[1]!.status).toBe("FILLED");
      expect(result.fieldResults[0]!.value).toBe("JANE DOE");
      expect(result.fieldResults[1]!.value).toBe("XY9876543");
      expect(result.profileName).toBe("Test Profile");
      expect(result.totalFields).toBe(2);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("skips fields with null or undefined values", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({ ocrField: "fullName", formField: "guestName" }),
          makeMapping({ ocrField: "passportNumber", formField: "passportNo" }),
        ],
      });

      const result = await service.executeFill({ guestName: "JOHN DOE" }, profile);

      expect(result.overallStatus).toBe("PARTIAL");
      expect(result.filledCount).toBe(1);
      expect(result.skippedCount).toBe(1);
      expect(result.fieldResults[1]!.status).toBe("SKIPPED");
      expect(result.fieldResults[1]!.error).toBe("No value available");
    });

    it("returns FAILED when validation fails", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "fullName",
            formField: "guestName",
            required: true,
            enabled: true,
          }),
        ],
      });

      const result = await service.executeFill({}, profile);

      expect(result.overallStatus).toBe("FAILED");
      expect(result.filledCount).toBe(0);
      expect(result.failedCount).toBe(1);
    });

    it("does not fill disabled mappings", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({ ocrField: "fullName", formField: "guestName", enabled: true }),
          makeMapping({ ocrField: "passportNumber", formField: "passportNo", enabled: false }),
        ],
      });

      const result = await service.executeFill({ guestName: "JOHN DOE", passportNo: "XY9876543" }, profile);

      expect(result.filledCount).toBe(1);
      expect(result.totalFields).toBe(1);
    });

    it("masks sensitive field values in result", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({ ocrField: "fullName", formField: "guestName" }),
          makeMapping({ ocrField: "passportNumber", formField: "passportNo" }),
        ],
      });

      const result = await service.executeFill({ guestName: "JOHN DOE", passportNo: "AB1234567" }, profile);

      const passportField = result.fieldResults.find((f) => f.formField === "passportNo")!;
      expect(passportField.maskedValue).toBe("AB***7");
      const nameField = result.fieldResults.find((f) => f.formField === "guestName")!;
      expect(nameField.maskedValue).toBe("JOHN DOE");
    });

    it("respects field delay option", async () => {
      const profile = makeProfile({
        mappings: [makeMapping({ ocrField: "fullName", formField: "guestName" })],
      });

      const start = performance.now();
      const result = await service.executeFill({ guestName: "JOHN DOE" }, profile, undefined, { fieldDelayMs: 10 });
      const elapsed = performance.now() - start;

      expect(result.overallStatus).toBe("SUCCESS");
      expect(elapsed).toBeGreaterThanOrEqual(10);
    });

    it("handles empty mappings gracefully", async () => {
      const profile = makeProfile();
      const result = await service.executeFill({ guestName: "JOHN DOE" }, profile);

      expect(result.overallStatus).toBe("SUCCESS");
      expect(result.totalFields).toBe(0);
      expect(result.filledCount).toBe(0);
    });

    it("calls fillCopyAssistant for copy_assistant target system", async () => {
      let called = false;
      const executor: FillExecutor = {
        ...createMockExecutor(),
        fillCopyAssistant: async (_value: string) => {
          called = true;
        },
      };
      service = createAutoFillExecutionService(executor);

      const profile = makeProfile({
        targetSystem: "copy_assistant",
        mappings: [makeMapping({ ocrField: "fullName", formField: "guestName" })],
      });

      await service.executeFill({ guestName: "JOHN DOE" }, profile);
      expect(called).toBe(true);
    });

    it("calls fillWebField for web target system", async () => {
      let called = false;
      const executor: FillExecutor = {
        ...createMockExecutor(),
        fillWebField: async (_formField: string, _value: string, _target?: FieldFillTarget) => {
          called = true;
        },
      };
      service = createAutoFillExecutionService(executor);

      const profile = makeProfile({
        targetSystem: "web",
        mappings: [makeMapping({ ocrField: "fullName", formField: "guestName" })],
      });

      await service.executeFill({ guestName: "JOHN DOE" }, profile);
      expect(called).toBe(true);
    });
  });

  describe("testFill", () => {
    it("returns previews for all enabled mappings", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({ ocrField: "fullName", formField: "guestName" }),
          makeMapping({ ocrField: "passportNumber", formField: "passportNo" }),
        ],
      });

      const result = await service.testFill({ guestName: "JOHN DOE", passportNo: "AB1234567" }, profile);

      expect(result.previews).toHaveLength(2);
      expect(result.previews[0]!.formField).toBe("guestName");
      expect(result.previews[0]!.value).toBe("JOHN DOE");
      expect(result.previews[1]!.formField).toBe("passportNo");
      expect(result.previews[1]!.value).toBe("AB1234567");
      expect(result.overallWouldSucceed).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it("reports warnings for missing values", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({ ocrField: "fullName", formField: "guestName" }),
          makeMapping({ ocrField: "passportNumber", formField: "passportNo" }),
        ],
      });

      const result = await service.testFill({ guestName: "JOHN DOE" }, profile);

      expect(result.overallWouldSucceed).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.previews[1]!.wouldSucceed).toBe(false);
      expect(result.previews[1]!.warning).toBe("No value available");
    });

    it("includes selector and automationId when provided", async () => {
      const profile = makeProfile({
        mappings: [makeMapping({ ocrField: "fullName", formField: "guestName" })],
      });

      const targets: Record<string, FieldFillTarget> = {
        guestName: { selector: "#guest-name-input", automationId: "guestNameField" },
      };

      const result = await service.testFill({ guestName: "JOHN DOE" }, profile, targets);

      expect(result.previews[0]!.selector).toBe("#guest-name-input");
      expect(result.previews[0]!.automationId).toBe("guestNameField");
    });

    it("includes validation warnings in test result", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "fullName",
            formField: "guestName",
            required: true,
            enabled: true,
          }),
        ],
      });

      const result = await service.testFill({}, profile);

      expect(result.overallWouldSucceed).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("masks sensitive values in previews", async () => {
      const profile = makeProfile({
        mappings: [makeMapping({ ocrField: "passportNumber", formField: "passportNo" })],
      });

      const result = await service.testFill({ passportNo: "AB1234567" }, profile);

      expect(result.previews[0]!.maskedValue).toBe("AB***7");
    });
  });

  describe("validateBeforeFill", () => {
    it("passes validation when all required fields have values", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "fullName",
            formField: "guestName",
            required: true,
            enabled: true,
          }),
        ],
      });

      const validation = await service.validateBeforeFill({ guestName: "JOHN DOE" }, profile);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("fails when required field is missing", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "fullName",
            formField: "guestName",
            required: true,
            enabled: true,
          }),
        ],
      });

      const validation = await service.validateBeforeFill({}, profile);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0]!.code).toBe("EMPTY_VALUE");
      expect(validation.errors[0]!.field).toBe("guestName");
    });

    it("skips validation for non-required missing fields", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "fullName",
            formField: "guestName",
            required: false,
            enabled: true,
          }),
        ],
      });

      const validation = await service.validateBeforeFill({}, profile);

      expect(validation.valid).toBe(true);
    });

    it("rejects invalid date format", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "dateOfBirth",
            formField: "birthDate",
            enabled: true,
          }),
        ],
      });

      const validation = await service.validateBeforeFill({ birthDate: "not-a-date" }, profile);

      expect(validation.valid).toBe(false);
      expect(validation.errors[0]!.code).toBe("INVALID_FORMAT");
    });

    it("accepts valid date format", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "dateOfBirth",
            formField: "birthDate",
            enabled: true,
          }),
        ],
      });

      const validation = await service.validateBeforeFill({ birthDate: "1990-01-15" }, profile);

      expect(validation.valid).toBe(true);
    });

    it("rejects invalid date format for expiry date field", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "expiryDate",
            formField: "expiryDate",
            enabled: true,
          }),
        ],
      });

      const validation = await service.validateBeforeFill({ expiryDate: "invalid" }, profile);

      expect(validation.valid).toBe(false);
      expect(validation.errors[0]!.code).toBe("INVALID_FORMAT");
    });

    it("rejects invalid gender format", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "gender",
            formField: "guestGender",
            enabled: true,
          }),
        ],
      });

      const validation = await service.validateBeforeFill({ guestGender: "INVALID" }, profile);

      expect(validation.valid).toBe(false);
      expect(validation.errors[0]!.code).toBe("INVALID_FORMAT");
    });

    it("accepts valid gender values", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "gender",
            formField: "guestGender",
            enabled: true,
          }),
        ],
      });

      const validGenders = ["M", "F", "X", "UNKNOWN"];
      for (const gender of validGenders) {
        const validation = await service.validateBeforeFill({ guestGender: gender }, profile);
        expect(validation.valid).toBe(true);
      }
    });

    it("blocks fill when safety rule field_exists fails", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "fullName",
            formField: "guestName",
            required: true,
            enabled: true,
          }),
        ],
        safetyRules: [
          {
            id: "rule-1",
            type: "field_exists",
            config: { field: "guestName" },
          },
        ],
      });

      const validation = await service.validateBeforeFill({}, profile);

      expect(validation.valid).toBe(false);
      const hasSafetyError = validation.errors.some((e) => e.code === "SAFETY_RULE_BLOCKED");
      expect(hasSafetyError).toBe(true);
    });

    it("passes validation when safety rule passes", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "fullName",
            formField: "guestName",
            enabled: true,
          }),
        ],
        safetyRules: [
          {
            id: "rule-1",
            type: "field_exists",
            config: { field: "guestName" },
          },
        ],
      });

      const validation = await service.validateBeforeFill({ guestName: "JOHN DOE" }, profile);

      expect(validation.valid).toBe(true);
    });

    it("ignores disabled mappings in validation", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({
            ocrField: "fullName",
            formField: "guestName",
            required: true,
            enabled: false,
          }),
        ],
      });

      const validation = await service.validateBeforeFill({}, profile);

      expect(validation.valid).toBe(true);
    });
  });

  describe("masking", () => {
    it("masks passport numbers and ids in result but not names", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({ ocrField: "fullName", formField: "guestName" }),
          makeMapping({ ocrField: "passportNumber", formField: "passportNo" }),
          makeMapping({ ocrField: "idNumber", formField: "idNumber" }),
        ],
      });

      const result = await service.executeFill(
        {
          guestName: "JOHN DOE",
          passportNo: "AB1234567",
          idNumber: "ID9876543",
        },
        profile,
      );

      const nameField = result.fieldResults.find((f) => f.formField === "guestName")!;
      expect(nameField.maskedValue).toBe("JOHN DOE");

      const passportField = result.fieldResults.find((f) => f.formField === "passportNo")!;
      expect(passportField.maskedValue).toBe("AB***7");

      const idField = result.fieldResults.find((f) => f.formField === "idNumber")!;
      expect(idField.maskedValue).toBe("ID***3");
    });

    it("masks values in test previews for sensitive fields", async () => {
      const profile = makeProfile({
        mappings: [
          makeMapping({ ocrField: "passportNumber", formField: "passportNo" }),
          makeMapping({ ocrField: "idNumber", formField: "idNumber" }),
        ],
      });

      const result = await service.testFill(
        {
          passportNo: "AB1234567",
          idNumber: "ID9876543",
        },
        profile,
      );

      expect(result.previews[0]!.maskedValue).toBe("AB***7");
      expect(result.previews[1]!.maskedValue).toBe("ID***3");
    });
  });

  describe("executor delegation", () => {
    it("passes field targets to web fill executor", async () => {
      let capturedTarget: FieldFillTarget | undefined;
      const executor: FillExecutor = {
        ...createMockExecutor(),
        fillWebField: async (_formField: string, _value: string, target?: FieldFillTarget) => {
          capturedTarget = target;
        },
      };
      service = createAutoFillExecutionService(executor);

      const profile = makeProfile({
        targetSystem: "web",
        mappings: [makeMapping({ ocrField: "fullName", formField: "guestName" })],
      });
      const targets: Record<string, FieldFillTarget> = {
        guestName: { selector: "#name-input" },
      };

      await service.executeFill({ guestName: "JOHN DOE" }, profile, targets);
      expect(capturedTarget).toEqual({ selector: "#name-input" });
    });

    it("fails fill when executor throws", async () => {
      const executor: FillExecutor = {
        ...createMockExecutor(),
        fillCopyAssistant: async () => {
          throw new Error("Target app not responding");
        },
      };
      service = createAutoFillExecutionService(executor);

      const profile = makeProfile({
        mappings: [makeMapping({ ocrField: "fullName", formField: "guestName" })],
      });

      const result = await service.executeFill({ guestName: "JOHN DOE" }, profile);
      expect(result.fieldResults[0]!.status).toBe("FAILED");
      expect(result.fieldResults[0]!.error).toBe("Target app not responding");
      expect(result.overallStatus).toBe("FAILED");
    });
  });
});
