import { useState, useEffect } from "react";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import EmptyState from "../components/common/EmptyState";
import ErrorMessage from "../components/common/ErrorMessage";
import {
  getTemplates,
  saveTemplate,
  deleteTemplate,
  createDefaultTemplate,
  exportTemplateAsJson,
  importTemplateFromJson,
} from "../features/fill/templateManager";
import type { TargetSystemTemplate } from "@guestfill/shared";

export default function TemplateManagerScreen() {
  const [templates, setTemplates] = useState<TargetSystemTemplate[]>([]);
  const [editing, setEditing] = useState<TargetSystemTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [importJson, setImportJson] = useState("");

  useEffect(() => {
    getTemplates().then(setTemplates);
  }, []);

  const handleCreate = () => {
    const name = prompt("Enter template name:");
    if (!name) return;
    const template = createDefaultTemplate(name);
    setEditing(template);
  };

  const handleSave = async () => {
    if (!editing) return;
    const updated = { ...editing, updatedAt: new Date().toISOString() };
    await saveTemplate(updated);
    setTemplates(await getTemplates());
    setEditing(null);
    setSuccessMsg("Template saved");
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await deleteTemplate(id);
    setTemplates(await getTemplates());
  };

  const handleExportJson = (template: TargetSystemTemplate) => {
    const json = exportTemplateAsJson(template);
    navigator.clipboard.writeText(json);
    setSuccessMsg("Template JSON copied to clipboard");
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  const handleImportJson = () => {
    const template = importTemplateFromJson(importJson);
    if (!template) {
      setError("Invalid template JSON");
      return;
    }
    setEditing(template);
    setImportJson("");
    setError(null);
  };

  const handleAddMapping = () => {
    if (!editing) return;
    const mapping = {
      id: crypto.randomUUID(),
      excelColumn: "",
      targetFieldName: "",
      targetType: "copy" as const,
      required: false,
      enabled: true,
    };
    setEditing({ ...editing, mappings: [...editing.mappings, mapping] });
  };

  const updateMapping = (idx: number, updates: Record<string, unknown>) => {
    if (!editing) return;
    const mappings = [...editing.mappings];
    mappings[idx] = { ...mappings[idx], ...updates } as (typeof mappings)[number];
    setEditing({ ...editing, mappings });
  };

  const removeMapping = (idx: number) => {
    if (!editing) return;
    setEditing({ ...editing, mappings: editing.mappings.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Target System Templates</h1>
        <Button onClick={handleCreate}>Create Template</Button>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}
      {successMsg && <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">{successMsg}</div>}

      {editing && (
        <Card title={`Edit Template: ${editing.name}`}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Type</label>
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={editing.type}
                  onChange={(e) =>
                    setEditing({ ...editing, type: e.target.value as "copy_assistant" | "web" | "desktop" })
                  }
                >
                  <option value="copy_assistant">Copy Assistant</option>
                  <option value="web">Web</option>
                  <option value="desktop">Desktop</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Save Mode</label>
                <select
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={editing.saveMode}
                  onChange={(e) => setEditing({ ...editing, saveMode: e.target.value as "manual" | "auto" })}
                >
                  <option value="manual">Manual (Safe Default)</option>
                  <option value="auto">Auto</option>
                </select>
              </div>
              {editing.type === "web" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">URL Pattern</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={editing.urlPattern || ""}
                    onChange={(e) => setEditing({ ...editing, urlPattern: e.target.value })}
                  />
                </div>
              )}
              {editing.type === "desktop" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Window Title Pattern</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    value={editing.windowTitlePattern || ""}
                    onChange={(e) => setEditing({ ...editing, windowTitlePattern: e.target.value })}
                  />
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-700">Field Mappings</h3>
                <Button variant="secondary" onClick={handleAddMapping}>
                  Add Mapping
                </Button>
              </div>
              {editing.mappings.length === 0 && <p className="text-sm text-gray-400">No mappings defined yet.</p>}
              {editing.mappings.map((mapping, idx) => (
                <div key={mapping.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-gray-50 p-2">
                  <input
                    type="text"
                    placeholder="Excel Column"
                    className="flex-1 min-w-[120px] rounded border border-gray-300 px-2 py-1 text-sm"
                    value={mapping.excelColumn}
                    onChange={(e) => updateMapping(idx, { excelColumn: e.target.value })}
                  />
                  <input
                    type="text"
                    placeholder="Target Field Name"
                    className="flex-1 min-w-[120px] rounded border border-gray-300 px-2 py-1 text-sm"
                    value={mapping.targetFieldName}
                    onChange={(e) => updateMapping(idx, { targetFieldName: e.target.value })}
                  />
                  <select
                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                    value={mapping.targetType}
                    onChange={(e) => updateMapping(idx, { targetType: e.target.value })}
                  >
                    <option value="copy">Copy</option>
                    <option value="web">Web</option>
                    <option value="desktop">Desktop</option>
                  </select>
                  {mapping.targetType === "web" && (
                    <input
                      type="text"
                      placeholder="CSS Selector"
                      className="flex-1 min-w-[100px] rounded border border-gray-300 px-2 py-1 text-sm"
                      value={mapping.webSelector || ""}
                      onChange={(e) => updateMapping(idx, { webSelector: e.target.value })}
                    />
                  )}
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={mapping.required}
                      onChange={(e) => updateMapping(idx, { required: e.target.checked })}
                    />
                    Required
                  </label>
                  <Button variant="ghost" className="text-red-600" onClick={() => removeMapping(idx)}>
                    ×
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex gap-4 border-t pt-4">
              <Button onClick={handleSave}>Save Template</Button>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card title="Import Template from JSON">
        <div className="space-y-2">
          <textarea
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono"
            rows={4}
            placeholder="Paste template JSON here..."
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
          />
          <Button variant="secondary" onClick={handleImportJson} disabled={!importJson}>
            Import JSON
          </Button>
        </div>
      </Card>

      {templates.length === 0 && !editing && (
        <Card>
          <EmptyState
            title="No templates yet"
            description="Create a template to configure how fields are filled into target systems."
          />
        </Card>
      )}

      {templates.length > 0 && !editing && (
        <Card title="Saved Templates">
          <div className="space-y-2">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{tpl.name}</p>
                  <p className="text-xs text-gray-500">
                    {tpl.type} · {tpl.saveMode} save · {tpl.mappings.length} mappings
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setEditing(tpl)}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => handleExportJson(tpl)}>
                    Export
                  </Button>
                  <Button variant="ghost" className="text-red-600" onClick={() => handleDelete(tpl.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
