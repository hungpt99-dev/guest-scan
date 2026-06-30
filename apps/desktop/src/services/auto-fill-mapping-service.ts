import type { NormalizedFields } from "./field_normalization_service";
import type { TargetSystemType, TransformRule, SafetyRule } from "@guestfill/shared";
import { applyTransforms as applyTransformsFn } from "../features/fill/transformEngine";
import { logger } from "../lib/logger";
import { getAll, getById, put, remove } from "../lib/db";

export type OcrFieldKey =
  | "fullName"
  | "firstName"
  | "lastName"
  | "gender"
  | "dateOfBirth"
  | "nationality"
  | "countryCode"
  | "documentType"
  | "documentNumber"
  | "passportNumber"
  | "idNumber"
  | "issueDate"
  | "expiryDate"
  | "issuingCountry";

export const OCR_FIELD_KEYS: OcrFieldKey[] = [
  "fullName",
  "firstName",
  "lastName",
  "gender",
  "dateOfBirth",
  "nationality",
  "countryCode",
  "documentType",
  "documentNumber",
  "passportNumber",
  "idNumber",
  "issueDate",
  "expiryDate",
  "issuingCountry",
];

export const OCR_FIELD_LABELS: Record<OcrFieldKey, string> = {
  fullName: "Full Name",
  firstName: "First Name",
  lastName: "Last Name",
  gender: "Gender",
  dateOfBirth: "Date of Birth",
  nationality: "Nationality",
  countryCode: "Country Code",
  documentType: "Document Type",
  documentNumber: "Document Number",
  passportNumber: "Passport Number",
  idNumber: "ID Number",
  issueDate: "Issue Date",
  expiryDate: "Expiry Date",
  issuingCountry: "Issuing Country",
};

export const FORM_FIELD_LABELS: Record<string, string> = {
  fullName: "Full Name",
  passportNumber: "Passport Number",
  idNumber: "ID Number",
  nationality: "Nationality",
  dateOfBirth: "Date of Birth",
  gender: "Gender",
  passportExpiryDate: "Passport Expiry Date",
  idExpiryDate: "ID Expiry Date",
  roomNumber: "Room Number",
  arrivalDate: "Arrival Date",
  departureDate: "Departure Date",
  reservationCode: "Reservation Code",
  firstName: "First Name",
  lastName: "Last Name",
  countryCode: "Country Code",
  documentType: "Document Type",
  issueDate: "Issue Date",
  issuingCountry: "Issuing Country",
  note: "Note",
  email: "Email",
  phone: "Phone",
  address: "Address",
  company: "Company",
  vehiclePlate: "Vehicle Plate",
  purposeOfVisit: "Purpose of Visit",
};

export const FORM_FIELD_KEYS = Object.keys(FORM_FIELD_LABELS);

export type FieldMappingEntry = {
  id: string;
  ocrField: OcrFieldKey;
  formField: string;
  transform?: TransformRule[];
  required: boolean;
  enabled: boolean;
};

export type AutoFillProfile = {
  id: string;
  name: string;
  description: string;
  targetSystem: TargetSystemType;
  mappings: FieldMappingEntry[];
  safetyRules: SafetyRule[];
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
};

export type MappingValidationError = {
  mappingId: string;
  field: string;
  code: "MISSING_OCR_FIELD" | "EMPTY_FORM_FIELD" | "DUPLICATE_MAPPING" | "REQUIRED_NOT_MAPPED" | "INVALID_OCR_FIELD";
  message: string;
};

export type ApplyMappingResult = {
  fieldValues: Record<string, string>;
  unmappedOcrFields: OcrFieldKey[];
  unmappedRequiredFields: string[];
  validationErrors: MappingValidationError[];
  mappedCount: number;
};

export type TestMappingResult = ApplyMappingResult & {
  testMode: true;
  preview: Array<{ formField: string; ocrField: string; originalValue: string; transformedValue: string }>;
};

export interface ProfileStore {
  getAllProfiles(): Promise<AutoFillProfile[]>;
  getProfile(id: string): Promise<AutoFillProfile | undefined>;
  saveProfile(profile: AutoFillProfile): Promise<void>;
  deleteProfile(id: string): Promise<void>;
}

