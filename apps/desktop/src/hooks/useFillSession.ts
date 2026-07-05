import { useState, useEffect, useCallback } from "react";
import {
  getCurrentGuest,
  getAllGuestRows,
  setCurrentGuest,
  saveGuestRow,
  saveFillEvent,
} from "../features/fill/fillStore";
import {
  checkFieldAccuracyBeforeCopy,
  copyFieldWithAccuracyCheck,
  copyAllHighConfidenceFields,
  getBatchCopyPreview,
  getFieldsInOrder,
  navigateField,
  navigateGuest,
  getAccuracySummary,
  getQuickFixesForField,
} from "../features/fill/copyAssistant";
import type { QuickFix } from "../features/fill/safetyEngine";
import type { GuestRow, FillEvent, ConfidenceLevel } from "@guestfill/shared";
import { DEFAULT_FIELD_ORDER } from "../features/fill/fillConstants";

export interface FieldItem {
  key: string;
  label: string;
  value: string;
  accuracyLevel: ConfidenceLevel;
  accuracyScore: number;
  ocrConfidence?: number;
}

export interface UseFillSessionReturn {
  guest: GuestRow | null;
  guests: GuestRow[];
  currentFieldIndex: number;
  fields: FieldItem[];
  currentField: FieldItem | undefined;
  currentGuestIndex: number;
  summary: ReturnType<typeof getAccuracySummary> | null;
  currentFieldQuickFixes: QuickFix[];
  copiedFields: Record<string, boolean>;
  error: string | null;
  warning: string | null;
  successMsg: string | null;
  showAccuracyDetail: boolean;
  unsavedChanges: boolean;
  batchCopying: boolean;
  batchResult: Awaited<ReturnType<typeof copyAllHighConfidenceFields>> | null;
  showBatchPreview: boolean;
  batchPreview: ReturnType<typeof getBatchCopyPreview> | null;
  filledCount: number;
  pendingCount: number;
  handleCopyField: (fieldKey: string) => Promise<void>;
  handleApplyQuickFix: (fieldKey: string, value?: string) => void;
  handleNextField: () => void;
  handlePrevField: () => void;
  handleNextGuest: () => void;
  handlePrevGuest: () => void;
  handleMarkFilled: () => Promise<void>;
  handleMarkSkipped: () => Promise<void>;
  handleBatchCopyHighConfidence: () => Promise<void>;
  setShowAccuracyDetail: (show: boolean) => void;
  setShowBatchPreview: (show: boolean) => void;
  setError: (error: string | null) => void;
}

