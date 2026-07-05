import { useId } from "react";
import type { ConfidenceLevel } from "@guestfill/shared";
import { confidenceBorder, confidenceBadge } from "./ConfidenceBadge";

export interface FieldMeta {
  label: string;
  type: string;
  placeholder: string;
}

interface FieldEditorProps {
  fieldKey: string;
  meta: FieldMeta;
  value: string;
  originalValue?: string;
  confidence?: { level: ConfidenceLevel; score: number };
  isLowConfidence?: boolean;
  hasError?: boolean;
  errorMessages?: string[];
  hasEdit?: boolean;
  disabled?: boolean;
  onChange: (key: string, value: string) => void;
}

export function FieldEditor({
  fieldKey,
  meta,
  value,
  originalValue,
  confidence,
  isLowConfidence = false,
  hasError = false,
  errorMessages = [],
  hasEdit = false,
  disabled = false,
  onChange,
}: FieldEditorProps) {
  const formId = useId();

  let borderClass = "border-gray-200";
  if (hasError) {
    borderClass = "border-red-300 bg-red-50";
  } else if (hasEdit) {
    borderClass = "border-blue-300 bg-blue-50";
  } else if (isLowConfidence && confidence) {
    borderClass = confidenceBorder(confidence.level);
  }

  let inputBorderClass = "border-gray-300 bg-gray-50";
  if (hasError) {
    inputBorderClass = "border-red-400 bg-white";
  } else if (hasEdit) {
    inputBorderClass = "border-blue-400 bg-white";
  } else if (isLowConfidence) {
    inputBorderClass = "border-yellow-400 bg-white";
  }

  return (
    <div className={`rounded-md border p-3 ${borderClass}`} data-testid={`field-${fieldKey}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={`${formId}-${fieldKey}`} className="flex items-center gap-2 text-sm font-medium text-gray-700">
          {meta.label}
          {hasError && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800"
              data-testid={`${fieldKey}-validation-error`}
            >
              INVALID
            </span>
          )}
          {!hasError && isLowConfidence && confidence && (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${confidenceBadge(confidence.level)}`}
              data-testid={`${fieldKey}-confidence-badge`}
            >
              LOW CONFIDENCE
            </span>
          )}
          {hasEdit && (
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              EDITED
            </span>
          )}
        </label>
        {confidence && <span className="text-xs text-gray-500 font-mono">{Math.round(confidence.score * 100)}%</span>}
      </div>

      <input
        id={`${formId}-${fieldKey}`}
        type={meta.type}
        value={value}
        onChange={(e) => onChange(fieldKey, e.target.value)}
        onFocus={(e) => e.target.select()}
        placeholder={meta.placeholder}
        disabled={disabled}
        data-testid={`${fieldKey}-input`}
        className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${inputBorderClass}`}
      />

      {hasEdit && originalValue !== undefined && (
        <p className="mt-1 text-xs text-blue-600">Original: {originalValue || "(empty)"}</p>
      )}

      {errorMessages.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {errorMessages.map((msg, i) => (
            <p key={i} className="text-xs text-red-600" data-testid={`${fieldKey}-issue-${i}`}>
              {msg}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
