import { describe, it, expect } from "vitest";
import {
  validateGuestField,
  validateGuestForm,
  validateGuestFieldValue,
  hasFieldError,
  getFieldErrors,
  getFormErrorSummary,
} from "../../../features/fill/validation";

describe("validateGuestField", () => {
  it("returns errors for empty required field", () => {
    const errors = validateGuestField("fullName", "");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toContain("This field is required");
  });

  it("returns empty array for valid field", () => {
    const errors = validateGuestField("fullName", "John Doe");
    expect(errors).toEqual([]);
  });

  it("returns empty array for unknown field", () => {
    const errors = validateGuestField("unknownField", "value");
    expect(errors).toEqual([]);
  });

  it("validates with cross-field dependency", () => {
    const errors = validateGuestField("departureDate", "2025-06-10", {
      arrivalDate: "2025-06-15",
    });
    expect(errors).toContain("Departure date must be after arrival date");
  });
});

describe("validateGuestForm", () => {
  it("returns valid for complete guest data", () => {
    const result = validateGuestForm({
      fullName: "MUSTER JOHN MICHAEL",
      passportNumber: "AB123456",
      nationality: "UTO",
      gender: "M",
      dateOfBirth: "1985-10-10",
      passportExpiryDate: "2030-01-01",
    });
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it("returns invalid for missing required fields", () => {
    const result = validateGuestForm({
      fullName: "",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.fullName).toBeDefined();
  });

  it("returns errors shape as Record<string, string[]>", () => {
    const result = validateGuestForm({ fullName: "", passportNumber: "AB" });
    expect(result.errors.fullName).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(result.errors.passportNumber).toEqual(expect.arrayContaining([expect.any(String)]));
  });
});

describe("validateGuestFieldValue", () => {
  it("returns first error message for invalid field", () => {
    const error = validateGuestFieldValue("fullName", "");
    expect(error).toBe("This field is required");
  });

  it("returns undefined for valid field", () => {
    const error = validateGuestFieldValue("fullName", "John Doe");
    expect(error).toBeUndefined();
  });
});

describe("hasFieldError", () => {
  it("returns true when field has errors", () => {
    expect(hasFieldError({ fullName: ["Required"] }, "fullName")).toBe(true);
  });

  it("returns false when field has no errors", () => {
    expect(hasFieldError({}, "fullName")).toBe(false);
  });

  it("returns false when field has empty error array", () => {
    expect(hasFieldError({ fullName: [] }, "fullName")).toBe(false);
  });
});

describe("getFieldErrors", () => {
  it("returns errors for field", () => {
    expect(getFieldErrors({ fullName: ["Required", "Too short"] }, "fullName")).toEqual(["Required", "Too short"]);
  });

  it("returns empty array for field with no errors", () => {
    expect(getFieldErrors({}, "fullName")).toEqual([]);
  });
});

describe("getFormErrorSummary", () => {
  it("returns empty string for no errors", () => {
    expect(getFormErrorSummary({})).toBe("");
  });

  it("returns summary for single error", () => {
    const summary = getFormErrorSummary({ fullName: ["Required"] });
    expect(summary).toBe("1 error in 1 field");
  });

  it("returns summary for multiple errors", () => {
    const summary = getFormErrorSummary({
      fullName: ["Required", "Too short"],
      passportNumber: ["Must be at least 5 characters"],
    });
    expect(summary).toBe("3 errors in 2 fields");
  });

  it("handles multiple fields with single errors each", () => {
    const summary = getFormErrorSummary({
      fullName: ["Required"],
      passportNumber: ["Must be at least 5 characters"],
      dateOfBirth: ["Date of birth cannot be in the future"],
    });
    expect(summary).toBe("3 errors in 3 fields");
  });
});