export function useFillSession(): UseFillSessionReturn {
  const [guest, setGuestState] = useState<GuestRow | null>(getCurrentGuest());
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [copiedFields, setCopiedFields] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showAccuracyDetail, setShowAccuracyDetail] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [batchCopying, setBatchCopying] = useState(false);
  const [batchResult, setBatchResult] = useState<Awaited<ReturnType<typeof copyAllHighConfidenceFields>> | null>(null);
  const [showBatchPreview, setShowBatchPreview] = useState(false);

  useEffect(() => {
    if (!guest) {
      getAllGuestRows().then((rows) => {
        setGuests(rows);
        if (rows.length > 0) {
          const first = rows[0]!;
          setGuestState(first);
          setCurrentGuest(first);
        }
      });
    } else {
      getAllGuestRows().then((rows) => setGuests(rows));
    }
  }, [guest]);

  useEffect(() => {
    if (guest) {
      const summary = getAccuracySummary(guest);
      if (summary.warnings.length > 0 || summary.recommendations.length > 0) {
        setShowAccuracyDetail(true);
      }
    }
  }, [guest]);

  const updateGuest = useCallback((updated: GuestRow) => {
    setGuestState(updated);
    setCurrentGuest(updated);
  }, []);

  const fields: FieldItem[] = guest ? getFieldsInOrder(guest, DEFAULT_FIELD_ORDER) : [];
  const currentField = fields[currentFieldIndex];
  const currentGuestIndex = Math.max(
    0,
    guests.findIndex((g) => g.id === (guest?.id || "")),
  );
  const summary = guest ? getAccuracySummary(guest) : null;
  const currentFieldQuickFixes: QuickFix[] =
    currentField && guest ? getQuickFixesForField(guest, currentField.key) : [];

  const getFieldValue = useCallback(
    (fieldKey: string): string => {
      if (!guest) return "";
      return String((guest as Record<string, unknown>)[fieldKey] || "");
    },
    [guest],
  );

  const handleCopyField = useCallback(
    async (fieldKey: string) => {
      if (!guest) return;
      const value = getFieldValue(fieldKey);
      if (!value) {
        setError("Field is empty, nothing to copy.");
        setWarning(null);
        return;
      }

      const check = checkFieldAccuracyBeforeCopy(guest, fieldKey);
      if (!check.success) {
        setWarning(check.warning ?? "Low accuracy field — review before copying");
        setError(null);
        return;
      }

      setWarning(null);
      const result = await copyFieldWithAccuracyCheck(guest, fieldKey);
      if (result.copied) {
        setCopiedFields((prev) => ({ ...prev, [fieldKey]: true }));
        setSuccessMsg(`Copied: ${fieldKey}`);
        setError(null);
        setTimeout(() => setSuccessMsg(null), 2000);
      } else if (result.transformError) {
        setError(result.transformError);
      } else {
        setError("Failed to copy to clipboard.");
      }
    },
    [guest, getFieldValue],
  );

  const handleApplyQuickFix = useCallback(
    (fieldKey: string, value?: string) => {
      if (!guest || !value) return;
      updateGuest({ ...guest, [fieldKey]: value });
      setUnsavedChanges(true);
      setSuccessMsg(`Applied fix: ${fieldKey} → ${value}`);
      setTimeout(() => setSuccessMsg(null), 2000);
    },
    [guest, updateGuest],
  );

  const handleNextField = useCallback(() => {
    setCurrentFieldIndex((prev) => navigateField(prev, fields.length, "next"));
  }, [fields.length]);

  const handlePrevField = useCallback(() => {
    setCurrentFieldIndex((prev) => navigateField(prev, fields.length, "prev"));
  }, [fields.length]);

  const navigateToGuest = useCallback(
    (newIdx: number) => {
      const newGuest = guests[newIdx];
      if (newGuest) {
        setGuestState(newGuest);
        setCurrentGuest(newGuest);
        setCurrentFieldIndex(0);
        setCopiedFields({});
        setError(null);
        setWarning(null);
      }
    },
    [guests],
  );

  const handleNextGuest = useCallback(() => {
    const newIdx = navigateGuest(currentGuestIndex, guests.length, "next");
    navigateToGuest(newIdx);
  }, [currentGuestIndex, guests.length, navigateToGuest]);

  const handlePrevGuest = useCallback(() => {
    const newIdx = navigateGuest(currentGuestIndex, guests.length, "prev");
    navigateToGuest(newIdx);
  }, [currentGuestIndex, guests.length, navigateToGuest]);

  const handleMarkFilled = useCallback(async () => {
    if (!guest) return;
    const updated: GuestRow = { ...guest, fillStatus: "FILLED", updatedAt: new Date().toISOString() };
    await saveGuestRow(updated);
    updateGuest(updated);
    const event: FillEvent = {
      id: crypto.randomUUID(),
      sessionId: guest.sessionId,
      guestRowId: guest.id,
      eventType: "GUEST_MARKED_FILLED",
      status: "SUCCESS",
      createdAt: new Date().toISOString(),
    };
    await saveFillEvent(event);
    setSuccessMsg("Guest marked as FILLED");
    setTimeout(() => setSuccessMsg(null), 2000);
  }, [guest, updateGuest]);

  const handleMarkSkipped = useCallback(async () => {
    if (!guest) return;
    const updated: GuestRow = { ...guest, fillStatus: "SKIPPED", updatedAt: new Date().toISOString() };
    await saveGuestRow(updated);
    updateGuest(updated);
    const event: FillEvent = {
      id: crypto.randomUUID(),
      sessionId: guest.sessionId,
      guestRowId: guest.id,
      eventType: "GUEST_MARKED_SKIPPED",
      status: "SUCCESS",
      createdAt: new Date().toISOString(),
    };
    await saveFillEvent(event);
    setSuccessMsg("Guest marked as SKIPPED");
    setTimeout(() => setSuccessMsg(null), 2000);
  }, [guest, updateGuest]);

  const handleBatchCopyHighConfidence = useCallback(async () => {
    if (!guest || batchCopying) return;
    setBatchCopying(true);
    setError(null);
    setWarning(null);
    try {
      const result = await copyAllHighConfidenceFields(guest);
      setBatchResult(result);
      if (result.successCount > 0) {
        const newCopied: Record<string, boolean> = {};
        for (const key of result.copied) {
          newCopied[key] = true;
        }
        setCopiedFields((prev) => ({ ...prev, ...newCopied }));
        setSuccessMsg(`Batch copied ${result.successCount} field${result.successCount === 1 ? "" : "s"}`);
        setTimeout(() => setSuccessMsg(null), 3000);
      }
      if (result.failed.length > 0) {
        setError(`Failed to copy ${result.failed.length} field${result.failed.length === 1 ? "" : "s"}`);
      }
    } catch {
      setError("Batch copy failed");
    } finally {
      setBatchCopying(false);
      setShowBatchPreview(false);
    }
  }, [guest, batchCopying]);

  const batchPreview = guest ? getBatchCopyPreview(guest) : null;
  const filledCount = guests.filter((g) => g.fillStatus === "FILLED" || g.fillStatus === "SKIPPED").length;
  const pendingCount = guests.length - filledCount;

  return {
    guest,
    guests,
    currentFieldIndex,
    fields,
    currentField,
    currentGuestIndex,
    summary,
    currentFieldQuickFixes,
    copiedFields,
    error,
    warning,
    successMsg,
    showAccuracyDetail,
    unsavedChanges,
    batchCopying,
    batchResult,
    showBatchPreview,
    batchPreview,
    filledCount,
    pendingCount,
    handleCopyField,
    handleApplyQuickFix,
    handleNextField,
    handlePrevField,
    handleNextGuest,
    handlePrevGuest,
    handleMarkFilled,
    handleMarkSkipped,
    handleBatchCopyHighConfidence,
    setShowAccuracyDetail,
    setShowBatchPreview,
    setError,
  };
}
