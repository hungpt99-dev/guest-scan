import { describe, it, expect, beforeEach } from "vitest";
import {
  createAutoFillMappingService,
  createInMemoryProfileStore,
  createIndexedDbProfileStore,
  type AutoFillMappingService,
  type FieldMappingEntry,
  type AutoFillProfile,
  OCR_FIELD_KEYS,
  OCR_FIELD_LABELS,
  FORM_FIELD_LABELS,
  FORM_FIELD_KEYS,
} from "../../services/auto-fill-mapping-service";
import type { NormalizedFields } from "../../services/field_normalization_service";

function makeFields(overrides: Partial<NormalizedFields> = {}): NormalizedFields {
  return {
    fullName: "JOHN DOE",
    firstName: "JOHN",
    lastName: "DOE",
    gender: "M",
    dateOfBirth: "1990-01-15",
    nationality: "USA",
    countryCode: "USA",
    documentType: "PASSPORT",
    documentNumber: "AB1234567",
    passportNumber: "AB1234567",
    idNumber: "",
    issueDate: "2020-06-01",
    expiryDate: "2030-06-01",
    issuingCountry: "USA",
    mrzRaw: "P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<\nAB1234567<USA9001155M3006017<<<<<<<<",
    mrzParsed: ["P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<", "AB1234567<USA9001155M3006017<<<<<<<<"],
    rawOriginal: {
      fullName: "JOHN DOE",
      surname: "DOE",
      givenName: "JOHN",
      gender: "M",
      dateOfBirth: "900115",
      nationality: "USA",
      issuingCountry: "USA",
      documentType: "P",
      passportNumber: "AB1234567",
      documentNumber: "AB1234567",
      idNumber: "",
      issueDate: "",
      expiryDate: "300601",
      mrzRaw: "P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<\nAB1234567<USA9001155M3006017<<<<<<<<",
    },
    ...overrides,
  };
}

function makeMapping(overrides: Partial<FieldMappingEntry> = {}): FieldMappingEntry {
  return {
    id: crypto.randomUUID(),
    ocrField: "fullName",
    formField: "fullName",
    required: false,
    enabled: true,
    ...overrides,
  };
}

describe("AutoFillMappingService - Profile CRUD", () => {
  let service: AutoFillMappingService;

  beforeEach(() => {
    const store = createInMemoryProfileStore();
    service = createAutoFillMappingService(store);
  });

  it("creates profile with description and custom target system", async () => {
    const profile = await service.createProfile("Web PMS", "web");
    expect(profile.name).toBe("Web PMS");
    expect(profile.targetSystem).toBe("web");
    expect(profile.description).toBe("");
    expect(profile.id).toBeTruthy();
    expect(profile.safetyRules).toEqual([]);
    expect(profile.createdAt).toBeTruthy();
    expect(profile.updatedAt).toBeTruthy();
  });

  it("sets first created profile as default", async () => {
    const p1 = await service.createProfile("First");
    expect(p1.isDefault).toBe(true);
    const p2 = await service.createProfile("Second");
    expect(p2.isDefault).toBe(false);
  });

  it("setDefaultProfile updates only the specified profile to default", async () => {
    const p1 = await service.createProfile("Profile A");
    const p2 = await service.createProfile("Profile B");
    await service.setDefaultProfile(p2.id);
    const defaultProfile = await service.getDefaultProfile();
    expect(defaultProfile!.id).toBe(p2.id);
    const allProfiles = await service.getAllProfiles();
    const p1refreshed = allProfiles.find((p) => p.id === p1.id);
    expect(p1refreshed!.isDefault).toBe(false);
  });

  it("getDefaultProfile returns undefined when no profiles exist", async () => {
    const result = await service.getDefaultProfile();
    expect(result).toBeUndefined();
  });

  it("getProfile returns undefined for non-existent id", async () => {
    const result = await service.getProfile("non-existent");
    expect(result).toBeUndefined();
  });

  it("deleteProfile on non-existent id does not throw", async () => {
    await expect(service.deleteProfile("non-existent")).resolves.not.toThrow();
  });

  it("saveProfile updates the updatedAt timestamp", async () => {
    const profile = await service.createProfile("Original");
    const originalUpdatedAt = profile.updatedAt;
    await new Promise((r) => setTimeout(r, 10));
    profile.name = "Updated";
    await service.saveProfile(profile);
    expect(profile.updatedAt).not.toBe(originalUpdatedAt);
  });

  it("handles multiple profile CRUD operations", async () => {
    const _p1 = await service.createProfile("P1");
    void _p1;
    const p2 = await service.createProfile("P2");
    const _p3 = await service.createProfile("P3");
    void _p3;
    expect((await service.getAllProfiles()).length).toBe(3);
    await service.deleteProfile(p2.id);
    expect((await service.getAllProfiles()).length).toBe(2);
    const remaining = await service.getAllProfiles();
    expect(remaining.find((p) => p.id === p2.id)).toBeUndefined();
  });
});