const STORE_NAME = "auto_fill_profiles";

export function createIndexedDbProfileStore(): ProfileStore {
  return {
    async getAllProfiles(): Promise<AutoFillProfile[]> {
      return getAll<AutoFillProfile>(STORE_NAME);
    },
    async getProfile(id: string): Promise<AutoFillProfile | undefined> {
      return getById<AutoFillProfile>(STORE_NAME, id);
    },
    async saveProfile(profile: AutoFillProfile): Promise<void> {
      await put(STORE_NAME, profile);
    },
    async deleteProfile(id: string): Promise<void> {
      await remove(STORE_NAME, id);
    },
  };
}

export function createInMemoryProfileStore(): ProfileStore {
  const profiles = new Map<string, AutoFillProfile>();
  return {
    async getAllProfiles(): Promise<AutoFillProfile[]> {
      return Array.from(profiles.values());
    },
    async getProfile(id: string): Promise<AutoFillProfile | undefined> {
      return profiles.get(id);
    },
    async saveProfile(profile: AutoFillProfile): Promise<void> {
      profiles.set(profile.id, profile);
    },
    async deleteProfile(id: string): Promise<void> {
      profiles.delete(id);
    },
  };
}

export interface AutoFillMappingService {
  createProfile(name: string, targetSystem?: TargetSystemType): Promise<AutoFillProfile>;
  getProfile(id: string): Promise<AutoFillProfile | undefined>;
  getAllProfiles(): Promise<AutoFillProfile[]>;
  saveProfile(profile: AutoFillProfile): Promise<void>;
  deleteProfile(id: string): Promise<void>;
  setDefaultProfile(id: string): Promise<void>;
  getDefaultProfile(): Promise<AutoFillProfile | undefined>;

  addMapping(profileId: string, entry: FieldMappingEntry): Promise<AutoFillProfile>;
  removeMapping(profileId: string, mappingId: string): Promise<AutoFillProfile>;
  updateMapping(profileId: string, entry: FieldMappingEntry): Promise<AutoFillProfile>;
  setMappings(profileId: string, entries: FieldMappingEntry[]): Promise<AutoFillProfile>;

  applyMappings(fields: NormalizedFields, profileId: string): Promise<ApplyMappingResult>;
  applyMappingsWithProfile(fields: NormalizedFields, profile: AutoFillProfile): ApplyMappingResult;

  testMappings(fields: NormalizedFields, profileId: string): Promise<TestMappingResult>;
  testMappingsWithProfile(fields: NormalizedFields, profile: AutoFillProfile): TestMappingResult;

  validateMappingEntry(entry: FieldMappingEntry, existingMappings?: FieldMappingEntry[]): MappingValidationError[];
  validateProfile(profile: AutoFillProfile): MappingValidationError[];

  getSupportedOcrFields(): OcrFieldKey[];
  getSupportedFormFields(): string[];
}

export function createAutoFillMappingService(store?: ProfileStore): AutoFillMappingService {
  return new DefaultAutoFillMappingService(store ?? createIndexedDbProfileStore());
}

class DefaultAutoFillMappingService implements AutoFillMappingService {
  constructor(private readonly store: ProfileStore) {}

  getSupportedOcrFields(): OcrFieldKey[] {
    return [...OCR_FIELD_KEYS];
  }

  getSupportedFormFields(): string[] {
    return [...FORM_FIELD_KEYS];
  }

  async createProfile(name: string, targetSystem: TargetSystemType = "copy_assistant"): Promise<AutoFillProfile> {
    const now = new Date().toISOString();
    const profile: AutoFillProfile = {
      id: crypto.randomUUID(),
      name,
      description: "",
      targetSystem,
      mappings: [],
      safetyRules: [],
      createdAt: now,
      updatedAt: now,
      isDefault: false,
    };

    const existing = await this.store.getAllProfiles();
    if (existing.length === 0) {
      profile.isDefault = true;
    }

    await this.store.saveProfile(profile);
    logger.info("AutoFillMappingService: created profile", { profileId: profile.id, name });
    return profile;
  }

