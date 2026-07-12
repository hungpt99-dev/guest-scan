import { useState, useEffect, useCallback } from "react";
import type { TargetSystemTemplate } from "@guestfill/shared";
import type { GuestRow } from "@guestfill/shared";
import { getTemplates } from "../features/fill/templateManager";
import { createDefaultFillExecutor, type FillExecutor } from "../services/auto-fill-execution-service";

export type AutoFillStatus = "idle" | "running" | "success" | "partial" | "failed";

type FieldResult = {
  formField: string;
  value: string;
  status: "FILLED" | "SKIPPED" | "FAILED";
  error?: string;
};

const GUEST_FIELD_ALIASES: Record<string, string[]> = {
  expiryDate: ["passportExpiryDate", "idExpiryDate"],
  documentNumber: ["passportNumber", "idNumber"],
};

function resolveGuestValue(guest: GuestRow, targetField: string): string {
  const value = (guest as Record<string, unknown>)[targetField];
  if (value && String(value).trim()) return String(value);
  const aliases = GUEST_FIELD_ALIASES[targetField];
  if (aliases) {
    for (const alias of aliases) {
      const aliasValue = (guest as Record<string, unknown>)[alias];
      if (aliasValue && String(aliasValue).trim()) return String(aliasValue);
    }
  }
  return "";
}

export function useDesktopAutoFill(executor?: FillExecutor) {
  const fillExecutor = executor ?? createDefaultFillExecutor();
  const [templates, setTemplates] = useState<TargetSystemTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [status, setStatus] = useState<AutoFillStatus>("idle");
  const [fieldResults, setFieldResults] = useState<FieldResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTemplates().then((all) => {
      const desktop = all.filter((t) => t.type === "desktop");
      setTemplates(desktop);
      if (desktop.length > 0) {
        setSelectedTemplateId(desktop[0]!.id);
      }
    });
  }, []);

  const execute = useCallback(
    async (guest: GuestRow) => {
      const template = templates.find((t) => t.id === selectedTemplateId);
      if (!template) {
        setError("No desktop template selected");
        return;
      }

      setStatus("running");
      setError(null);
      setFieldResults([]);

      const desktopMappings = template.mappings.filter((m) => m.targetType === "desktop" || m.targetType === "copy");

      try {
        if (template.windowTitlePattern) {
          await fillExecutor.focusTargetApp(template.windowTitlePattern, template.windowTitlePattern);
        }

        const results: FieldResult[] = [];

        for (const mapping of desktopMappings) {
          const value = resolveGuestValue(guest, mapping.targetFieldName);
          if (!value) {
            results.push({
              formField: mapping.targetFieldName,
              value: "",
              status: "SKIPPED",
              error: "No value available",
            });
            continue;
          }

          try {
            await fillExecutor.fillDesktopField(value, {
              automationId: mapping.targetFieldName,
            });
            results.push({
              formField: mapping.targetFieldName,
              value,
              status: "FILLED",
            });
          } catch (fillError) {
            results.push({
              formField: mapping.targetFieldName,
              value,
              status: "FAILED",
              error: fillError instanceof Error ? fillError.message : "Fill failed",
            });
          }
        }

        setFieldResults(results);

        const filled = results.filter((r) => r.status === "FILLED").length;
        const failed = results.filter((r) => r.status === "FAILED").length;
        const skipped = results.filter((r) => r.status === "SKIPPED").length;

        if (filled > 0 && failed === 0 && skipped === 0) {
          setStatus("success");
        } else if (filled > 0) {
          setStatus("partial");
        } else {
          setStatus("failed");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Auto-fill failed");
        setStatus("failed");
      }
    },
    [templates, selectedTemplateId, fillExecutor],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setFieldResults([]);
    setError(null);
  }, []);

  const reloadTemplates = useCallback(async () => {
    const all = await getTemplates();
    const desktop = all.filter((t) => t.type === "desktop");
    setTemplates(desktop);
    if (desktop.length > 0) {
      setSelectedTemplateId(desktop[0]!.id);
    }
  }, []);

  return {
    templates,
    selectedTemplateId,
    setSelectedTemplateId,
    status,
    fieldResults,
    error,
    execute,
    reset,
    reloadTemplates,
  };
}
