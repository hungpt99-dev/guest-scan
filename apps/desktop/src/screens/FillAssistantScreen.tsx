import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "../app/routes";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import EmptyState from "../components/common/EmptyState";
import ErrorMessage from "../components/common/ErrorMessage";
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
  type BatchCopyResult,
} from "../features/fill/copyAssistant";
import type { QuickFix } from "../features/fill/safetyEngine";
import { DEFAULT_FIELD_ORDER, DEFAULT_KEYBOARD_SHORTCUTS } from "../features/fill/fillConstants";
import type { GuestRow, FillEvent, ConfidenceLevel } from "@guestfill/shared";

type FieldItem = {
  key: string;
  label: string;
  value: string;
  accuracyLevel: ConfidenceLevel;
  accuracyScore: number;
  ocrConfidence?: number;
};

function accuracyBorderColor(score: number): string {
  if (score >= 0.9) return "border-green-400 bg-green-50";
  if (score >= 0.7) return "border-yellow-400 bg-yellow-50";
  return "border-red-400 bg-red-50";
}

function accuracyBadge(level: ConfidenceLevel, score: number): { color: string; label: string } {
  if (level === "HIGH") return { color: "bg-green-100 text-green-800", label: `${(score * 100).toFixed(0)}%` };
  if (level === "MEDIUM") return { color: "bg-yellow-100 text-yellow-800", label: `${(score * 100).toFixed(0)}%` };
  return { color: "bg-red-100 text-red-800", label: `${(score * 100).toFixed(0)}%` };
}

