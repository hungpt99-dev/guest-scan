import { describe, it, expect } from "vitest";
import {
  createDefaultTemplate,
  exportTemplateAsJson,
  importTemplateFromJson,
} from "../../../features/fill/templateManager";

describe("templateManager", () => {
  describe("createDefaultTemplate", () => {
    it("creates a template with the given name", () => {
      const tpl = createDefaultTemplate("My PMS");
      expect(tpl.name).toBe("My PMS");
      expect(tpl.type).toBe("copy_assistant");
      expect(tpl.saveMode).toBe("manual");
      expect(tpl.mappings).toEqual([]);
      expect(tpl.safetyRules).toEqual([]);
      expect(tpl.version).toBe("1.0.0");
      expect(tpl.id).toBeTruthy();
      expect(tpl.createdAt).toBeTruthy();
      expect(tpl.updatedAt).toBeTruthy();
    });
  });

  describe("exportTemplateAsJson", () => {
    it("exports template as formatted JSON", () => {
      const tpl = createDefaultTemplate("Test");
      const json = exportTemplateAsJson(tpl);
      const parsed = JSON.parse(json);
      expect(parsed.name).toBe("Test");
      expect(parsed.type).toBe("copy_assistant");
    });
  });

  describe("importTemplateFromJson", () => {
    it("imports valid template JSON", () => {
      const json = JSON.stringify({
        id: "tpl-1",
        name: "Imported",
        type: "web",
        mappings: [
          {
            id: "m1",
            excelColumn: "fullName",
            targetFieldName: "Name",
            targetType: "web",
            required: true,
            enabled: true,
          },
        ],
      });
      const result = importTemplateFromJson(json);
      expect(result).not.toBeNull();
      expect(result!.name).toBe("Imported");
      expect(result!.type).toBe("web");
    });

    it("returns null for invalid JSON", () => {
      const result = importTemplateFromJson("not json");
      expect(result).toBeNull();
    });

    it("returns null for missing required fields", () => {
      const result = importTemplateFromJson(JSON.stringify({ foo: "bar" }));
      expect(result).toBeNull();
    });

    it("returns null for non-array mappings", () => {
      const result = importTemplateFromJson(
        JSON.stringify({ id: "1", name: "Test", type: "web", mappings: "invalid" }),
      );
      expect(result).toBeNull();
    });
  });
});
