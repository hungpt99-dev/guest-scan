import type { TargetSystemTemplate } from "@guestfill/shared";
import { getAll, getById, put, remove } from "../../lib/db";

export async function getTemplates(): Promise<TargetSystemTemplate[]> {
  return getAll<TargetSystemTemplate>("target_templates");
}

export async function getTemplate(id: string): Promise<TargetSystemTemplate | undefined> {
  return getById<TargetSystemTemplate>("target_templates", id);
}

export async function saveTemplate(template: TargetSystemTemplate): Promise<void> {
  await put("target_templates", template);
}

export async function deleteTemplate(id: string): Promise<void> {
  await remove("target_templates", id);
}

export function exportTemplateAsJson(template: TargetSystemTemplate): string {
  return JSON.stringify(template, null, 2);
}

export function importTemplateFromJson(json: string): TargetSystemTemplate | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.id || !parsed.name || !parsed.type) return null;
    if (!Array.isArray(parsed.mappings)) return null;
    return parsed as TargetSystemTemplate;
  } catch {
    return null;
  }
}

export function createDefaultTemplate(name: string): TargetSystemTemplate {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    type: "copy_assistant",
    saveMode: "manual",
    mappings: [],
    safetyRules: [],
    version: "1.0.0",
    createdAt: now,
    updatedAt: now,
  };
}
