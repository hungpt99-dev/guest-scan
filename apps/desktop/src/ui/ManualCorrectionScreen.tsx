import { useState } from "react";
import Card from "../components/common/Card";
import Button from "../components/common/Button";
import type { NormalizedFields } from "../services/field_normalization_service";
import type { FieldConfidenceScores } from "../services/ocr_confidence_service";
import type { EditableFields } from "../services/staff_review_service";

type Props = {
  fields: NormalizedFields;
  confidence: FieldConfidenceScores;
  lowConfidenceFields: string[];
  onSave: (edits: Partial<EditableFields>) => void;
  onCancel: () => void;
};

const FIELD_META: Record<keyof EditableFields, { label: string; type: string; placeholder: string }> = {
  fullName: { label: "Full Name", type: "text", placeholder: "e.g. SMITH JOHN" },
  firstName: { label: "First Name", type: "text", placeholder: "e.g. JOHN" },
  lastName: { label: "Last Name", type: "text", placeholder: "e.g. SMITH" },
  gender: { label: "Gender", type: "text", placeholder: "M / F / UNKNOWN" },
  dateOfBirth: { label: "Date of Birth", type: "text", placeholder: "YYYY-MM-DD" },
  nationality: { label: "Nationality", type: "text", placeholder: "e.g. GBR" },
  countryCode: { label: "Country Code", type: "text", placeholder: "e.g. GBR" },
  documentType: { label: "Document Type", type: "text", placeholder: "PASSPORT / ID_CARD" },
  documentNumber: { label: "Document Number", type: "text", placeholder: "e.g. AB1234567" },
  passportNumber: { label: "Passport Number", type: "text", placeholder: "e.g. AB1234567" },
  idNumber: { label: "ID Number", type: "text", placeholder: "e.g. 123456789" },
  issueDate: { label: "Issue Date", type: "text", placeholder: "YYYY-MM-DD" },
  expiryDate: { label: "Expiry Date", type: "text", placeholder: "YYYY-MM-DD" },
  issuingCountry: { label: "Issuing Country", type: "text", placeholder: "e.g. GBR" },
};

export default function ManualCorrectionScreen({ fields, confidence, lowConfidenceFields, onSave, onCancel }: Props) {
  const [edits, setEdits] = useState<Partial<EditableFields>>({});

  const handleChange = (key: keyof EditableFields, value: string) => {
    setEdits((prev) => ({
      ...prev,
      [key]: value === (fields as unknown as EditableFields)[key] ? undefined : value,
    }));
  };

  const getCurrentValue = (key: keyof EditableFields): string => {
    if (key in edits && edits[key] !== undefined) {
      return edits[key]!;
    }
    return (fields as unknown as EditableFields)[key] || "";
  };

  const hasChanges = Object.keys(edits).length > 0;

  return (
    <div className="space-y-6">
      <Card title="Manual Correction — Edit Extracted Fields">
        {lowConfidenceFields.length > 0 && (
          <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3">
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
              <span className="text-sm font-medium">
                {lowConfidenceFields.length} field{lowConfidenceFields.length !== 1 ? "s" : ""} need attention
              </span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {(Object.keys(FIELD_META) as (keyof EditableFields)[]).map((key) => {
            const meta = FIELD_META[key];
            const isLow = lowConfidenceFields.includes(key);
            const currentValue = getCurrentValue(key);
            const originalValue = (fields as unknown as EditableFields)[key] || "";
            const hasEdit = key in edits && edits[key] !== undefined;
            const fieldConfidence = confidence[key as keyof FieldConfidenceScores];

            return (
              <div
                key={key}
                className={`rounded-md border p-3 ${
                  isLow ? "border-yellow-300 bg-yellow-50" : hasEdit ? "border-blue-300 bg-blue-50" : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <label htmlFor={`field-${key}`} className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    {meta.label}
                    {isLow && (
                      <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                        LOW CONFIDENCE
                      </span>
                    )}
                  </label>
                  {fieldConfidence && (
                    <span className="text-xs text-gray-500">
                      {Math.round(fieldConfidence.score * 100)}% — {fieldConfidence.level}
                    </span>
                  )}
                </div>

                <input
                  id={`field-${key}`}
                  type={meta.type}
                  value={currentValue}
                  onChange={(e) => handleChange(key, e.target.value)}
                  placeholder={meta.placeholder}
                  className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    hasEdit
                      ? "border-blue-400 bg-white"
                      : isLow
                        ? "border-yellow-400 bg-white"
                        : "border-gray-300 bg-gray-50"
                  }`}
                />

                {hasEdit && <p className="mt-1 text-xs text-blue-600">Original: {originalValue || "(empty)"}</p>}

                {fieldConfidence?.issues && fieldConfidence.issues.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {fieldConfidence.issues.map((issue, i) => (
                      <p key={i} className="text-xs text-red-600">
                        {issue}
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
        <Button onClick={() => onSave(edits)} disabled={!hasChanges}>
          Save Changes
        </Button>
        <Button variant="secondary" onClick={() => onSave({})}>
          Keep Original Values
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
