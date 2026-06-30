import { describe, it, expect, beforeEach } from "vitest";
import {
  createAutoFillMappingService,
  createInMemoryProfileStore,
  type AutoFillMappingService,
  type FieldMappingEntry,
  type AutoFillProfile,
  OCR_FIELD_KEYS,
  OCR_FIELD_LABELS,
  FORM_FIELD_LABELS,
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

describe("AutoFillMappingService", () => {
  let service: AutoFillMappingService;

  beforeEach(() => {
    const store = createInMemoryProfileStore();
    service = createAutoFillMappingService(store);
  });

  describe("createProfile", () => {
    it("creates a profile with given name", async () => {
      const profile = await service.createProfile("Hotel Front Desk");
      expect(profile.name).toBe("Hotel Front Desk");
      expect(profile.id).toBeTruthy();
      expect(profile.mappings).toEqual([]);
      expect(profile.safetyRules).toEqual([]);
      expect(profile.targetSystem).toBe("copy_assistant");
      expect(profile.createdAt).toBeTruthy();
      expect(profile.updatedAt).toBeTruthy();
    });

    it("sets first profile as default", async () => {
      const profile = await service.createProfile("Default PMS");
      expect(profile.isDefault).toBe(true);
    });

    it("accepts custom target system", async () => {
      const profile = await service.createProfile("Web PMS", "web");
      expect(profile.targetSystem).toBe("web");
    });
  });

  describe("getProfile / getAllProfiles", () => {
    it("returns undefined for non-existent profile", async () => {
      const result = await service.getProfile("non-existent");
      expect(result).toBeUndefined();
    });

    it("returns created profile by id", async () => {
      const created = await service.createProfile("Test Profile");
      const fetched = await service.getProfile(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.name).toBe("Test Profile");
    });

    it("returns all profiles", async () => {
      await service.createProfile("Profile 1");
      await service.createProfile("Profile 2");
      const all = await service.getAllProfiles();
      expect(all.length).toBe(2);
    });

    it("returns empty array when no profiles exist", async () => {
      const all = await service.getAllProfiles();
      expect(all).toEqual([]);
    });
  });

  describe("saveProfile / deleteProfile", () => {
    it("saves profile updates", async () => {
      const profile = await service.createProfile("Original");
      profile.name = "Updated";
      await service.saveProfile(profile);
      const fetched = await service.getProfile(profile.id);
      expect(fetched!.name).toBe("Updated");
    });

    it("deletes a profile", async () => {
      const profile = await service.createProfile("To Delete");
      await service.deleteProfile(profile.id);
      const fetched = await service.getProfile(profile.id);
      expect(fetched).toBeUndefined();
    });

    it("does not throw when deleting non-existent profile", async () => {
      await expect(service.deleteProfile("non-existent")).resolves.not.toThrow();
    });
  });

  describe("setDefaultProfile / getDefaultProfile", () => {
    it("sets and gets default profile", async () => {
      const _p1 = await service.createProfile("Profile 1");
      void _p1;
      const p2 = await service.createProfile("Profile 2");
      await service.setDefaultProfile(p2.id);
      const defaultProfile = await service.getDefaultProfile();
      expect(defaultProfile!.id).toBe(p2.id);
    });
  });

  describe("addMapping / removeMapping / updateMapping", () => {
    it("adds a mapping to a profile", async () => {
      const profile = await service.createProfile("Mapped");
      const mapping = makeMapping({ ocrField: "fullName", formField: "guestName" });
      const updated = await service.addMapping(profile.id, mapping);
      expect(updated.mappings).toHaveLength(1);
      expect(updated.mappings[0]!.ocrField).toBe("fullName");
      expect(updated.mappings[0]!.formField).toBe("guestName");
    });

    it("throws when adding mapping to non-existent profile", async () => {
      const mapping = makeMapping();
      await expect(service.addMapping("non-existent", mapping)).rejects.toThrow();
    });

    it("removes a mapping from a profile", async () => {
      const profile = await service.createProfile("With Mapping");
      const mapping = makeMapping();
      await service.addMapping(profile.id, mapping);
      const updated = await service.removeMapping(profile.id, mapping.id);
      expect(updated.mappings).toHaveLength(0);
    });

    it("updates an existing mapping", async () => {
      const profile = await service.createProfile("Updatable");
      const mapping = makeMapping({ ocrField: "fullName", formField: "oldField" });
      await service.addMapping(profile.id, mapping);
      const updatedEntry = { ...mapping, formField: "newField" };
      const profileAfter = await service.updateMapping(profile.id, updatedEntry);
      expect(profileAfter.mappings[0]!.formField).toBe("newField");
    });

    it("throws when updating non-existent mapping", async () => {
      const profile = await service.createProfile("No Mappings");
      const mapping = makeMapping();
      await expect(service.updateMapping(profile.id, mapping)).rejects.toThrow();
    });

    it("replaces all mappings via setMappings", async () => {
      const profile = await service.createProfile("Batch");
      const m1 = makeMapping({ ocrField: "fullName", formField: "name" });
      const m2 = makeMapping({ ocrField: "passportNumber", formField: "passport" });
      await service.addMapping(profile.id, m1);
      const updated = await service.setMappings(profile.id, [m2]);
      expect(updated.mappings).toHaveLength(1);
      expect(updated.mappings[0]!.id).toBe(m2.id);
    });
  });

  describe("applyMappings", () => {
    it("maps OCR fields to form fields using enabled mappings", async () => {
      const profile = await service.createProfile("Hotel PMS");
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

      const result = await service.applyMappings(fields, profile.id);
      expect(result.fieldValues.guestName).toBe("JOHN DOE");
      expect(result.fieldValues.passportNo).toBe("AB1234567");
      expect(result.fieldValues.country).toBe("USA");
      expect(result.mappedCount).toBe(3);
    });

    it("skips disabled mappings", async () => {
      const profile = await service.createProfile("With Disabled");
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
      const profile = await service.createProfile("Partial");
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

    it("throws for non-existent profile", async () => {
      const fields = makeFields();
      await expect(service.applyMappings(fields, "bad-id")).rejects.toThrow();
    });

    it("handles empty mappings gracefully", async () => {
      const profile = await service.createProfile("Empty");
      const fields = makeFields();
      const result = await service.applyMappings(fields, profile.id);
      expect(result.mappedCount).toBe(0);
      expect(Object.keys(result.fieldValues)).toHaveLength(0);
    });

    it("reports required but disabled mappings", async () => {
      const profile = await service.createProfile("Required Check");
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
  });

  describe("applyMappingsWithProfile", () => {
    it("applies mappings from a profile object directly", () => {
      const fields = makeFields();
      const profile: AutoFillProfile = {
        id: "inline-profile",
        name: "Inline",
        description: "",
        targetSystem: "desktop",
        mappings: [
          makeMapping({ ocrField: "fullName", formField: "full_name", enabled: true }),
          makeMapping({ ocrField: "dateOfBirth", formField: "dob", enabled: true }),
        ],
        safetyRules: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        isDefault: false,
      };

      const result = service.applyMappingsWithProfile(fields, profile);
      expect(result.fieldValues.full_name).toBe("JOHN DOE");
      expect(result.fieldValues.dob).toBe("1990-01-15");
      expect(result.mappedCount).toBe(2);
    });
  });

  describe("testMappings", () => {
    it("returns preview of all enabled mappings", async () => {
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
          ocrField: "dateOfBirth",
          formField: "birthDate",
          enabled: true,
        }),
      );

      const result = await service.testMappings(fields, profile.id);
      expect(result.testMode).toBe(true);
      expect(result.preview).toHaveLength(2);
      expect(result.preview[0]!.originalValue).toBe("JOHN DOE");
      expect(result.preview[0]!.transformedValue).toBe("JOHN DOE");
      expect(result.mappedCount).toBe(2);
    });
  });

  describe("validateMappingEntry", () => {
    it("returns no errors for valid entry", () => {
      const entry = makeMapping();
      const errors = service.validateMappingEntry(entry);
      expect(errors).toHaveLength(0);
    });

    it("rejects empty form field", () => {
      const entry = makeMapping({ formField: "" });
      const errors = service.validateMappingEntry(entry);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]!.code).toBe("EMPTY_FORM_FIELD");
    });

    it("rejects duplicate mappings", () => {
      const entry = makeMapping({ ocrField: "fullName", formField: "name" });
      const existing = [makeMapping({ ocrField: "fullName", formField: "name" })];
      const errors = service.validateMappingEntry(entry, existing);
      const hasDuplicate = errors.some((e) => e.code === "DUPLICATE_MAPPING");
      expect(hasDuplicate).toBe(true);
    });

    it("allows same ocrField mapping to different formField", () => {
      const entry = makeMapping({ ocrField: "fullName", formField: "guest_name" });
      const existing = [makeMapping({ ocrField: "fullName", formField: "full_name" })];
      const errors = service.validateMappingEntry(entry, existing);
      const hasDuplicate = errors.some((e) => e.code === "DUPLICATE_MAPPING");
      expect(hasDuplicate).toBe(false);
    });
  });

  describe("validateProfile", () => {
    it("returns no errors for valid profile", () => {
      const profile: AutoFillProfile = {
        id: "valid",
        name: "Valid",
        description: "",
        targetSystem: "copy_assistant",
        mappings: [makeMapping()],
        safetyRules: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        isDefault: false,
      };
      const errors = service.validateProfile(profile);
      expect(errors).toHaveLength(0);
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
      const hasRequiredError = errors.some((e) => e.code === "REQUIRED_NOT_MAPPED");
      expect(hasRequiredError).toBe(true);
    });
  });

  describe("getSupportedOcrFields / getSupportedFormFields", () => {
    it("returns all OCR field keys", () => {
      const keys = service.getSupportedOcrFields();
      expect(keys).toEqual(OCR_FIELD_KEYS);
    });

    it("contains fullName and passportNumber", () => {
      const keys = service.getSupportedOcrFields();
      expect(keys).toContain("fullName");
      expect(keys).toContain("passportNumber");
      expect(keys).toContain("dateOfBirth");
    });

    it("returns form field labels for all form fields", () => {
      const keys = service.getSupportedFormFields();
      expect(keys.length).toBeGreaterThan(0);
      for (const key of keys) {
        expect(FORM_FIELD_LABELS[key]).toBeDefined();
      }
    });
  });

  describe("OCR_FIELD_LABELS", () => {
    it("provides a label for every OCR field key", () => {
      for (const key of OCR_FIELD_KEYS) {
        expect(OCR_FIELD_LABELS[key]).toBeTruthy();
      }
    });
  });
});
