export type FieldValidationRule = {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  patternMessage?: string;
  validate?: (value: string, allValues?: Record<string, string>) => string | undefined;
};

export type FieldValidationSchema = Record<string, FieldValidationRule>;

export type FieldValidationResult = {
  valid: boolean;
  errors: Record<string, string[]>;
};

export type ValidationIssue = {
  field: string;
  message: string;
  severity: "error" | "warning";
};

export type FileValidationRule = {
  allowedExtensions?: readonly string[];
  maxSizeBytes?: number;
  minSizeBytes?: number;
  allowedMimeTypes?: readonly string[];
};

export type FileValidationResult = {
  valid: boolean;
  errors: string[];
};

export type DateValidationRule = {
  allowPast?: boolean;
  allowFuture?: boolean;
  minDate?: string;
  maxDate?: string;
  required?: boolean;
};

export const GUEST_FIELD_RULES: FieldValidationSchema = {
  fullName: {
    required: true,
    minLength: 2,
    maxLength: 200,
    pattern: /^[A-Za-zÀ-Ỹà-ỹ\s\-'.]+$/,
    patternMessage: "Name contains invalid characters",
    validate: (value) => {
      if (value.length > 0 && !value.includes(" ") && value.length < 5) {
        return "Name may be missing a given name";
      }
      const digitRatio = (value.match(/\d/g) ?? []).length / value.length;
      if (digitRatio > 0.5) {
        return "Name contains mostly digits — likely an OCR error";
      }
    },
  },
  firstName: {
    required: false,
    minLength: 1,
    maxLength: 100,
    pattern: /^[A-Za-zÀ-Ỹà-ỹ\s\-'.]*$/,
    patternMessage: "Name contains invalid characters",
  },
  lastName: {
    required: false,
    minLength: 1,
    maxLength: 100,
    pattern: /^[A-Za-zÀ-Ỹà-ỹ\s\-'.]*$/,
    patternMessage: "Name contains invalid characters",
  },
  passportNumber: {
    required: false,
    minLength: 5,
    maxLength: 20,
    pattern: /^[A-Za-z0-9]{5,20}$/,
    patternMessage: "Passport number must be 5-20 alphanumeric characters",
    validate: (value) => {
      if (/^0+$/.test(value)) {
        return "Passport number appears to be a placeholder (all zeros)";
      }
    },
  },
  idNumber: {
    required: false,
    minLength: 5,
    maxLength: 30,
    pattern: /^[A-Za-z0-9]{5,30}$/,
    patternMessage: "ID number must be 5-30 alphanumeric characters",
  },
  nationality: {
    required: false,
    minLength: 2,
    maxLength: 3,
    pattern: /^[A-Za-z]{2,3}$/,
    patternMessage: "Nationality should be a 2 or 3 letter code (e.g. VNM, US)",
  },
  dateOfBirth: {
    required: false,
    validate: (value) => {
      if (!value) return;
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
          return "Date format appears to be DD/MM/YYYY — use YYYY-MM-DD";
        }
        return "Invalid date format — use YYYY-MM-DD";
      }
      const now = new Date();
      const age = now.getFullYear() - parsed.getFullYear();
      if (parsed > now) return "Date of birth cannot be in the future";
      if (age < 1) return "Age from date of birth is less than 1 year — verify";
      if (age > 120) return "Age exceeds 120 years — verify date";
    },
  },
  gender: {
    required: false,
    pattern: /^(M|F|X|UNKNOWN)$/,
    patternMessage: "Gender must be M, F, X, or UNKNOWN",
  },
  passportExpiryDate: {
    required: false,
    validate: (value) => {
      if (!value) return;
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
          return "Date format appears to be DD/MM/YYYY — use YYYY-MM-DD";
        }
        return "Invalid date format — use YYYY-MM-DD";
      }
      if (parsed < new Date()) {
        return "Document has expired";
      }
    },
  },
  idExpiryDate: {
    required: false,
    validate: (value) => {
      if (!value) return;
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
          return "Date format appears to be DD/MM/YYYY — use YYYY-MM-DD";
        }
        return "Invalid date format — use YYYY-MM-DD";
      }
      if (parsed < new Date()) {
        return "ID has expired";
      }
    },
  },
  roomNumber: {
    required: false,
    maxLength: 20,
    pattern: /^[A-Za-z0-9\s\-./]*$/,
    patternMessage: "Room number contains invalid characters",
  },
  arrivalDate: {
    required: false,
    validate: (value) => {
      if (!value) return;
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) {
        return "Invalid date format — use YYYY-MM-DD";
      }
    },
  },
  departureDate: {
    required: false,
    validate: (value, allValues) => {
      if (!value) return;
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) {
        return "Invalid date format — use YYYY-MM-DD";
      }
      if (allValues?.arrivalDate) {
        const arrival = new Date(allValues.arrivalDate);
        if (!isNaN(arrival.getTime()) && parsed <= arrival) {
          return "Departure date must be after arrival date";
        }
      }
    },
  },
  reservationCode: {
    required: false,
    maxLength: 50,
  },
  note: {
    required: false,
    maxLength: 500,
  },
};

export const FILE_VALIDATION_RULES: FileValidationRule = {
  allowedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif", ".bmp", ".pdf"],
  maxSizeBytes: 20 * 1024 * 1024,
  minSizeBytes: 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/tiff", "image/bmp", "application/pdf"],
};