function accuracyBar(score: number): string {
  const filled = Math.round(score * 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

export default function FillAssistantScreen() {
  const navigate = useNavigate();
  const [guest, setGuest] = useState<GuestRow | null>(getCurrentGuest());
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [copiedFields, setCopiedFields] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showAccuracyDetail, setShowAccuracyDetail] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [batchCopying, setBatchCopying] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchCopyResult | null>(null);
  const [showBatchPreview, setShowBatchPreview] = useState(false);

  useEffect(() => {
    if (!guest) {
      getAllGuestRows().then((rows) => {
        setGuests(rows);
        if (rows.length > 0 && !guest) {
          const first = rows[0];
          if (first) {
            setGuest(first);
            setCurrentGuest(first);
          }
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

  const handleCopyField = async (fieldKey: string) => {
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
      setError(`${result.transformError}`);
    } else {
      setError("Failed to copy to clipboard.");
    }
  };

  const handleApplyQuickFix = (fieldKey: string, value?: string) => {
    if (!guest || !value) return;
    setGuest({ ...guest, [fieldKey]: value });
    setUnsavedChanges(true);
    setSuccessMsg(`Applied fix: ${fieldKey} → ${value}`);
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  const handleNextField = () => {
    setCurrentFieldIndex((prev) => navigateField(prev, fields.length, "next"));
  };

  const handlePrevField = () => {
    setCurrentFieldIndex((prev) => navigateField(prev, fields.length, "prev"));
  };

  const handleNextGuest = () => {
    const newIdx = navigateGuest(currentGuestIndex, guests.length, "next");
    const newGuest = guests[newIdx];
    if (newGuest) {
      setGuest(newGuest);
      setCurrentGuest(newGuest);
      setCurrentFieldIndex(0);
      setCopiedFields({});
      setError(null);
      setWarning(null);
    }
  };

  const handlePrevGuest = () => {
    const newIdx = navigateGuest(currentGuestIndex, guests.length, "prev");
    const newGuest = guests[newIdx];
    if (newGuest) {
      setGuest(newGuest);
      setCurrentGuest(newGuest);
      setCurrentFieldIndex(0);
      setCopiedFields({});
      setError(null);
      setWarning(null);
    }
  };

  const handleMarkFilled = async () => {
    if (!guest) return;
    const updated: GuestRow = { ...guest, fillStatus: "FILLED", updatedAt: new Date().toISOString() };
    await saveGuestRow(updated);
    setGuest(updated);
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
  };

  const handleMarkSkipped = async () => {
    if (!guest) return;
    const updated: GuestRow = { ...guest, fillStatus: "SKIPPED", updatedAt: new Date().toISOString() };
    await saveGuestRow(updated);
    setGuest(updated);
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
  };

  const handleBatchCopyHighConfidence = async () => {
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
  };

  const batchPreview = guest ? getBatchCopyPreview(guest) : null;

  const filledCount = guests.filter((g) => g.fillStatus === "FILLED" || g.fillStatus === "SKIPPED").length;
  const pendingCount = guests.length - filledCount;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (isInput) return;

      const shortcutMap: Record<string, () => void> = {
        [`${DEFAULT_KEYBOARD_SHORTCUTS.copyCurrentField}`]: () => {
          if (currentField) handleCopyField(currentField.key);
        },
        [`${DEFAULT_KEYBOARD_SHORTCUTS.nextField}`]: handleNextField,
        [`${DEFAULT_KEYBOARD_SHORTCUTS.previousField}`]: handlePrevField,
        [`${DEFAULT_KEYBOARD_SHORTCUTS.nextGuest}`]: handleNextGuest,
        [`${DEFAULT_KEYBOARD_SHORTCUTS.previousGuest}`]: handlePrevGuest,
        [`${DEFAULT_KEYBOARD_SHORTCUTS.markFilled}`]: handleMarkFilled,
        [`${DEFAULT_KEYBOARD_SHORTCUTS.markSkipped}`]: handleMarkSkipped,
      };

      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const isAlt = e.altKey;

      for (const [shortcut, handler] of Object.entries(shortcutMap)) {
        const parts = shortcut.toLowerCase().split("+");
        const key = parts[parts.length - 1] ?? "";
        const needsCtrl = parts.includes("ctrl");
        const needsShift = parts.includes("shift");
        const needsAlt = parts.includes("alt");

        if (e.key.toLowerCase() === key && isCtrl === needsCtrl && isShift === needsShift && isAlt === needsAlt) {
          e.preventDefault();
          handler();
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentFieldIndex, fields, currentField, guest, guests, currentGuestIndex]);

  if (!guest) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Fill Assistant</h1>
        <Card>
          <EmptyState title="No guest selected" description="Select a guest from the Guest List first." />
          <div className="mt-4">
            <Button onClick={() => navigate(ROUTES.GUESTS)}>Go to Guest List</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Fill Assistant</h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Button variant="ghost" onClick={handlePrevGuest} disabled={currentGuestIndex <= 0}>
            ← Prev
          </Button>
          <span>
            Guest {currentGuestIndex + 1} of {guests.length}
          </span>
          <Button variant="ghost" onClick={handleNextGuest} disabled={currentGuestIndex >= guests.length - 1}>
            Next →
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        {summary && (
          <Card className="flex-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-700">Accuracy:</span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    summary.overallLevel === "HIGH"
                      ? "bg-green-100 text-green-800"
                      : summary.overallLevel === "MEDIUM"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {summary.overallLevel} ({(summary.overallScore * 100).toFixed(0)}%)
                </span>
                <span
                  className="text-xs text-gray-500"
                  title={`${summary.highConfidence} high · ${summary.mediumConfidence} medium · ${summary.lowConfidence} low`}
                >
                  {summary.highConfidence} high · {summary.mediumConfidence} medium · {summary.lowConfidence} low
                </span>
                <div className="flex gap-0.5" title={`Overall: ${(summary.overallScore * 100).toFixed(0)}%`}>
                  <div className="h-1.5 w-12 rounded-full overflow-hidden bg-gray-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        summary.overallLevel === "HIGH"
                          ? "bg-green-400"
                          : summary.overallLevel === "MEDIUM"
                            ? "bg-yellow-400"
                            : "bg-red-400"
                      }`}
                      style={{ width: `${summary.overallScore * 100}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(summary.warnings.length > 0 || summary.recommendations.length > 0) && (
                  <button
                    className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                    onClick={() => setShowAccuracyDetail(!showAccuracyDetail)}
                  >
                    {showAccuracyDetail ? "Hide" : "Show"} Details
                  </button>
                )}
              </div>
            </div>

            {showAccuracyDetail && summary.warnings.length > 0 && (
              <div className="mt-3 space-y-1 border-t pt-3">
                <p className="text-xs font-medium text-red-600">Warnings:</p>
                {summary.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-red-500">
                    • {w}
                  </p>
                ))}
              </div>
            )}
            {showAccuracyDetail && summary.recommendations.length > 0 && (
              <div className="mt-2 space-y-1 border-t pt-2">
                <p className="text-xs font-medium text-amber-600">Recommendations:</p>
                {summary.recommendations.map((r, i) => (
                  <p key={i} className="text-xs text-amber-600">
                    • {r}
                  </p>
                ))}
              </div>
            )}
          </Card>
        )}

        <div className="flex-shrink-0">
          <Card>
            <div className="text-center">
              <p className="text-xs text-gray-500">Progress</p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 w-24 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-400 transition-all"
                    style={{ width: `${guests.length > 0 ? (filledCount / guests.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-700">
                  {filledCount}/{guests.length}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-gray-400">{pendingCount} pending</p>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card title="Guest Info">
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Name:</span> {guest.fullName}
              </p>
              <p>
                <span className="font-medium">Document:</span> {guest.passportNumber || guest.idNumber || "-"}
              </p>
              <p>
                <span className="font-medium">Type:</span> {guest.documentType}
              </p>
              <p>
                <span className="font-medium">Nationality:</span> {guest.nationality || "-"}
              </p>
              <p>
                <span className="font-medium">DOB:</span> {guest.dateOfBirth || "-"}
              </p>
              <p>
                <span className="font-medium">Gender:</span> {guest.gender}
              </p>
              <p>
                <span className="font-medium">Room:</span> {guest.roomNumber || "-"}
              </p>
              <p>
                <span className="font-medium">OCR Status:</span> {guest.status}
              </p>
              <p>
                <span className="font-medium">Fill Status:</span> {guest.fillStatus}
              </p>
              {guest.ocrWarning && (
                <p>
                  <span className="font-medium">Warning:</span>{" "}
                  <span className="text-yellow-700">{guest.ocrWarning}</span>
                </p>
              )}
            </div>
          </Card>

          <div className="mt-4">
            <Card title="Keyboard Shortcuts">
              <div className="space-y-1 text-xs text-gray-500">
                <p>
                  <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                    {DEFAULT_KEYBOARD_SHORTCUTS.copyCurrentField}
                  </kbd>{" "}
                  Copy field
                </p>
                <p>
                  <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                    {DEFAULT_KEYBOARD_SHORTCUTS.nextField}
                  </kbd>{" "}
                  Next field
                </p>
                <p>
                  <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                    {DEFAULT_KEYBOARD_SHORTCUTS.previousField}
                  </kbd>{" "}
                  Prev field
                </p>
                <p>
                  <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                    {DEFAULT_KEYBOARD_SHORTCUTS.nextGuest}
                  </kbd>{" "}
                  Next guest
                </p>
                <p>
                  <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                    {DEFAULT_KEYBOARD_SHORTCUTS.markFilled}
                  </kbd>{" "}
                  Mark filled
                </p>
                <p>
                  <kbd className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                    {DEFAULT_KEYBOARD_SHORTCUTS.markSkipped}
                  </kbd>{" "}
                  Mark skipped
                </p>
              </div>
            </Card>
          </div>
        </div>

        <div className="lg:col-span-2">
          <Card title="Fields">
            {error && <ErrorMessage message={error} onRetry={() => setError(null)} />}
            {warning && (
              <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                {warning}
                <button
                  className="ml-2 underline hover:text-amber-900"
                  onClick={async () => {
                    if (!currentField || !guest) return;
                    setWarning(null);
                    const result = await copyFieldWithAccuracyCheck(guest, currentField.key);
                    if (result.copied) {
                      setCopiedFields((prev) => ({ ...prev, [currentField.key]: true }));
                      setSuccessMsg(`Copied: ${currentField.key}`);
                      setTimeout(() => setSuccessMsg(null), 2000);
                    }
                  }}
                >
                  Copy anyway
                </button>
              </div>
            )}
            {successMsg && <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-800">{successMsg}</div>}

            <div className="mb-4 flex items-center justify-between">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handlePrevField} disabled={currentFieldIndex <= 0}>
                  ← Prev Field
                </Button>
                <Button variant="secondary" onClick={handleNextField} disabled={currentFieldIndex >= fields.length - 1}>
                  Next Field →
                </Button>
              </div>
              <span className="text-xs text-gray-400">
                <kbd className="rounded bg-gray-100 px-1 font-mono text-xs">
                  {DEFAULT_KEYBOARD_SHORTCUTS.copyCurrentField}
                </kbd>{" "}
                to copy
              </span>
            </div>

            {currentField && (
              <div
                className={`mb-4 rounded-lg border-2 p-4 transition-colors ${accuracyBorderColor(currentField.accuracyScore)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-700">{currentField.label}</p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${accuracyBadge(currentField.accuracyLevel, currentField.accuracyScore).color}`}
                        title={`Accuracy: ${(currentField.accuracyScore * 100).toFixed(0)}%${currentField.ocrConfidence !== undefined ? ` | OCR: ${(currentField.ocrConfidence * 100).toFixed(0)}%` : ""}`}
                      >
                        {accuracyBadge(currentField.accuracyLevel, currentField.accuracyScore).label}
                      </span>
                      {currentField.ocrConfidence !== undefined && (
                        <span
                          className="text-[10px] text-gray-400 font-mono"
                          title={`OCR confidence: ${(currentField.ocrConfidence * 100).toFixed(0)}%`}
                        >
                          OCR: {(currentField.ocrConfidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-lg font-bold text-gray-900">
                      {currentField.value || <span className="italic text-gray-400">Empty</span>}
                    </p>
                    {currentField.ocrConfidence !== undefined && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-400 font-mono">
                        <span
                          className={
                            currentField.ocrConfidence >= 0.9
                              ? "text-green-500"
                              : currentField.ocrConfidence >= 0.7
                                ? "text-yellow-500"
                                : "text-red-500"
                          }
                        >
                          {accuracyBar(currentField.ocrConfidence)}
                        </span>
                        <span>OCR</span>
                        <span className="mx-1">·</span>
                        <span
                          className={
                            currentField.accuracyScore >= 0.9
                              ? "text-green-500"
                              : currentField.accuracyScore >= 0.7
                                ? "text-yellow-500"
                                : "text-red-500"
                          }
                        >
                          {accuracyBar(currentField.accuracyScore)}
                        </span>
                        <span>Validation</span>
                      </div>
                    )}
                  </div>
                  <Button onClick={() => handleCopyField(currentField.key)} disabled={!currentField.value}>
                    Copy
                  </Button>
                </div>
                {currentFieldQuickFixes.length > 0 && currentField.accuracyScore < 0.9 && (
                  <div className="mt-3 border-t pt-2">
                    <p className="mb-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wide">Quick Fixes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {currentFieldQuickFixes.map((fix, fi) => (
                        <button
                          key={fi}
                          onClick={() => handleApplyQuickFix(currentField.key, fix.value)}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            fix.action === "replace"
                              ? "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                              : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200"
                          }`}
                          title={fix.description}
                        >
                          {fix.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {fields.map((field, idx) => {
                const badge = accuracyBadge(field.accuracyLevel, field.accuracyScore);
                const tooltipParts = [`Accuracy: ${(field.accuracyScore * 100).toFixed(0)}%`];
                if (field.ocrConfidence !== undefined) {
                  tooltipParts.push(`OCR: ${(field.ocrConfidence * 100).toFixed(0)}%`);
                }
                return (
                  <div
                    key={field.key}
                    className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                      idx === currentFieldIndex ? "ring-2 ring-blue-300" : "hover:bg-gray-50"
                    } ${copiedFields[field.key] ? "bg-green-50" : ""}`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span
                        className={`h-2 w-2 flex-shrink-0 rounded-full ${
                          field.accuracyLevel === "HIGH"
                            ? "bg-green-400"
                            : field.accuracyLevel === "MEDIUM"
                              ? "bg-yellow-400"
                              : "bg-red-400"
                        }`}
                      />
                      <span className="truncate font-medium text-gray-700">{field.label}:</span>{" "}
                      <span className="truncate text-gray-600">
                        {field.value || <span className="italic text-gray-400">Empty</span>}
                      </span>
                    </div>
                    <div className="ml-2 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.color}`}
                        title={tooltipParts.join(" | ")}
                      >
                        {badge.label}
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => handleCopyField(field.key)}
                        disabled={!field.value}
                        className="text-xs"
                      >
                        {copiedFields[field.key] ? "Copied" : "Copy"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {unsavedChanges && (
              <div className="mt-4 rounded-md bg-yellow-50 p-2 text-xs text-yellow-700">
                Quick-fix applied to local data — review changes before saving
              </div>
            )}

            <div className="mt-4 rounded-md bg-blue-50 px-3 py-2">
              {showBatchPreview && batchPreview ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-700">Batch Copy Preview</span>
                    <button
                      className="text-[10px] text-blue-500 underline hover:text-blue-700"
                      onClick={() => setShowBatchPreview(false)}
                    >
                      Cancel
                    </button>
                  </div>
                  {batchPreview.highConfidence.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-green-700">
                        High Confidence ({batchPreview.highConfidence.length})
                      </p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {batchPreview.highConfidence.map((f) => (
                          <span
                            key={f.key}
                            className="inline-block rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-800"
                          >
                            {f.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {batchPreview.mediumConfidence.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-yellow-700">
                        Medium Confidence ({batchPreview.mediumConfidence.length}) — Review First
                      </p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {batchPreview.mediumConfidence.map((f) => (
                          <span
                            key={f.key}
                            className="inline-block rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-800"
                          >
                            {f.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {batchPreview.lowConfidence.length > 0 && (
                    <div>
                      <p className="text-[10px] font-medium text-red-700">
                        Low Confidence ({batchPreview.lowConfidence.length}) — Verify Manually
                      </p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {batchPreview.lowConfidence.map((f) => (
                          <span
                            key={f.key}
                            className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-800"
                          >
                            {f.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    onClick={handleBatchCopyHighConfidence}
                    disabled={batchCopying || batchPreview.highConfidence.length === 0}
                  >
                    {batchCopying ? "Copying..." : `Copy All High Confidence (${batchPreview.highConfidence.length})`}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-blue-700">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Auto-fill assists you — data is never submitted automatically. You control every copy.
                  </span>
                  {batchPreview && batchPreview.highConfidence.length > 0 && (
                    <button
                      className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100 hover:text-blue-800"
                      onClick={() => setShowBatchPreview(true)}
                    >
                      Batch Copy ({batchPreview.highConfidence.length} high confidence)
                    </button>
                  )}
                </div>
              )}
              {batchResult && !showBatchPreview && (
                <div className="mt-1 text-[10px] text-gray-500">
                  Last batch: {batchResult.successCount} copied, {batchResult.failed.length} failed,{" "}
                  {batchResult.skipped.length} skipped
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-4 border-t pt-4">
              <Button onClick={handleMarkFilled}>Mark Filled</Button>
              <Button variant="secondary" onClick={handleMarkSkipped}>
                Mark Skipped
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
