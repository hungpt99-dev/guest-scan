import { useState, useMemo } from "react";
import Card from "./common/Card";
import Button from "./common/Button";
import type { NormalizedFields } from "../services/field_normalization_service";
import type { FieldConfidenceScores } from "../services/ocr_confidence_service";
import { validateField, type FieldValidationResult } from "../ocr/field_validator";
import {
  AUTOFILL_FIELD_META,
  confidenceBorder,
  confidenceBadge,
  severityBorder,
  severityBadge,
  mergeFieldsWithEdits,
  countFieldsNeedingReview,
  getFieldConfidence,
} from "../ocr/autofill";

type Props = {
  documentImage?: string;
  fields: NormalizedFields;
  confidence: FieldConfidenceScores;
  lowConfidenceFields: string[];
  onConfirm: (fields: NormalizedFields) => void;
  onCancel: () => void;
};

const FIELD_META = AUTOFILL_FIELD_META;

type FieldKey = keyof typeof FIELD_META;

export default function ReviewScreen({
  documentImage,
  fields,
  confidence,
  lowConfidenceFields,
  onConfirm,
  onCancel,
}: Props) {
  const [edits, setEdits] = useState<Partial<Record<FieldKey, string>>>({});

  const handleChange = (key: FieldKey, value: string) => {
    setEdits((prev) => {
      const originalValue = fields[key as keyof NormalizedFields] as string;
      if (value === originalValue) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  const getCurrentValue = (key: FieldKey): string => {
    if (key in edits && edits[key] !== undefined) {
      return edits[key]!;
    }
    return (fields[key as keyof NormalizedFields] as string) || "";
  };

  const validationResults = useMemo(() => {
    const results: Record<string, FieldValidationResult> = {};
    for (const key of Object.keys(FIELD_META) as FieldKey[]) {
      const value = getCurrentValue(key);
      const fieldConf = confidence[key as keyof FieldConfidenceScores];
      const baseConfidence = fieldConf?.score ?? 0.5;
      results[key] = validateField(key, value, value, baseConfidence, {
        corrected: key in edits,
      });
    }
    return results;
  }, [edits, fields, confidence]);

  const needsReviewCount = useMemo(() => {
    const needsReviewMap: Record<string, boolean> = {};
    for (const key of Object.keys(FIELD_META) as FieldKey[]) {
      const vr = validationResults[key]!;
      needsReviewMap[key] = vr.needsReview;
    }
    return countFieldsNeedingReview(Object.keys(FIELD_META) as FieldKey[], needsReviewMap, lowConfidenceFields);
  }, [validationResults, lowConfidenceFields]);

  const hasEdits = Object.keys(edits).length > 0;

  const mergedFields = useMemo((): NormalizedFields => {
    return mergeFieldsWithEdits(fields, edits);
  }, [fields, edits, hasEdits]);

  return (
    <div className="space-y-6">
      {documentImage && (
        <Card title="Document Image" className="border-2 border-gray-200">
          <div className="flex justify-center">
            <img
              src={documentImage}
              alt="Cropped document"
              className="max-h-64 rounded object-contain shadow"
              data-testid="document-image"
            />
          </div>
        </Card>
      )}

      <Card
        title="Review Extracted Fields"
        className={needsReviewCount > 0 ? "border-2 border-yellow-300" : "border-2 border-green-200"}
      >
        {needsReviewCount > 0 && (
          <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3" data-testid="review-warning">
            <div className="flex items-center gap-2 text-yellow-800">
              <svg
                className="h-5 w-5 flex-shrink-0"
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
              <span className="text-sm font-medium" data-testid="needs-review-count">
                {needsReviewCount} field{needsReviewCount !== 1 ? "s" : ""} need review before autofill
              </span>
            </div>
          </div>
        )}

        {needsReviewCount === 0 && (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-2 text-green-800">
              <svg
                className="h-5 w-5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm font-medium">All fields look good. Ready to autofill.</span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {(Object.keys(FIELD_META) as FieldKey[]).map((key) => {
            const meta = FIELD_META[key];
            const fieldConf = getFieldConfidence(key, confidence);
            const isLow = lowConfidenceFields.includes(key);
            const vr = validationResults[key]!;
            const currentValue = getCurrentValue(key);
            const originalValue = (fields[key as keyof NormalizedFields] as string) || "";
            const hasEdit = key in edits && edits[key] !== undefined;
            const hasErrors = vr.issues.some((i) => i.severity === "error");

            let borderClass = "border-gray-200";
            if (hasErrors) {
              borderClass = severityBorder("error");
            } else if (hasEdit) {
              borderClass = "border-blue-300 bg-blue-50";
            } else if (isLow) {
              borderClass = confidenceBorder(fieldConf?.level ?? "MEDIUM");
            }

            return (
              <div key={key} className={`rounded-md border p-3 ${borderClass}`} data-testid={`field-${key}`}>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={`review-field-${key}`}
                    className="flex items-center gap-2 text-sm font-medium text-gray-700"
                  >
                    {meta.label}
                    {hasErrors && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityBadge("error")}`}
                        data-testid={`${key}-validation-error`}
                      >
                        INVALID
                      </span>
                    )}
                    {!hasErrors && isLow && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${confidenceBadge(fieldConf?.level ?? "MEDIUM")}`}
                        data-testid={`${key}-confidence-badge`}
                      >
                        LOW CONFIDENCE
                      </span>
                    )}
                  </label>
                  {fieldConf && (
                    <span className="text-xs text-gray-500">
                      {Math.round(fieldConf.score * 100)}% &mdash; {fieldConf.level}
                    </span>
                  )}
                </div>

                <input
                  id={`review-field-${key}`}
                  type={meta.type}
                  value={currentValue}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={meta.placeholder}
                  data-testid={`${key}-input`}
                  className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    hasErrors
                      ? "border-red-400 bg-white"
                      : hasEdit
                        ? "border-blue-400 bg-white"
                        : isLow
                          ? "border-yellow-400 bg-white"
                          : "border-gray-300 bg-gray-50"
                  }`}
                />

                {hasEdit && <p className="mt-1 text-xs text-blue-600">Original: {originalValue || "(empty)"}</p>}

                {vr.issues.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {vr.issues.map((issue, i) => (
                      <p
                        key={i}
                        className={`text-xs ${issue.severity === "error" ? "text-red-600" : "text-yellow-700"}`}
                        data-testid={`${key}-issue-${i}`}
                      >
                        {issue.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => onConfirm(mergedFields)} data-testid="confirm-button">
          Confirm & Autofill
        </Button>
        <Button variant="secondary" onClick={() => onConfirm(mergedFields)}>
          Skip Review
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
