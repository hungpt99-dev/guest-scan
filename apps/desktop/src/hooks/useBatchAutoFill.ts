import { useState, useCallback, useRef } from "react";
import { createDefaultFillExecutor, type FillExecutor } from "../services/auto-fill-execution-service";
import { saveGuestRow } from "../features/fill/fillStore";
import type { GuestRow } from "@guestfill/shared";
import type { TargetSystemTemplate } from "@guestfill/shared";

export type BatchState = "idle" | "running" | "paused" | "completed" | "failed";

export type BatchGuestResult = {
  guestId: string;
  fullName: string;
  status: "FILLED" | "SKIPPED" | "FAILED";
  error?: string;
  filledFields: number;
  durationMs: number;
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

export function useBatchAutoFill(executor?: FillExecutor) {
  const fillExecutor = executor ?? createDefaultFillExecutor();
  const [state, setState] = useState<BatchState>("idle");
  const [results, setResults] = useState<BatchGuestResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const execute = useCallback(
    async (guests: GuestRow[], template: TargetSystemTemplate) => {
      abortRef.current = false;
      setState("running");
      setCurrentIndex(0);
      setTotalCount(guests.length);
      setResults([]);
      setError(null);

      const desktopMappings = template.mappings.filter((m) => m.targetType === "desktop" || m.targetType === "copy");

      const batchResults: BatchGuestResult[] = [];

      for (let i = 0; i < guests.length; i++) {
        if (abortRef.current) {
          setState("paused");
          return;
        }

        const guest = guests[i]!;
        const guestStart = performance.now();
        setCurrentIndex(i);

        try {
          if (template.windowTitlePattern) {
            await fillExecutor.focusTargetApp(template.windowTitlePattern, template.windowTitlePattern);
          }

          let filledCount = 0;
          for (const mapping of desktopMappings) {
            const value = resolveGuestValue(guest, mapping.targetFieldName);
            if (!value) continue;

            await fillExecutor.fillDesktopField(value, {
              automationId: mapping.targetFieldName,
            });
            filledCount++;
          }

          if (filledCount > 0 && template.autoSaveControlId) {
            try {
              await fillExecutor.clickSubmitButton(template.autoSaveControlId);
              const waitMs = template.submitWaitMs ?? 2000;
              if (waitMs > 0) {
                await new Promise((r) => setTimeout(r, waitMs));
              }
            } catch {
              /* submit click is optional */
            }
          }

          batchResults.push({
            guestId: guest.id,
            fullName: guest.fullName,
            status: filledCount > 0 ? "FILLED" : "SKIPPED",
            filledFields: filledCount,
            durationMs: Math.round(performance.now() - guestStart),
          });

          await saveGuestRow({
            ...guest,
            fillStatus: "FILLED" as const,
            updatedAt: new Date().toISOString(),
          });
        } catch (guestError) {
          batchResults.push({
            guestId: guest.id,
            fullName: guest.fullName,
            status: "FAILED",
            error: guestError instanceof Error ? guestError.message : "Unknown error",
            filledFields: 0,
            durationMs: Math.round(performance.now() - guestStart),
          });
        }

        setResults([...batchResults]);
      }

      setState("completed");
      setResults(batchResults);
    },
    [fillExecutor],
  );

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setResults([]);
    setCurrentIndex(0);
    setTotalCount(0);
    setError(null);
    abortRef.current = false;
  }, []);

  return {
    state,
    results,
    currentIndex,
    totalCount,
    error,
    execute,
    abort,
    reset,
  };
}
