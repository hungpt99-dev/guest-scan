import { describe, it, expect } from "vitest";
import { formatDate, parseDate, isValidDate } from "@guestfill/shared";

describe("shared date utils", () => {
  describe("formatDate", () => {
    it("formats date as YYYY-MM-DD by default", () => {
      expect(formatDate("2025-06-15")).toBe("2025-06-15");
    });

    it("formats date as dd/MM/yyyy", () => {
      expect(formatDate("2025-06-15", "dd/MM/yyyy")).toBe("15/06/2025");
    });

    it("formats date as MM/dd/yyyy", () => {
      expect(formatDate("2025-06-15", "MM/dd/yyyy")).toBe("06/15/2025");
    });

    it("returns empty string for empty input", () => {
      expect(formatDate("")).toBe("");
    });

    it("returns original value for invalid date", () => {
      expect(formatDate("not-a-date", "dd/MM/yyyy")).toBe("not-a-date");
    });

    it("returns original value for invalid date YYYY-MM-DD", () => {
      expect(formatDate("invalid")).toBe("invalid");
    });
  });

  describe("parseDate", () => {
    it("parses valid date string", () => {
      const result = parseDate("2025-06-15");
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2025);
    });

    it("returns null for invalid date", () => {
      expect(parseDate("not-a-date")).toBeNull();
    });
  });

  describe("isValidDate", () => {
    it("returns true for valid date", () => {
      expect(isValidDate("2025-06-15")).toBe(true);
    });

    it("returns false for invalid date", () => {
      expect(isValidDate("not-a-date")).toBe(false);
    });
  });
});
