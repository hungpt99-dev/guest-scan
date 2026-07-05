import { describe, it, expect } from "vitest";
import {
  validateField,
  validateForm,
  validateFile,
  validateDate,
  combineValidators,
  createFieldSchema,
  dateValidator,
  GUEST_FIELD_RULES,
  IMAGE_VALIDATION_RULES,
} from "../../validation/schemas";

describe("validateField", () => {
  it("returns empty errors for unknown field", () => {
    const errors = validateField("unknownField", "value", GUEST_FIELD_RULES);
    expect(errors).toEqual([]);
  });

  it("returns required error for empty required field", () => {
    const errors = validateField("fullName", "", GUEST_FIELD_RULES);
    expect(errors).toContain("This field is required");
  });

  it("returns empty for non-required empty field", () => {
    const errors = validateField("firstName", "", GUEST_FIELD_RULES);
    expect(errors).toEqual([]);
  });

  it("returns minLength error", () => {
    const errors = validateField("fullName", "A", GUEST_FIELD_RULES);
    expect(errors).toContain("Must be at least 2 characters");
  });

  it("returns maxLength error", () => {
    const errors = validateField("fullName", "A".repeat(201), GUEST_FIELD_RULES);
    expect(errors).toContain("Must be at most 200 characters");
  });

  it("returns pattern error for invalid characters", () => {
    const errors = validateField("fullName", "Muster@@John", GUEST_FIELD_RULES);
    expect(errors).toContain("Name contains invalid characters");
  });

  it("returns digit ratio warning", () => {
    const errors = validateField("fullName", "1234567890", GUEST_FIELD_RULES);
    expect(errors).toContain("Name contains mostly digits — likely an OCR error");
  });

  it("returns missing given name warning for single name under 5 chars", () => {
    const errors = validateField("fullName", "Bob", GUEST_FIELD_RULES);
    expect(errors).toContain("Name may be missing a given name");
  });

  it("does not warn for single name over 5 chars", () => {
    const errors = validateField("fullName", "MUSTER", GUEST_FIELD_RULES);
    expect(errors).not.toContain("Name may be missing a given name");
  });

  it("returns multiple errors for a field", () => {
    const errors = validateField("fullName", "@", GUEST_FIELD_RULES);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it("validates passport number format", () => {
    const errors = validateField("passportNumber", "AB123", GUEST_FIELD_RULES);
    expect(errors).toEqual([]);
  });

  it("rejects passport number shorter than 5 chars", () => {
    const errors = validateField("passportNumber", "AB1", GUEST_FIELD_RULES);
    expect(errors).toContain("Must be at least 5 characters");
  });

  it("rejects passport number with special chars", () => {
    const errors = validateField("passportNumber", "AB12@56", GUEST_FIELD_RULES);
    expect(errors).toContain("Passport number must be 5-20 alphanumeric characters");
  });

  it("detects all-zero passport placeholder", () => {
    const errors = validateField("passportNumber", "0000000000", GUEST_FIELD_RULES);
    expect(errors).toContain("Passport number appears to be a placeholder (all zeros)");
  });

  it("validates nationality code length", () => {
    expect(validateField("nationality", "US", GUEST_FIELD_RULES)).toEqual([]);
    expect(validateField("nationality", "USA", GUEST_FIELD_RULES)).toEqual([]);
    expect(validateField("nationality", "USAA", GUEST_FIELD_RULES)).toContain("Must be at most 3 characters");
  });

  it("validates gender values", () => {
    expect(validateField("gender", "M", GUEST_FIELD_RULES)).toEqual([]);
    expect(validateField("gender", "F", GUEST_FIELD_RULES)).toEqual([]);
    expect(validateField("gender", "X", GUEST_FIELD_RULES)).toEqual([]);
    expect(validateField("gender", "UNKNOWN", GUEST_FIELD_RULES)).toEqual([]);
    expect(validateField("gender", "Male", GUEST_FIELD_RULES)).toContain("Gender must be M, F, X, or UNKNOWN");
  });

  it("validates expiry date format hint", () => {
    const errors = validateField("passportExpiryDate", "32/01/2030", GUEST_FIELD_RULES);
    expect(errors).toContain("Date format appears to be DD/MM/YYYY — use YYYY-MM-DD");
  });

  it("detects expired document", () => {
    const errors = validateField("passportExpiryDate", "2020-01-01", GUEST_FIELD_RULES);
    expect(errors).toContain("Document has expired");
  });

  it("accepts valid future expiry", () => {
    const errors = validateField("passportExpiryDate", "2035-12-31", GUEST_FIELD_RULES);
    expect(errors).toEqual([]);
  });

  it("validates arrival date format", () => {
    expect(validateField("arrivalDate", "2025-06-15", GUEST_FIELD_RULES)).toEqual([]);
    expect(validateField("arrivalDate", "invalid", GUEST_FIELD_RULES)).toContain(
      "Invalid date format — use YYYY-MM-DD",
    );
  });

  it("validates departure after arrival", () => {
    const errors = validateField("departureDate", "2025-06-10", GUEST_FIELD_RULES, {
      arrivalDate: "2025-06-15",
    });
    expect(errors).toContain("Departure date must be after arrival date");
  });

  it("accepts departure after arrival", () => {
    const errors = validateField("departureDate", "2025-06-20", GUEST_FIELD_RULES, {
      arrivalDate: "2025-06-15",
    });
    expect(errors).toEqual([]);
  });

  it("validates room number format", () => {
    expect(validateField("roomNumber", "101A", GUEST_FIELD_RULES)).toEqual([]);
    expect(validateField("roomNumber", "101@!", GUEST_FIELD_RULES)).toContain(
      "Room number contains invalid characters",
    );
  });

  it("enforces note max length", () => {
    const errors = validateField("note", "x".repeat(501), GUEST_FIELD_RULES);
    expect(errors).toContain("Must be at most 500 characters");
  });

  it("validates date of birth future", () => {
    const errors = validateField("dateOfBirth", "2099-01-01", GUEST_FIELD_RULES);
    expect(errors).toContain("Date of birth cannot be in the future");
  });

  it("validates date of birth age", () => {
    const errors = validateField("dateOfBirth", "1800-01-01", GUEST_FIELD_RULES);
    expect(errors).toContain("Age exceeds 120 years — verify date");
  });

  it("validates date of birth age less than 1", () => {
    const errors = validateField("dateOfBirth", new Date().toISOString().slice(0, 10), GUEST_FIELD_RULES);
    expect(errors).toContain("Age from date of birth is less than 1 year — verify");
  });
});

describe("validateForm", () => {
  it("returns valid for all fields", () => {
    const result = validateForm(
      {
        fullName: "MUSTER JOHN MICHAEL",
        firstName: "JOHN MICHAEL",
        lastName: "MUSTER",
        passportNumber: "AB123456",
        nationality: "UTO",
        gender: "M",
        dateOfBirth: "1985-10-10",
        passportExpiryDate: "2030-01-01",
      },
      GUEST_FIELD_RULES,
    );
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it("returns errors for invalid fields", () => {
    const result = validateForm(
      {
        fullName: "",
        firstName: "JOHN",
        passportNumber: "AB",
        gender: "X",
      },
      GUEST_FIELD_RULES,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.fullName).toContain("This field is required");
    expect(result.errors.passportNumber).toContain("Must be at least 5 characters");
  });
});

describe("validateFile", () => {
  it("returns valid for allowed file", () => {
    const result = validateFile("photo.jpg", 500_000);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects disallowed extension", () => {
    const result = validateFile("doc.txt", 500_000);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('File type ".txt" is not supported');
  });

  it("rejects file exceeding max size", () => {
    const result = validateFile("photo.jpg", 100 * 1024 * 1024);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("20MB limit");
  });

  it("rejects file below min size", () => {
    const result = validateFile("photo.jpg", 100);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("too small");
  });

  it("uses custom rules", () => {
    const result = validateFile("data.bin", 500_000, {
      allowedExtensions: [".bin"],
      maxSizeBytes: 1_000_000,
    });
    expect(result.valid).toBe(true);
  });

  it("handles file without extension", () => {
    const result = validateFile("photo", 500_000);
    expect(result.valid).toBe(true);
  });

  it("rejects multiple size violations with image rules", () => {
    const result = validateFile("photo.png", 100, IMAGE_VALIDATION_RULES);
    expect(result.valid).toBe(false);
  });
});

describe("validateDate", () => {
  it("returns undefined for empty non-required date", () => {
    expect(validateDate("")).toBeUndefined();
  });

  it("returns error for empty required date", () => {
    expect(validateDate("", { required: true })).toBe("Date is required");
  });

  it("returns undefined for valid date", () => {
    expect(validateDate("2025-06-15")).toBeUndefined();
  });

  it("returns hint for DD/MM/YYYY format", () => {
    const error = validateDate("15/06/2025");
    expect(error).toContain("DD/MM/YYYY");
  });

  it("returns error for invalid format", () => {
    const error = validateDate("not-a-date");
    expect(error).toContain("Invalid date format");
  });

  it("rejects past dates when allowPast is false", () => {
    const error = validateDate("2020-01-01", { allowPast: false });
    expect(error).toContain("Date cannot be in the past");
  });

  it("rejects future dates when allowFuture is false", () => {
    const error = validateDate("2099-01-01", { allowFuture: false });
    expect(error).toContain("Date cannot be in the future");
  });

  it("accepts past dates when allowPast is true", () => {
    expect(validateDate("2020-01-01", { allowPast: true })).toBeUndefined();
  });

  it("checks minDate", () => {
    const error = validateDate("2023-01-01", { minDate: "2024-01-01" });
    expect(error).toContain("on or after");
  });

  it("checks maxDate", () => {
    const error = validateDate("2025-01-01", { maxDate: "2024-01-01" });
    expect(error).toContain("on or before");
  });
});

describe("createFieldSchema", () => {
  it("returns schema object with validate method", () => {
    const schema = createFieldSchema({ testField: { required: true } });
    expect(typeof schema.validate).toBe("function");
    expect(typeof schema.validateAll).toBe("function");
    expect(typeof schema.getFieldRule).toBe("function");
  });

  it("validates a single field", () => {
    const schema = createFieldSchema({ testField: { required: true } });
    const errors = schema.validate("testField", "");
    expect(errors).toContain("This field is required");
  });

  it("validates all fields", () => {
    const schema = createFieldSchema({ name: { required: true }, email: { required: true } });
    const result = schema.validateAll({ name: "John", email: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBeDefined();
    expect(result.errors.name).toBeUndefined();
  });

  it("returns field rule", () => {
    const schema = createFieldSchema({ name: { required: true, maxLength: 50 } });
    const rule = schema.getFieldRule("name");
    expect(rule?.required).toBe(true);
    expect(rule?.maxLength).toBe(50);
  });

  it("returns undefined for unknown field rule", () => {
    const schema = createFieldSchema({ name: { required: true } });
    expect(schema.getFieldRule("unknown")).toBeUndefined();
  });
});

describe("combineValidators", () => {
  it("merges errors from multiple validators", () => {
    const v1 = () => ({ valid: false, errors: { name: ["Required"] } });
    const v2 = () => ({ valid: false, errors: { name: ["Too short"], email: ["Invalid"] } });
    const combined = combineValidators(v1, v2);
    const result = combined({ name: "", email: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toEqual(["Required", "Too short"]);
    expect(result.errors.email).toEqual(["Invalid"]);
  });

  it("returns valid when all validators pass", () => {
    const v1 = () => ({ valid: true, errors: {} });
    const v2 = () => ({ valid: true, errors: {} });
    const combined = combineValidators(v1, v2);
    const result = combined({ name: "John" });
    expect(result.valid).toBe(true);
  });

  it("handles empty validators list", () => {
    const combined = combineValidators();
    const result = combined({ name: "John" });
    expect(result.valid).toBe(true);
  });
});

describe("dateValidator", () => {
  describe("isValidFormat", () => {
    it("returns true for valid YYYY-MM-DD", () => {
      expect(dateValidator.isValidFormat("2025-06-15")).toBe(true);
    });

    it("returns false for invalid format", () => {
      expect(dateValidator.isValidFormat("15/06/2025")).toBe(false);
      expect(dateValidator.isValidFormat("not-a-date")).toBe(false);
      expect(dateValidator.isValidFormat("")).toBe(false);
    });
  });

  describe("isPast", () => {
    it("returns true for past date", () => {
      expect(dateValidator.isPast("2020-01-01")).toBe(true);
    });

    it("returns false for future date", () => {
      expect(dateValidator.isPast("2099-01-01")).toBe(false);
    });

    it("returns false for invalid date", () => {
      expect(dateValidator.isPast("invalid")).toBe(false);
    });
  });

  describe("isFuture", () => {
    it("returns true for future date", () => {
      expect(dateValidator.isFuture("2099-01-01")).toBe(true);
    });

    it("returns false for past date", () => {
      expect(dateValidator.isFuture("2020-01-01")).toBe(false);
    });

    it("returns false for invalid date", () => {
      expect(dateValidator.isFuture("invalid")).toBe(false);
    });
  });

  describe("isAfter", () => {
    it("returns true when a is after b", () => {
      expect(dateValidator.isAfter("2025-06-20", "2025-06-15")).toBe(true);
    });

    it("returns false when a is before b", () => {
      expect(dateValidator.isAfter("2025-06-10", "2025-06-15")).toBe(false);
    });

    it("returns false for invalid dates", () => {
      expect(dateValidator.isAfter("invalid", "2025-06-15")).toBe(false);
    });
  });

  describe("daysBetween", () => {
    it("returns correct days between dates", () => {
      expect(dateValidator.daysBetween("2025-06-10", "2025-06-15")).toBe(5);
    });

    it("returns NaN for invalid dates", () => {
      expect(Number.isNaN(dateValidator.daysBetween("invalid", "2025-06-15"))).toBe(true);
    });
  });

  describe("format", () => {
    it("formats valid date to ISO date string", () => {
      expect(dateValidator.format("2025-06-15")).toBe("2025-06-15");
    });

    it("returns original value for invalid date", () => {
      expect(dateValidator.format("not-a-date")).toBe("not-a-date");
    });
  });
});