describe("AutoFillMappingService - Field Mappings with Transforms", () => {
  let service: AutoFillMappingService;

  beforeEach(() => {
    const store = createInMemoryProfileStore();
    service = createAutoFillMappingService(store);
  });

  it("adds mapping with transform rules", async () => {
    const profile = await service.createProfile("With Transforms");
    const mapping = makeMapping({
      ocrField: "fullName",
      formField: "guestName",
      transform: [{ type: "uppercase" }],
    });
    const updated = await service.addMapping(profile.id, mapping);
    expect(updated.mappings[0]!.transform).toBeDefined();
    expect(updated.mappings[0]!.transform).toHaveLength(1);
    expect(updated.mappings[0]!.transform![0]!.type).toBe("uppercase");
  });

  it("setMappings replaces all existing mappings", async () => {
    const profile = await service.createProfile("Replace");
    const m1 = makeMapping({ ocrField: "fullName", formField: "name" });
    const m2 = makeMapping({ ocrField: "passportNumber", formField: "passport" });
    await service.addMapping(profile.id, m1);
    await service.setMappings(profile.id, [m2]);
    expect((await service.getProfile(profile.id))!.mappings).toHaveLength(1);
    expect((await service.getProfile(profile.id))!.mappings[0]!.ocrField).toBe("passportNumber");
  });

  it("updateMapping throws when mapping not found", async () => {
    const profile = await service.createProfile("No Map");
    const mapping = makeMapping({ id: "nonexistent" });
    await expect(service.updateMapping(profile.id, mapping)).rejects.toThrow();
  });

  it("removeMapping removes correct mapping by id", async () => {
    const profile = await service.createProfile("Remove Test");
    const m1 = makeMapping({ ocrField: "fullName", formField: "name" });
    const m2 = makeMapping({ ocrField: "passportNumber", formField: "passport" });
    await service.addMapping(profile.id, m1);
    await service.addMapping(profile.id, m2);
    const afterRemove = await service.removeMapping(profile.id, m1.id);
    expect(afterRemove.mappings).toHaveLength(1);
    expect(afterRemove.mappings[0]!.id).toBe(m2.id);
  });

  it("applies mappings with transform rules", async () => {
    const profile = await service.createProfile("Transform Test");
    const fields = makeFields();
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "fullName",
        formField: "guestName",
        enabled: true,
        transform: [{ type: "uppercase" }],
      }),
    );
    const result = await service.applyMappings(fields, profile.id);
    expect(result.fieldValues.guestName).toBe("JOHN DOE");
  });
});

