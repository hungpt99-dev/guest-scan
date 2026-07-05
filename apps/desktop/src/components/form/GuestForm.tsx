import { useState, useMemo, useId } from "react";
import type { GuestRow, OcrProcessingStatus, OcrWarningCode } from "@guestfill/shared";
import { GUEST_FIELDS } from "../../features/fill/fillConstants";
import { validateGuestField } from "../../features/fill/validation";
import Card from "../common/Card";
import Button from "../common/Button";
import type { FillFieldMeta } from "../../features/fill/fillTypes";

const WARNING_LABELS: Record<OcrWarningCode, string> = {
  IMAGE_BLURRY: "Image is blurry — extracted text may be inaccurate.",
  IMAGE_GLARE: "Image has glare — some fields may be unreadable.",
  LOW_RESOLUTION: "Image resolution is low — text recognition quality is reduced.",
  DOCUMENT_NOT_FULLY_VISIBLE: "Document is not fully visible in the image.",
  MRZ_NOT_FOUND: "MRZ zone not found — could not parse machine-readable data.",
  MRZ_CUT_OFF: "MRZ zone is cut off in the image.",
  MRZ_REPAIRED: "MRZ data was repaired due to errors.",
  MRZ_CHECK_DIGIT_FAILED: "MRZ check digit validation failed — data may be incorrect.",
  DOCUMENT_EXPIRED: "Document has expired.",
  DOCUMENT_EXPIRING_SOON: "Document is expiring within 3 months.",
  DOCUMENT_TYPE_UNSUPPORTED: "Document type is not fully supported.",
  LOW_CONFIDENCE_FIELD: "Some extracted fields have low confidence — review required.",
  MISSING_REQUIRED_FIELD: "Some required fields could not be extracted.",
  FIELD_CONFLICT: "Extracted data has conflicting values between sources.",
  HUMAN_REVIEW_REQUIRED: "Human review is recommended for this document.",
};

const STATUS_LABELS: Record<OcrProcessingStatus, string> = {
  IDLE: "Ready",
  UPLOADING: "Uploading image...",
  PROCESSING: "Extracting document information...",
  COMPLETED: "Extraction completed",
  FAILED: "Extraction failed",
};

function confidenceLevel(score: number): { level: "HIGH" | "MEDIUM" | "LOW"; color: string; badge: string } {
  if (score >= 0.8)
    return { level: "HIGH", color: "border-green-300 bg-green-50", badge: "bg-green-100 text-green-800" };
  if (score >= 0.5)
    return { level: "MEDIUM", color: "border-yellow-300 bg-yellow-50", badge: "bg-yellow-100 text-yellow-800" };
  return { level: "LOW", color: "border-red-300 bg-red-50", badge: "bg-red-100 text-red-800" };
}

function isOcrWarningSevere(code: OcrWarningCode): boolean {
  return code === "DOCUMENT_EXPIRED" || code === "MISSING_REQUIRED_FIELD" || code === "HUMAN_REVIEW_REQUIRED";
}

type GuestFormProps = {
  initialValues: Partial<GuestRow>;
  fieldConfidence?: Record<string, number>;
  lowConfidenceFields?: string[];
  warnings: OcrWarningCode[];
  ocrStatus: OcrProcessingStatus;
  errorMessage?: string;
  disabled?: boolean;
  onFieldChange: (field: string, value: string) => void;
  onRetry: () => void;
  onClear: () => void;
  onSubmit: () => void;
};

