import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createDefaultTemplate,
  exportTemplateAsJson,
  importTemplateFromJson,
  saveTemplate,
  getTemplates,
  getTemplate,
  deleteTemplate,
} from "../../../features/fill/templateManager";
import type { TargetSystemTemplate } from "@guestfill/shared";

const { templateStore } = vi.hoisted(() => {
  const store = new Map<string, TargetSystemTemplate>();
  return { templateStore: store };
});

vi.mock("../../../lib/db", () => ({
  getAll: vi.fn(async () => Array.from(templateStore.values())),
  getById: vi.fn(async (_name: string, id: string) => templateStore.get(id)),
  put: vi.fn(async (_name: string, value: TargetSystemTemplate) => {
    templateStore.set(value.id, value);
  }),
  remove: vi.fn(async (_name: string, id: string) => {
    templateStore.delete(id);
  }),
}));

describe("Template Manager E2E: full CRUD lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    templateStore.clear();
  });

  it("creates a template with default structure", () => {
    const tpl = createDefaultTemplate("Hotel PMS");
    expect(tpl.name).toBe("Hotel PMS");
    expect(tpl.type).toBe("copy_assistant");
    expect(tpl.saveMode).toBe("manual");
    expect(tpl.mappings).toEqual([]);
    expect(tpl.safetyRules).toEqual([]);
    expect(tpl.version).toBe("1.0.0");
    expect(tpl.id).toBeTruthy();
    expect(tpl.createdAt).toBeTruthy();
    expect(tpl.updatedAt).toBeTruthy();
  });

  it("saves and retrieves a template", async () => {
    const tpl = createDefaultTemplate("Test PMS");
    tpl.mappings = [
      {
        id: "m1",
        excelColumn: "fullName",
        targetFieldName: "Guest Name",
        targetType: "copy",
        required: true,
        enabled: true,
      },
    ];
    await saveTemplate(tpl);
    const retrieved = await getTemplate(tpl.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("Test PMS");
    expect(retrieved?.mappings).toHaveLength(1);
    expect(retrieved?.mappings[0]?.excelColumn).toBe("fullName");
  });

  it("lists all templates", async () => {
    const t1 = createDefaultTemplate("PMS Alpha");
    const t2 = createDefaultTemplate("PMS Beta");
    await saveTemplate(t1);
    await saveTemplate(t2);
    const all = await getTemplates();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.name).sort()).toEqual(["PMS Alpha", "PMS Beta"]);
  });

  it("deletes a template", async () => {
    const tpl = createDefaultTemplate("Delete Me");
    await saveTemplate(tpl);
    expect(await getTemplate(tpl.id)).toBeDefined();
    await deleteTemplate(tpl.id);
    expect(await getTemplate(tpl.id)).toBeUndefined();
  });

  it("supports full CRUD cycle: create -> read -> update -> delete", async () => {
    const tpl = createDefaultTemplate("CRUD PMS");
    await saveTemplate(tpl);

    const created = await getTemplate(tpl.id);
    expect(created?.name).toBe("CRUD PMS");

    tpl.name = "CRUD PMS Updated";
    tpl.urlPattern = "https://pms.example.com/*";
    tpl.mappings.push({
      id: "m2",
      excelColumn: "passportNumber",
      targetFieldName: "Passport No",
      targetType: "copy",
      required: true,
      enabled: true,
    });
    await saveTemplate(tpl);

    const updated = await getTemplate(tpl.id);
    expect(updated?.name).toBe("CRUD PMS Updated");
    expect(updated?.urlPattern).toBe("https://pms.example.com/*");
    expect(updated?.mappings).toHaveLength(1);

    await deleteTemplate(tpl.id);
    expect(await getTemplate(tpl.id)).toBeUndefined();
  });

  it("exports template as valid JSON", () => {
    const tpl = createDefaultTemplate("Export Test");
    tpl.mappings = [
      {
        id: "m1",
        excelColumn: "fullName",
        targetFieldName: "Name",
        targetType: "copy",
        required: true,
        enabled: true,
      },
    ];
    const json = exportTemplateAsJson(tpl);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("Export Test");
    expect(parsed.mappings).toHaveLength(1);
  });

  it("imports valid JSON template", () => {
    const json = JSON.stringify({
      id: "imported-1",
      name: "Imported PMS",
      type: "copy_assistant",
      saveMode: "manual",
      mappings: [
        {
          id: "m1",
          excelColumn: "fullName",
          targetFieldName: "Name",
          targetType: "copy",
          required: true,
          enabled: true,
        },
      ],
      safetyRules: [],
      version: "1.0.0",
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    });
    const result = importTemplateFromJson(json);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Imported PMS");
  });

  it("rejects import of invalid JSON", () => {
    expect(importTemplateFromJson("not json")).toBeNull();
    expect(importTemplateFromJson('{"name":"no id"}')).toBeNull();
    expect(importTemplateFromJson('{"id":"1","name":"n","mappings":"bad"}')).toBeNull();
    expect(importTemplateFromJson('{"id":"1","name":"n","type":"web","mappings":[]}')).not.toBeNull();
  });
});