  async getProfile(id: string): Promise<AutoFillProfile | undefined> {
    return this.store.getProfile(id);
  }

  async getAllProfiles(): Promise<AutoFillProfile[]> {
    return this.store.getAllProfiles();
  }

  async saveProfile(profile: AutoFillProfile): Promise<void> {
    profile.updatedAt = new Date().toISOString();
    await this.store.saveProfile(profile);
    logger.info("AutoFillMappingService: saved profile", { profileId: profile.id });
  }

  async deleteProfile(id: string): Promise<void> {
    const profile = await this.store.getProfile(id);
    if (!profile) return;
    await this.store.deleteProfile(id);
    logger.info("AutoFillMappingService: deleted profile", { profileId: id });
  }

  async setDefaultProfile(id: string): Promise<void> {
    const profiles = await this.store.getAllProfiles();
    for (const p of profiles) {
      const updated = { ...p, isDefault: p.id === id, updatedAt: new Date().toISOString() };
      await this.store.saveProfile(updated);
    }
    logger.info("AutoFillMappingService: set default profile", { profileId: id });
  }

  async getDefaultProfile(): Promise<AutoFillProfile | undefined> {
    const profiles = await this.store.getAllProfiles();
    return profiles.find((p) => p.isDefault);
  }

  async addMapping(profileId: string, entry: FieldMappingEntry): Promise<AutoFillProfile> {
    const profile = await this.store.getProfile(profileId);
    if (!profile) {
      throw new Error(`AutoFillMappingService: profile not found: ${profileId}`);
    }
    profile.mappings.push(entry);
    await this.saveProfile(profile);
    logger.info("AutoFillMappingService: added mapping", {
      profileId,
      mappingId: entry.id,
      ocrField: entry.ocrField,
      formField: entry.formField,
    });
    return profile;
  }

  async removeMapping(profileId: string, mappingId: string): Promise<AutoFillProfile> {
    const profile = await this.store.getProfile(profileId);
    if (!profile) {
      throw new Error(`AutoFillMappingService: profile not found: ${profileId}`);
    }
    profile.mappings = profile.mappings.filter((m) => m.id !== mappingId);
    await this.saveProfile(profile);
    logger.info("AutoFillMappingService: removed mapping", { profileId, mappingId });
    return profile;
  }

  async updateMapping(profileId: string, entry: FieldMappingEntry): Promise<AutoFillProfile> {
    const profile = await this.store.getProfile(profileId);
    if (!profile) {
      throw new Error(`AutoFillMappingService: profile not found: ${profileId}`);
    }
    const idx = profile.mappings.findIndex((m) => m.id === entry.id);
    if (idx === -1) {
      throw new Error(`AutoFillMappingService: mapping not found: ${entry.id}`);
    }
    profile.mappings[idx] = entry;
    await this.saveProfile(profile);
    logger.info("AutoFillMappingService: updated mapping", {
      profileId,
      mappingId: entry.id,
    });
    return profile;
  }

  async setMappings(profileId: string, entries: FieldMappingEntry[]): Promise<AutoFillProfile> {
    const profile = await this.store.getProfile(profileId);
    if (!profile) {
      throw new Error(`AutoFillMappingService: profile not found: ${profileId}`);
    }
    profile.mappings = entries;
    await this.saveProfile(profile);
    logger.info("AutoFillMappingService: set mappings", {
      profileId,
      count: entries.length,
    });
    return profile;
  }

  async applyMappings(fields: NormalizedFields, profileId: string): Promise<ApplyMappingResult> {
    const profile = await this.store.getProfile(profileId);
    if (!profile) {
      throw new Error(`AutoFillMappingService: profile not found: ${profileId}`);
    }
    return this.applyMappingsWithProfile(fields, profile);
  }