export const IMAGE_VALIDATION_RULES: FileValidationRule = {
  allowedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".tiff", ".tif", ".bmp"],
  maxSizeBytes: 10 * 1024 * 1024,
  minSizeBytes: 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/tiff", "image/bmp"],
};

export function validateFile(
  fileName: string,
  fileSize: number,
  rules: FileValidationRule = FILE_VALIDATION_RULES,
): FileValidationResult {
  const errors: string[] = [];
  const ext = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];

  if (rules.allowedExtensions && ext) {
    if (!rules.allowedExtensions.includes(ext)) {
      errors.push(`File type "${ext}" is not supported. Allowed: ${rules.allowedExtensions.join(", ")}`);
    }
  }

  if (rules.maxSizeBytes !== undefined && fileSize > rules.maxSizeBytes) {
    const maxMb = Math.round(rules.maxSizeBytes / (1024 * 1024));
    errors.push(`File size exceeds ${maxMb}MB limit`);
  }

  if (rules.minSizeBytes !== undefined && fileSize < rules.minSizeBytes) {
    errors.push("File is too small or empty");
  }

  return { valid: errors.length === 0, errors };
}

export function validateDate(value: string, rules?: DateValidationRule): string | undefined {
  if (!value) {
    if (rules?.required) return "Date is required";
    return;
  }

  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
      return "Date format appears to be DD/MM/YYYY — use YYYY-MM-DD";
    }
    return "Invalid date format — use YYYY-MM-DD";
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  parsed.setHours(0, 0, 0, 0);

  if (rules?.allowPast === false && parsed < now) {
    return "Date cannot be in the past";
  }
  if (rules?.allowFuture === false && parsed > now) {
    return "Date cannot be in the future";
  }
  if (rules?.minDate) {
    const min = new Date(rules.minDate);
    if (!isNaN(min.getTime()) && parsed < min) {
      return `Date must be on or after ${rules.minDate}`;
    }
  }
  if (rules?.maxDate) {
    const max = new Date(rules.maxDate);
    if (!isNaN(max.getTime()) && parsed > max) {
      return `Date must be on or before ${rules.maxDate}`;
    }
  }

  return;
}

export function validateField(
  field: string,
  value: string,
  rules: FieldValidationSchema,
  allValues?: Record<string, string>,
): string[] {
  const rule = rules[field];
  if (!rule) return [];

  const errors: string[] = [];

  if (rule.required && !value.trim()) {
    errors.push("This field is required");
    return errors;
  }

  if (!value.trim()) return errors;

  if (rule.minLength !== undefined && value.length < rule.minLength) {
    errors.push(`Must be at least ${rule.minLength} characters`);
  }

  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    errors.push(`Must be at most ${rule.maxLength} characters`);
  }

  if (rule.pattern && !rule.pattern.test(value)) {
    errors.push(rule.patternMessage ?? "Invalid format");
  }

  if (rule.validate) {
    const customError = rule.validate(value, allValues);
    if (customError) {
      errors.push(customError);
    }
  }

  return errors;
}

export function validateForm(values: Record<string, string>, rules: FieldValidationSchema): FieldValidationResult {
  const errors: Record<string, string[]> = {};

  for (const field of Object.keys(rules)) {
    const fieldErrors = validateField(field, values[field] ?? "", rules, values);
    if (fieldErrors.length > 0) {
      errors[field] = fieldErrors;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function createFieldSchema(rules: FieldValidationSchema): {
  validate: (field: string, value: string, allValues?: Record<string, string>) => string[];
  validateAll: (values: Record<string, string>) => FieldValidationResult;
  getFieldRule: (field: string) => FieldValidationRule | undefined;
} {
  return {
    validate: (field, value, allValues) => validateField(field, value, rules, allValues),
    validateAll: (values) => validateForm(values, rules),
    getFieldRule: (field) => rules[field],
  };
}

export function combineValidators(
  ...validators: Array<(values: Record<string, string>) => FieldValidationResult>
): (values: Record<string, string>) => FieldValidationResult {
  return (values) => {
    const allErrors: Record<string, string[]> = {};

    for (const validator of validators) {
      const result = validator(values);
      for (const [field, fieldErrors] of Object.entries(result.errors)) {
        const existing = allErrors[field] ?? [];
        allErrors[field] = [...existing, ...fieldErrors];
      }
    }

    return {
      valid: Object.keys(allErrors).length === 0,
      errors: allErrors,
    };
  };
}

export const dateValidator = {
  isValidFormat: (value: string): boolean => {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value).getTime());
  },
  isPast: (value: string): boolean => {
    const date = new Date(value);
    return !isNaN(date.getTime()) && date < new Date();
  },
  isFuture: (value: string): boolean => {
    const date = new Date(value);
    return !isNaN(date.getTime()) && date > new Date();
  },
  isAfter: (a: string, b: string): boolean => {
    const dateA = new Date(a);
    const dateB = new Date(b);
    return !isNaN(dateA.getTime()) && !isNaN(dateB.getTime()) && dateA > dateB;
  },
  daysBetween: (a: string, b: string): number => {
    const dateA = new Date(a);
    const dateB = new Date(b);
    if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) return NaN;
    const diffMs = Math.abs(dateB.getTime() - dateA.getTime());
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  },
  format: (value: string): string => {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toISOString().split("T")[0] ?? value;
  },
};