describe("AutoFillMappingService - applyMappings edge cases", () => {
  let service: AutoFillMappingService;

  beforeEach(() => {
    const store = createInMemoryProfileStore();
    service = createAutoFillMappingService(store);
  });

  it("handles empty profile mappings gracefully", async () => {
    const profile = await service.createProfile("Empty");
    const fields = makeFields();
    const result = await service.applyMappings(fields, profile.id);
    expect(result.mappedCount).toBe(0);
    expect(Object.keys(result.fieldValues)).toHaveLength(0);
  });

  it("returns field value for mapped OCR fields", async () => {
    const profile = await service.createProfile("Mapped Fields");
    const fields = makeFields();
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "fullName",
        formField: "guestName",
        enabled: true,
      }),
    );
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "passportNumber",
        formField: "passportNo",
        enabled: true,
      }),
    );
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "nationality",
        formField: "country",
        enabled: true,
      }),
    );
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "dateOfBirth",
        formField: "dob",
        enabled: true,
      }),
    );

    const result = await service.applyMappings(fields, profile.id);
    expect(result.fieldValues.guestName).toBe("JOHN DOE");
    expect(result.fieldValues.passportNo).toBe("AB1234567");
    expect(result.fieldValues.country).toBe("USA");
    expect(result.fieldValues.dob).toBe("1990-01-15");
    expect(result.mappedCount).toBe(4);
  });

  it("skips disabled mappings and counts only enabled", async () => {
    const profile = await service.createProfile("Disabled Check");
    const fields = makeFields();
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "fullName",
        formField: "name",
        enabled: true,
      }),
    );
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "passportNumber",
        formField: "passport",
        enabled: false,
      }),
    );
    const result = await service.applyMappings(fields, profile.id);
    expect(result.mappedCount).toBe(1);
    expect(result.fieldValues.name).toBe("JOHN DOE");
    expect(result.fieldValues.passport).toBeUndefined();
  });

  it("reports unmapped OCR fields that have values", async () => {
    const profile = await service.createProfile("Partial Map");
    const fields = makeFields();
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "fullName",
        formField: "name",
        enabled: true,
      }),
    );
    const result = await service.applyMappings(fields, profile.id);
    expect(result.unmappedOcrFields.length).toBeGreaterThan(0);
    expect(result.unmappedOcrFields).toContain("passportNumber");
    expect(result.unmappedOcrFields).toContain("nationality");
  });

  it("does not report unmapped fields that have empty values", async () => {
    const profile = await service.createProfile("Partial with Empty");
    const fields = makeFields({ idNumber: "" });
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "fullName",
        formField: "name",
        enabled: true,
      }),
    );
    const result = await service.applyMappings(fields, profile.id);
    expect(result.unmappedOcrFields).not.toContain("idNumber");
  });

  it("reports required but disabled mappings as unmapped required", async () => {
    const profile = await service.createProfile("Required Disabled");
    const fields = makeFields();
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "fullName",
        formField: "name",
        required: true,
        enabled: false,
      }),
    );
    const result = await service.applyMappings(fields, profile.id);
    expect(result.unmappedRequiredFields).toContain("name");
  });

  it("throws for non-existent profile", async () => {
    const fields = makeFields();
    await expect(service.applyMappings(fields, "bad-id")).rejects.toThrow();
  });
});

describe("AutoFillMappingService - applyMappingsWithProfile", () => {
  let service: AutoFillMappingService;

  beforeEach(() => {
    service = createAutoFillMappingService(createInMemoryProfileStore());
  });

  it("applies mappings from a profile object directly", () => {
    const fields = makeFields();
    const profile: AutoFillProfile = {
      id: "inline-test",
      name: "Inline",
      description: "",
      targetSystem: "desktop",
      mappings: [
        makeMapping({ ocrField: "fullName", formField: "full_name", enabled: true }),
        makeMapping({ ocrField: "dateOfBirth", formField: "dob", enabled: true }),
        makeMapping({ ocrField: "passportNumber", formField: "pass_no", enabled: true }),
      ],
      safetyRules: [],
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      isDefault: false,
    };
    const result = service.applyMappingsWithProfile(fields, profile);
    expect(result.fieldValues.full_name).toBe("JOHN DOE");
    expect(result.fieldValues.dob).toBe("1990-01-15");
    expect(result.fieldValues.pass_no).toBe("AB1234567");
    expect(result.mappedCount).toBe(3);
  });
});

describe("AutoFillMappingService - testMappings", () => {
  let service: AutoFillMappingService;

  beforeEach(() => {
    const store = createInMemoryProfileStore();
    service = createAutoFillMappingService(store);
  });

  it("returns preview with original and transformed values", async () => {
    const profile = await service.createProfile("Test Mode");
    const fields = makeFields();
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "fullName",
        formField: "guestName",
        enabled: true,
      }),
    );
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "passportNumber",
        formField: "passportNo",
        enabled: true,
      }),
    );

    const result = await service.testMappings(fields, profile.id);
    expect(result.testMode).toBe(true);
    expect(result.preview).toHaveLength(2);
    expect(result.preview[0]!.originalValue).toBe("JOHN DOE");
    expect(result.preview[0]!.transformedValue).toBe("JOHN DOE");
    expect(result.preview[1]!.originalValue).toBe("AB1234567");
    expect(result.preview[1]!.transformedValue).toBe("AB1234567");
    expect(result.mappedCount).toBe(2);
  });

  it("testMappingsWithProfile works with direct profile object", () => {
    const fields = makeFields();
    const profile: AutoFillProfile = {
      id: "test-direct",
      name: "Test Direct",
      description: "",
      targetSystem: "copy_assistant",
      mappings: [makeMapping({ ocrField: "fullName", formField: "guestName", enabled: true })],
      safetyRules: [],
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      isDefault: false,
    };
    const result = service.testMappingsWithProfile(fields, profile);
    expect(result.testMode).toBe(true);
    expect(result.preview).toHaveLength(1);
    expect(result.preview[0]!.originalValue).toBe("JOHN DOE");
    expect(result.preview[0]!.formField).toBe("guestName");
  });

  it("throws for non-existent profile in testMappings", async () => {
    const fields = makeFields();
    await expect(service.testMappings(fields, "bad-id")).rejects.toThrow();
  });

  it("preview excludes disabled mappings", async () => {
    const profile = await service.createProfile("Mixed");
    const fields = makeFields();
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "fullName",
        formField: "name",
        enabled: true,
      }),
    );
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "passportNumber",
        formField: "passport",
        enabled: false,
      }),
    );
    const result = await service.testMappings(fields, profile.id);
    expect(result.preview).toHaveLength(1);
    expect(result.preview[0]!.formField).toBe("name");
  });
});