  applyMappingsWithProfile(fields: NormalizedFields, profile: AutoFillProfile): ApplyMappingResult {
    const errors = this.validateProfile(profile);
    const enabledMappings = profile.mappings.filter((m) => m.enabled);
    const fieldValues: Record<string, string> = {};
    const mappedOcrFields = new Set<OcrFieldKey>();

    for (const mapping of enabledMappings) {
      const value = this.extractFieldValue(fields, mapping.ocrField);
      const transformed = this.applyTransforms(value, mapping.transform);
      fieldValues[mapping.formField] = transformed;
      mappedOcrFields.add(mapping.ocrField);
    }

    const unmappedOcrFields = OCR_FIELD_KEYS.filter((k) => {
      if (!fields[k as keyof NormalizedFields]) return false;
      return !mappedOcrFields.has(k);
    });

    const unmappedRequiredFields = profile.mappings
      .filter((m) => m.required && !enabledMappings.find((em) => em.id === m.id))
      .map((m) => m.formField);

    return {
      fieldValues,
      unmappedOcrFields,
      unmappedRequiredFields,
      validationErrors: errors,
      mappedCount: enabledMappings.length,
    };
  }

  async testMappings(fields: NormalizedFields, profileId: string): Promise<TestMappingResult> {
    const profile = await this.store.getProfile(profileId);
    if (!profile) {
      throw new Error(`AutoFillMappingService: profile not found: ${profileId}`);
    }
    return this.testMappingsWithProfile(fields, profile);
  }

  testMappingsWithProfile(fields: NormalizedFields, profile: AutoFillProfile): TestMappingResult {
    const base = this.applyMappingsWithProfile(fields, profile);
    const preview = profile.mappings
      .filter((m) => m.enabled)
      .map((m) => ({
        formField: m.formField,
        ocrField: m.ocrField,
        originalValue: this.extractFieldValue(fields, m.ocrField),
        transformedValue: base.fieldValues[m.formField] ?? "",
      }));

    return { ...base, testMode: true as const, preview };
  }

  validateMappingEntry(entry: FieldMappingEntry, existingMappings?: FieldMappingEntry[]): MappingValidationError[] {
    const errors: MappingValidationError[] = [];

    if (!OCR_FIELD_KEYS.includes(entry.ocrField)) {
      errors.push({
        mappingId: entry.id,
        field: "ocrField",
        code: "INVALID_OCR_FIELD",
        message: `Invalid OCR field: ${entry.ocrField}`,
      });
    }

    if (!entry.formField || entry.formField.trim().length === 0) {
      errors.push({
        mappingId: entry.id,
        field: "formField",
        code: "EMPTY_FORM_FIELD",
        message: "Form field name cannot be empty",
      });
    }

    if (existingMappings) {
      const duplicate = existingMappings.find(
        (m) => m.id !== entry.id && m.ocrField === entry.ocrField && m.formField === entry.formField,
      );
      if (duplicate) {
        errors.push({
          mappingId: entry.id,
          field: "formField",
          code: "DUPLICATE_MAPPING",
          message: `Mapping already exists for ${entry.ocrField} → ${entry.formField}`,
        });
      }
    }

    return errors;
  }

  validateProfile(profile: AutoFillProfile): MappingValidationError[] {
    const errors: MappingValidationError[] = [];

    for (const mapping of profile.mappings) {
      const entryErrors = this.validateMappingEntry(mapping, profile.mappings);
      errors.push(...entryErrors);
    }

    const requiredIds = profile.mappings.filter((m) => m.required).map((m) => m.id);
    const enabledIds = new Set(profile.mappings.filter((m) => m.enabled).map((m) => m.id));
    for (const id of requiredIds) {
      if (!enabledIds.has(id)) {
        const mapping = profile.mappings.find((m) => m.id === id);
        if (mapping) {
          errors.push({
            mappingId: id,
            field: "enabled",
            code: "REQUIRED_NOT_MAPPED",
            message: `Required mapping for "${mapping.formField}" is disabled`,
          });
        }
      }
    }

    return errors;
  }

  private extractFieldValue(fields: NormalizedFields, ocrField: OcrFieldKey): string {
    const value = fields[ocrField as keyof NormalizedFields];
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.join("\n");
    return String(value ?? "");
  }

  private applyTransforms(value: string, transforms?: TransformRule[]): string {
    if (!transforms || transforms.length === 0) return value;
    return applyTransformsFn(value, transforms);
  }
}
