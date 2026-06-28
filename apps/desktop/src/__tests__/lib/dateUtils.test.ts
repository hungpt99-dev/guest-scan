import { describe, it, expect } from "vitest";
import { formatTimestamp, nowISO } from "../../lib/dateUtils";

describe("dateUtils", () => {
  describe("formatTimestamp", () => {
    it("formats a date as ISO string", () => {
      const date = new Date("2025-06-15T10:30:00Z");
      expect(formatTimestamp(date)).toBe("2025-06-15T10:30:00.000Z");
    });
  });

  describe("nowISO", () => {
    it("returns a valid ISO string", () => {
      const result = nowISO();
      expect(() => new Date(result)).not.toThrow();
      expect(new Date(result).toISOString()).toBe(result);
    });
  });
});