export default function GuestForm({
  initialValues,
  fieldConfidence = {},
  lowConfidenceFields = [],
  warnings,
  ocrStatus,
  errorMessage,
  disabled = false,
  onFieldChange,
  onRetry,
  onClear,
  onSubmit,
}: GuestFormProps) {
  const formId = useId();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of GUEST_FIELDS) {
      initial[field.key] = (initialValues[field.key as keyof GuestRow] as string) ?? "";
    }
    return initial;
  });
  const [changedFields, setChangedFields] = useState<Set<string>>(new Set());
  const [showAllFields, setShowAllFields] = useState(false);
  const isProcessing = ocrStatus === "UPLOADING" || ocrStatus === "PROCESSING";
  const isCompleted = ocrStatus === "COMPLETED";
  const isFailed = ocrStatus === "FAILED";
  const hasData = Object.values(values).some((v) => v.length > 0);
  const expiredWarning = warnings.includes("DOCUMENT_EXPIRED");
  const severeWarnings = warnings.filter((w) => isOcrWarningSevere(w));

  const populatedFields = useMemo(() => {
    const populated = GUEST_FIELDS.filter((f) => {
      const v = values[f.key];
      return !!v && v.length > 0;
    });
    const empty = GUEST_FIELDS.filter((f) => {
      const v = values[f.key];
      return !v || v.length === 0;
    });
    return { populated, empty };
  }, [values]);

  const fieldsToShow = showAllFields
    ? GUEST_FIELDS
    : [...populatedFields.populated, ...populatedFields.empty.slice(0, 3)];

  const handleFieldChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setChangedFields((prev) => new Set(prev).add(key));
    onFieldChange(key, value);
  };

  const handleClearAll = () => {
    const empty: Record<string, string> = {};
    for (const field of GUEST_FIELDS) {
      empty[field.key] = "";
    }
    setValues(empty);
    setChangedFields(new Set());
    onClear();
  };

  const handleFieldFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  return (
    <div className="space-y-4" data-testid="guest-form">
      <Card title="Guest Information" className="border-2 border-blue-200">
        {isProcessing && (
          <div className="mb-4 flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 p-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span className="text-sm text-blue-700">{STATUS_LABELS[ocrStatus]}</span>
          </div>
        )}

        {isCompleted && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3">
            <svg
              className="h-5 w-5 flex-shrink-0 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="text-sm text-green-700">Data extracted — please review all fields before submitting.</span>
          </div>
        )}

        {isCompleted && expiredWarning && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 flex-shrink-0 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              <span className="text-sm font-medium text-red-700">This document has expired.</span>
            </div>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {warnings.map((code) => {
              const severe = isOcrWarningSevere(code);
              const label = WARNING_LABELS[code];
              if (!label) return null;
              return (
                <div
                  key={code}
                  className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${
                    severe ? "border-red-200 bg-red-50 text-red-700" : "border-yellow-200 bg-yellow-50 text-yellow-700"
                  }`}
                  data-testid={`warning-${code.toLowerCase()}`}
                >
                  <svg
                    className={`mt-0.5 h-4 w-4 flex-shrink-0 ${severe ? "text-red-500" : "text-yellow-500"}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        )}

        {isFailed && errorMessage && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 flex-shrink-0 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-sm text-red-700">{errorMessage}</span>
            </div>
          </div>
        )}

        <div className="space-y-3" data-testid="guest-form-fields">
          {fieldsToShow.map((field: FillFieldMeta) => {
            const value = values[field.key] ?? "";
            const confidence = fieldConfidence[field.key] ?? 1;
            const isLow = lowConfidenceFields.includes(field.key);
            const hasChanged = changedFields.has(field.key);
            const conf = confidenceLevel(confidence);
            const validationErrors = validateGuestField(field.key, value, values);

            let borderClass = "border-gray-200";
            if (validationErrors.length > 0) {
              borderClass = "border-red-300 bg-red-50";
            } else if (isLow) {
              borderClass = conf.color;
            } else if (hasChanged) {
              borderClass = "border-blue-300 bg-blue-50";
            }

            let inputBorderClass = "border-gray-300 bg-gray-50";
            if (validationErrors.length > 0) {
              inputBorderClass = "border-red-400 bg-white";
            } else if (isLow) {
              inputBorderClass = "border-yellow-400 bg-white";
            } else if (hasChanged) {
              inputBorderClass = "border-blue-400 bg-white";
            }

            return (
              <div
                key={field.key}
                className={`rounded-md border p-3 ${borderClass}`}
                data-testid={`field-${field.key}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor={`${formId}-${field.key}`}
                    className="flex items-center gap-2 text-sm font-medium text-gray-700"
                  >
                    {field.label}
                    {validationErrors.length > 0 && (
                      <span
                        className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
                        data-testid={`${field.key}-validation-error`}
                      >
                        INVALID
                      </span>
                    )}
                    {validationErrors.length === 0 && isLow && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${conf.badge}`}
                        data-testid={`${field.key}-confidence-badge`}
                      >
                        LOW CONFIDENCE
                      </span>
                    )}
                    {hasChanged && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        EDITED
                      </span>
                    )}
                  </label>
                  {fieldConfidence[field.key] !== undefined && (
                    <span className="text-xs text-gray-400 font-mono">{Math.round(confidence * 100)}%</span>
                  )}
                </div>
                <input
                  id={`${formId}-${field.key}`}
                  type={field.type ?? "text"}
                  value={value}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  onFocus={handleFieldFocus}
                  placeholder={field.placeholder}
                  disabled={disabled || isProcessing}
                  data-testid={`${field.key}-input`}
                  className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${inputBorderClass}`}
                />
                {validationErrors.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {validationErrors.map((msg, i) => (
                      <p key={i} className="text-xs text-red-600" data-testid={`${field.key}-error-${i}`}>
                        {msg}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!showAllFields && populatedFields.empty.length > 3 && (
          <div className="mt-3 text-center">
            <button
              onClick={() => setShowAllFields(true)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
              data-testid="show-all-fields-button"
            >
              + Show all {GUEST_FIELDS.length} fields
            </button>
          </div>
        )}

        {showAllFields && GUEST_FIELDS.length > fieldsToShow.length && (
          <div className="mt-3 text-center">
            <button
              onClick={() => setShowAllFields(false)}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Show only filled fields
            </button>
          </div>
        )}
      </Card>

      {severeWarnings.length > 0 && (
        <Card className="border-2 border-red-200">
          <div className="space-y-2">
            <p className="text-sm font-medium text-red-700">Important warnings</p>
            {severeWarnings.map((code) => {
              const label = WARNING_LABELS[code];
              if (!label) return null;
              return (
                <p key={code} className="text-sm text-red-600">
                  • {label}
                </p>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onSubmit}
            disabled={disabled || isProcessing || (!isCompleted && !hasData)}
            data-testid="submit-button"
          >
            {isCompleted ? "Confirm & Use Data" : "Submit"}
          </Button>
          <Button variant="secondary" onClick={onRetry} disabled={disabled || isProcessing} data-testid="retry-button">
            {isProcessing ? "Processing..." : "Retry OCR"}
          </Button>
          <Button
            variant="ghost"
            onClick={handleClearAll}
            disabled={disabled || (!hasData && !isCompleted)}
            data-testid="clear-button"
          >
            Clear All
          </Button>
        </div>
        {hasData && (
          <p className="mt-3 text-xs text-gray-400">
            Fields marked with EDITED have been manually changed. Fields with low confidence are highlighted in yellow.
          </p>
        )}
      </Card>
    </div>
  );
}