describe("AutoFillMappingService - Validation", () => {
  let service: AutoFillMappingService;

  beforeEach(() => {
    service = createAutoFillMappingService(createInMemoryProfileStore());
  });

  describe("validateMappingEntry", () => {
    it("accepts valid mapping entry", () => {
      const entry = makeMapping();
      expect(service.validateMappingEntry(entry)).toHaveLength(0);
    });

    it("rejects empty form field", () => {
      const entry = makeMapping({ formField: "" });
      const errors = service.validateMappingEntry(entry);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.code).toBe("EMPTY_FORM_FIELD");
    });

    it("rejects whitespace-only form field", () => {
      const entry = makeMapping({ formField: "   " });
      const errors = service.validateMappingEntry(entry);
      expect(errors.some((e) => e.code === "EMPTY_FORM_FIELD")).toBe(true);
    });

    it("rejects duplicate mapping (same ocrField + formField)", () => {
      const entry = makeMapping({ ocrField: "fullName", formField: "name" });
      const existing = [makeMapping({ ocrField: "fullName", formField: "name" })];
      const errors = service.validateMappingEntry(entry, existing);
      expect(errors.some((e) => e.code === "DUPLICATE_MAPPING")).toBe(true);
    });

    it("allows same ocrField mapping to different formField", () => {
      const entry = makeMapping({ ocrField: "fullName", formField: "guest_name" });
      const existing = [makeMapping({ ocrField: "fullName", formField: "full_name" })];
      const errors = service.validateMappingEntry(entry, existing);
      expect(errors.some((e) => e.code === "DUPLICATE_MAPPING")).toBe(false);
    });

    it("rejects invalid OCR field key", () => {
      const entry = makeMapping({ ocrField: "invalidField" as never });
      const errors = service.validateMappingEntry(entry);
      expect(errors.some((e) => e.code === "INVALID_OCR_FIELD")).toBe(true);
    });
  });

  describe("validateProfile", () => {
    it("returns no errors for valid profile", () => {
      const profile: AutoFillProfile = {
        id: "valid-profile",
        name: "Valid",
        description: "",
        targetSystem: "copy_assistant",
        mappings: [makeMapping()],
        safetyRules: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        isDefault: false,
      };
      expect(service.validateProfile(profile)).toHaveLength(0);
    });

    it("flags required mappings that are disabled", () => {
      const profile: AutoFillProfile = {
        id: "required-disabled",
        name: "Required Disabled",
        description: "",
        targetSystem: "copy_assistant",
        mappings: [makeMapping({ required: true, enabled: false })],
        safetyRules: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        isDefault: false,
      };
      const errors = service.validateProfile(profile);
      expect(errors.some((e) => e.code === "REQUIRED_NOT_MAPPED")).toBe(true);
    });

    it("validates each mapping entry in profile", () => {
      const profile: AutoFillProfile = {
        id: "profile-with-invalid",
        name: "Invalid",
        description: "",
        targetSystem: "copy_assistant",
        mappings: [makeMapping({ ocrField: "invalidField" as never }), makeMapping({ formField: "" })],
        safetyRules: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        isDefault: false,
      };
      const errors = service.validateProfile(profile);
      expect(errors.some((e) => e.code === "INVALID_OCR_FIELD")).toBe(true);
      expect(errors.some((e) => e.code === "EMPTY_FORM_FIELD")).toBe(true);
    });
  });
});

