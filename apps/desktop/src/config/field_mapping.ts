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

export type FieldMappingEntry = {
  ocrField: OcrFieldKey;
  formField: string;
  label: string;
  required: boolean;
  enabled: boolean;
};

export type FieldMappingConfig = {
  mappings: FieldMappingEntry[];
  updatedAt: string;
};

export type FieldMappingValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export const DEFAULT_MAPPINGS: FieldMappingEntry[] = [
  { ocrField: "fullName", formField: "fullName", label: "Full Name", required: true, enabled: true },
  { ocrField: "firstName", formField: "firstName", label: "First Name", required: true, enabled: true },
  { ocrField: "lastName", formField: "lastName", label: "Last Name", required: true, enabled: true },
  { ocrField: "passportNumber", formField: "passportNumber", label: "Passport Number", required: true, enabled: true },
  { ocrField: "idNumber", formField: "idNumber", label: "ID Number", required: false, enabled: true },
  { ocrField: "nationality", formField: "nationality", label: "Nationality", required: true, enabled: true },
  { ocrField: "countryCode", formField: "countryCode", label: "Country Code", required: false, enabled: true },
  { ocrField: "dateOfBirth", formField: "dateOfBirth", label: "Date of Birth", required: true, enabled: true },
  { ocrField: "gender", formField: "gender", label: "Gender", required: true, enabled: true },
  {
    ocrField: "expiryDate",
    formField: "passportExpiryDate",
    label: "Passport Expiry Date",
    required: true,
    enabled: true,
  },
  { ocrField: "issueDate", formField: "issueDate", label: "Issue Date", required: false, enabled: true },
  { ocrField: "issuingCountry", formField: "issuingCountry", label: "Issuing Country", required: false, enabled: true },
  { ocrField: "documentType", formField: "documentType", label: "Document Type", required: false, enabled: true },
  { ocrField: "documentNumber", formField: "documentNumber", label: "Document Number", required: false, enabled: true },
];

export function loadFieldMapping(): FieldMappingConfig {
  const stored = localStorage.getItem("fieldMapping");
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as FieldMappingConfig;
      const errors = validateFieldMapping(parsed);
      if (errors.valid) {
        return parsed;
      }
    } catch {
      // Invalid JSON stored
    }
  }
  return createDefaultConfig();
}

export function saveFieldMapping(config: FieldMappingConfig): void {
  config.updatedAt = new Date().toISOString();
  localStorage.setItem("fieldMapping", JSON.stringify(config));
}

export function updateFieldMapping(
  config: FieldMappingConfig,
  ocrField: OcrFieldKey,
  updates: Partial<Omit<FieldMappingEntry, "ocrField">>,
): FieldMappingConfig {
  const index = config.mappings.findIndex((m) => m.ocrField === ocrField);
  if (index === -1) {
    throw new Error(`No mapping found for OCR field "${ocrField}"`);
  }
  const existing = config.mappings[index] as FieldMappingEntry;
  const updated = [...config.mappings];
  updated[index] = { ...existing, ...updates };
  return { ...config, mappings: updated, updatedAt: new Date().toISOString() };
}

export function setMappings(config: FieldMappingConfig, mappings: FieldMappingEntry[]): FieldMappingConfig {
  return { ...config, mappings: mappings.map((m) => ({ ...m })), updatedAt: new Date().toISOString() };
}

export function createDefaultConfig(): FieldMappingConfig {
  return {
    mappings: DEFAULT_MAPPINGS.map((m) => ({ ...m })),
    updatedAt: new Date().toISOString(),
  };
}

export function validateFieldMapping(config: FieldMappingConfig): FieldMappingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.mappings || config.mappings.length === 0) {
    errors.push("Mapping configuration contains no entries");
    return { valid: false, errors, warnings };
  }

  const seenFormFields = new Set<string>();
  const seenOcrFields = new Set<OcrFieldKey>();
  const ocrFieldSet = new Set<OcrFieldKey>(OCR_FIELD_KEYS);

  for (const entry of config.mappings) {
    if (!entry.formField || entry.formField.trim().length === 0) {
      errors.push(`Mapping for "${entry.ocrField}" has an empty form field identifier`);
    }

    if (!ocrFieldSet.has(entry.ocrField)) {
      errors.push(`"${entry.ocrField}" is not a valid OCR field key`);
    }

    const formKey = entry.formField.trim().toLowerCase();
    if (seenFormFields.has(formKey)) {
      warnings.push(`Form field "${entry.formField}" is mapped by multiple OCR entries`);
    }
    seenFormFields.add(formKey);

    if (seenOcrFields.has(entry.ocrField)) {
      errors.push(`OCR field "${entry.ocrField}" appears in multiple mappings`);
    }
    seenOcrFields.add(entry.ocrField);
  }

  const requiredMapped = config.mappings.filter((m) => m.required).map((m) => m.ocrField);

  const allRequired = DEFAULT_MAPPINGS.filter((m) => m.required).map((m) => m.ocrField);
  for (const req of allRequired) {
    if (!requiredMapped.includes(req)) {
      errors.push(`Required field "${req}" is not mapped`);
    }
  }

  for (const entry of config.mappings) {
    if (entry.required && !entry.enabled) {
      warnings.push(`Required field "${entry.ocrField}" is mapped but disabled`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
