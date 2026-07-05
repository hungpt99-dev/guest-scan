import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatTimestamp, nowISO } from "../../lib/dateUtils";

describe("dateUtils", () => {
  describe("formatTimestamp", () => {
    it("formats a date as ISO string", () => {
      const date = new Date("2025-06-15T10:30:00Z");
      expect(formatTimestamp(date)).toBe("2025-06-15T10:30:00.000Z");
    });

    it("handles epoch date", () => {
      const date = new Date(0);
      expect(formatTimestamp(date)).toBe("1970-01-01T00:00:00.000Z");
    });

    it("handles date-only input", () => {
      const date = new Date("2025-06-15");
      expect(formatTimestamp(date)).toBeDefined();
      expect(formatTimestamp(date)).toContain("2025-06-15");
    });

    it("handles leap year date", () => {
      const date = new Date("2024-02-29T12:00:00Z");
      expect(formatTimestamp(date)).toBe("2024-02-29T12:00:00.000Z");
    });
  });

  describe("nowISO", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns a valid ISO string", () => {
      const result = nowISO();
      expect(() => new Date(result)).not.toThrow();
      expect(new Date(result).toISOString()).toBe(result);
    });

    it("returns the mocked current time", () => {
      const fixedDate = new Date("2025-06-15T10:30:00Z");
      vi.setSystemTime(fixedDate);
      expect(nowISO()).toBe("2025-06-15T10:30:00.000Z");
    });

    it("returns timezone-aware format", () => {
      const result = nowISO();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});