describe("AutoFillMappingService - Misc", () => {
  let service: AutoFillMappingService;

  beforeEach(() => {
    service = createAutoFillMappingService(createInMemoryProfileStore());
  });

  it("getSupportedOcrFields returns all OCR_FIELD_KEYS", () => {
    expect(service.getSupportedOcrFields()).toEqual(OCR_FIELD_KEYS);
    expect(service.getSupportedOcrFields()).toContain("fullName");
    expect(service.getSupportedOcrFields()).toContain("passportNumber");
    expect(service.getSupportedOcrFields()).toContain("dateOfBirth");
    expect(service.getSupportedOcrFields()).toContain("gender");
  });

  it("getSupportedFormFields returns all form field keys", () => {
    const keys = service.getSupportedFormFields();
    expect(keys).toEqual(FORM_FIELD_KEYS);
    expect(keys).toContain("fullName");
    expect(keys).toContain("passportNumber");
    expect(keys).toContain("roomNumber");
    expect(keys).toContain("arrivalDate");
    expect(keys).toContain("departureDate");
  });

  it("OCR_FIELD_LABELS has a label for every OCR field key", () => {
    for (const key of OCR_FIELD_KEYS) {
      expect(OCR_FIELD_LABELS[key]).toBeTruthy();
      expect(typeof OCR_FIELD_LABELS[key]).toBe("string");
    }
  });

  it("FORM_FIELD_LABELS has a label for every form field key", () => {
    for (const key of FORM_FIELD_KEYS) {
      expect(FORM_FIELD_LABELS[key]).toBeTruthy();
      expect(typeof FORM_FIELD_LABELS[key]).toBe("string");
    }
  });

  it("OCR_FIELD_KEYS has no duplicates", () => {
    const unique = new Set(OCR_FIELD_KEYS);
    expect(unique.size).toBe(OCR_FIELD_KEYS.length);
  });

  it("FORM_FIELD_KEYS has no duplicates", () => {
    const unique = new Set(FORM_FIELD_KEYS);
    expect(unique.size).toBe(FORM_FIELD_KEYS.length);
  });
});

describe("AutoFillMappingService - ProfileStore abstraction", () => {
  it("createInMemoryProfileStore works correctly", async () => {
    const store = createInMemoryProfileStore();
    expect(await store.getAllProfiles()).toEqual([]);
    const profile: AutoFillProfile = {
      id: "test-1",
      name: "Test",
      description: "",
      targetSystem: "copy_assistant",
      mappings: [],
      safetyRules: [],
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
      isDefault: true,
    };
    await store.saveProfile(profile);
    expect(await store.getAllProfiles()).toHaveLength(1);
    expect((await store.getProfile("test-1"))!.name).toBe("Test");
    await store.deleteProfile("test-1");
    expect(await store.getAllProfiles()).toHaveLength(0);
  });

  it("createIndexedDbProfileStore is defined but needs IndexedDB", () => {
    const store = createIndexedDbProfileStore();
    expect(store).toBeDefined();
    expect(store.getAllProfiles).toBeDefined();
    expect(store.getProfile).toBeDefined();
    expect(store.saveProfile).toBeDefined();
    expect(store.deleteProfile).toBeDefined();
  });

  it("createAutoFillMappingService with no store argument does not throw", () => {
    const svc = createAutoFillMappingService();
    expect(svc).toBeDefined();
  });
});

describe("AutoFillMappingService - applyMappings result structure", () => {
  let service: AutoFillMappingService;

  beforeEach(() => {
    service = createAutoFillMappingService(createInMemoryProfileStore());
  });

  it("returns structured result with all fields", async () => {
    const profile = await service.createProfile("Structure Test");
    const fields = makeFields();
    await service.addMapping(
      profile.id,
      makeMapping({
        ocrField: "fullName",
        formField: "name",
        enabled: true,
      }),
    );
    const result = await service.applyMappings(fields, profile.id);
    expect(result).toHaveProperty("fieldValues");
    expect(result).toHaveProperty("unmappedOcrFields");
    expect(result).toHaveProperty("unmappedRequiredFields");
    expect(result).toHaveProperty("validationErrors");
    expect(result).toHaveProperty("mappedCount");
    expect(typeof result.mappedCount).toBe("number");
    expect(Array.isArray(result.unmappedOcrFields)).toBe(true);
  });
});
