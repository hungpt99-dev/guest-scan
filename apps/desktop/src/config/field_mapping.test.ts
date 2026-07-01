import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FieldMappingConfig, FieldMappingEntry } from "./field_mapping";
import {
  OCR_FIELD_KEYS,
  DEFAULT_MAPPINGS,
  loadFieldMapping,
  saveFieldMapping,
  updateFieldMapping,
  setMappings,
  validateFieldMapping,
  createDefaultConfig,
} from "./field_mapping";

function makeConfig(overrides?: Partial<FieldMappingConfig>): FieldMappingConfig {
  return {
    mappings: DEFAULT_MAPPINGS.map((m) => ({ ...m })),
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function createMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

describe("FieldMapping", () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    vi.stubGlobal("localStorage", mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("DEFAULT_MAPPINGS", () => {
    it("includes all OCR field keys", () => {
      const mappedKeys = new Set(DEFAULT_MAPPINGS.map((m) => m.ocrField));
      for (const key of OCR_FIELD_KEYS) {
        expect(mappedKeys.has(key)).toBe(true);
      }
    });

    it("has no duplicate OCR field mappings", () => {
      const seen = new Set<string>();
      for (const m of DEFAULT_MAPPINGS) {
        expect(seen.has(m.ocrField)).toBe(false);
        seen.add(m.ocrField);
      }
    });

    it("has label for every entry", () => {
      for (const m of DEFAULT_MAPPINGS) {
        expect(m.label).toBeTruthy();
        expect(typeof m.label).toBe("string");
      }
    });

    it("has required fields enabled", () => {
      for (const m of DEFAULT_MAPPINGS) {
        if (m.required) {
          expect(m.enabled).toBe(true);
        }
      }
    });
  });

  describe("loadFieldMapping / saveFieldMapping", () => {
    it("returns default config when nothing is stored", () => {
      const config = loadFieldMapping();
      expect(config.mappings.length).toBe(DEFAULT_MAPPINGS.length);
    });

    it("round-trips config through localStorage", () => {
      const config = makeConfig({ updatedAt: "2025-06-01T00:00:00Z" });
      config.mappings[0]!.formField = "guestName";
      saveFieldMapping(config);
      const loaded = loadFieldMapping();
      expect(loaded.mappings[0]!.formField).toBe("guestName");
    });

    it("falls back to default when stored JSON is invalid", () => {
      localStorage.setItem("fieldMapping", "not-json");
      const config = loadFieldMapping();
      expect(config.mappings.length).toBe(DEFAULT_MAPPINGS.length);
    });

    it("falls back to default when stored config fails validation", () => {
      localStorage.setItem("fieldMapping", JSON.stringify({ mappings: [], updatedAt: "" }));
      const config = loadFieldMapping();
      expect(config.mappings.length).toBe(DEFAULT_MAPPINGS.length);
    });

    it("saveFieldMapping updates the updatedAt timestamp", () => {
      const config = makeConfig({ updatedAt: "2020-01-01T00:00:00Z" });
      saveFieldMapping(config);
      expect(config.updatedAt).not.toBe("2020-01-01T00:00:00Z");
    });
  });

  describe("updateFieldMapping", () => {
    it("updates a mapping by OCR field key", () => {
      const config = makeConfig();
      const updated = updateFieldMapping(config, "fullName", { formField: "guestName", label: "Guest Name" });
      const entry = updated.mappings.find((m) => m.ocrField === "fullName")!;
      expect(entry.formField).toBe("guestName");
      expect(entry.label).toBe("Guest Name");
    });

    it("preserves other fields when updating one property", () => {
      const config = makeConfig();
      const updated = updateFieldMapping(config, "fullName", { required: false });
      const entry = updated.mappings.find((m) => m.ocrField === "fullName")!;
      expect(entry.required).toBe(false);
      expect(entry.formField).toBe("fullName");
      expect(entry.enabled).toBe(true);
      expect(entry.label).toBe("Full Name");
    });

    it("does not mutate original config", () => {
      const config = makeConfig();
      const originalFormField = config.mappings[0]!.formField;
      updateFieldMapping(config, "fullName", { formField: "guestName" });
      expect(config.mappings[0]!.formField).toBe(originalFormField);
    });

    it("throws for unknown OCR field", () => {
      const config = makeConfig();
      expect(() => updateFieldMapping(config, "invalidField" as never, { formField: "x" })).toThrow();
    });

    it("updates updatedAt timestamp", () => {
      const config = makeConfig({ updatedAt: "2020-01-01T00:00:00Z" });
      const updated = updateFieldMapping(config, "fullName", { formField: "x" });
      expect(updated.updatedAt).not.toBe(config.updatedAt);
    });
  });

  describe("setMappings", () => {
    it("replaces all mappings", () => {
      const config = makeConfig();
      const single: FieldMappingEntry = {
        ocrField: "fullName",
        formField: "name",
        label: "Name",
        required: true,
        enabled: true,
      };
      const updated = setMappings(config, [single]);
      expect(updated.mappings).toHaveLength(1);
      expect(updated.mappings[0]!.formField).toBe("name");
    });

    it("does not share reference with input array", () => {
      const config = makeConfig();
      const input: FieldMappingEntry[] = [
        { ocrField: "fullName", formField: "x", label: "X", required: true, enabled: true },
      ];
      const updated = setMappings(config, input);
      input[0]!.formField = "y";
      expect(updated.mappings[0]!.formField).toBe("x");
    });
  });

  describe("createDefaultConfig", () => {
    it("creates fresh copies of mappings", () => {
      const a = createDefaultConfig();
      const b = createDefaultConfig();
      expect(a.mappings).toEqual(b.mappings);
      a.mappings[0]!.formField = "changed";
      expect(b.mappings[0]!.formField).not.toBe("changed");
    });
  });

  describe("validateFieldMapping", () => {
    it("returns valid for default config", () => {
      const config = createDefaultConfig();
      const result = validateFieldMapping(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects empty mappings", () => {
      const config = makeConfig({ mappings: [] });
      const result = validateFieldMapping(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("no entries"))).toBe(true);
    });

    it("rejects empty form field identifier", () => {
      const config = makeConfig();
      config.mappings[0]!.formField = "";
      const result = validateFieldMapping(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
    });

    it("rejects whitespace-only form field identifier", () => {
      const config = makeConfig();
      config.mappings[0]!.formField = "   ";
      const result = validateFieldMapping(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
    });

    it("rejects invalid OCR field key", () => {
      const config = makeConfig();
      config.mappings.push({
        ocrField: "bogus" as never,
        formField: "something",
        label: "Bogus",
        required: false,
        enabled: true,
      });
      const result = validateFieldMapping(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("not a valid OCR field"))).toBe(true);
    });

    it("warns when duplicate form field identifiers exist", () => {
      const config = makeConfig();
      config.mappings.push({
        ocrField: "fullName",
        formField: "fullName",
        label: "Name Dup",
        required: false,
        enabled: true,
      });
      const result = validateFieldMapping(config);
      expect(result.warnings.some((w) => w.includes("mapped by multiple"))).toBe(true);
    });

    it("rejects duplicate OCR field mappings", () => {
      const config = makeConfig();
      config.mappings.push({
        ocrField: "fullName",
        formField: "name_copy",
        label: "Name Copy",
        required: false,
        enabled: true,
      });
      const result = validateFieldMapping(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("multiple mappings"))).toBe(true);
    });

    it("detects missing required field mappings", () => {
      const config = makeConfig();
      config.mappings = config.mappings.filter((m) => m.ocrField !== "fullName");
      const result = validateFieldMapping(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("fullName"))).toBe(true);
    });

    it("warns when required mapping is disabled", () => {
      const config = makeConfig();
      config.mappings[0]!.required = true;
      config.mappings[0]!.enabled = false;
      const result = validateFieldMapping(config);
      expect(result.warnings.some((w) => w.includes("disabled"))).toBe(true);
    });
  });
});
