import { useState } from "react";
import Card from "../../components/common/Card";
import Button from "../../components/common/Button";
import type { NormalizedFields } from "../../services/field_normalization_service";
import type { FieldConfidenceScores } from "../../services/ocr_confidence_service";
import type { EditableFields } from "../../services/staff_review_service";
import { FieldEditor } from "../../components/ocr/FieldEditor";

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

  const handleChange = (key: string, value: string) => {
    const k = key as keyof EditableFields;
    setEdits((prev) => ({
      ...prev,
      [k]: value === (fields as unknown as EditableFields)[k] ? undefined : value,
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
              <FieldEditor
                key={key}
                fieldKey={key}
                meta={meta}
                value={currentValue}
                originalValue={originalValue}
                confidence={
                  fieldConfidence ? { level: fieldConfidence.level, score: fieldConfidence.score } : undefined
                }
                isLowConfidence={isLow}
                hasEdit={hasEdit}
                onChange={handleChange}
              />
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
