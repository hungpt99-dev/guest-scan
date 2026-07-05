import Card from "../../components/common/Card";
import Button from "../../components/common/Button";
import type { NormalizedFields } from "../../services/field_normalization_service";
import type { FieldConfidenceScores } from "../../services/ocr_confidence_service";
import type { ConfidenceLevel } from "@guestfill/shared";

type Props = {
  fields: NormalizedFields;
  confidence: FieldConfidenceScores;
  lowConfidenceFields: string[];
  onEdit: () => void;
  onContinue: () => void;
  onCancel: () => void;
};

const FIELD_LABELS: Record<string, string> = {
  fullName: "Full Name",
  firstName: "First Name",
  lastName: "Last Name",
  gender: "Gender",
  dateOfBirth: "Date of Birth",
  nationality: "Nationality",
  countryCode: "Country Code",
  documentType: "Document Type",
  documentNumber: "Document Number",
  passportNumber: "Passport Number",
  idNumber: "ID Number",
  issueDate: "Issue Date",
  expiryDate: "Expiry Date",
  issuingCountry: "Issuing Country",
};

function confidenceBorder(level: ConfidenceLevel): string {
  switch (level) {
    case "HIGH":
      return "border-green-300 bg-green-50";
    case "MEDIUM":
      return "border-yellow-300 bg-yellow-50";
    case "LOW":
      return "border-red-300 bg-red-50";
  }
}

function confidenceBadge(level: ConfidenceLevel): string {
  switch (level) {
    case "HIGH":
      return "bg-green-100 text-green-800";
    case "MEDIUM":
      return "bg-yellow-100 text-yellow-800";
    case "LOW":
      return "bg-red-100 text-red-800";
  }
}

export default function ExtractedResultReviewScreen({
  fields,
  confidence,
  lowConfidenceFields,
  onEdit,
  onContinue,
  onCancel,
}: Props) {
  const displayFields = Object.entries(FIELD_LABELS).filter(([key]) => key in fields);

  return (
    <div className="space-y-6">
      <Card title="Extracted Fields — Review Required" className="border-2 border-blue-200">
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
                {lowConfidenceFields.length} field{lowConfidenceFields.length !== 1 ? "s" : ""} need review
              </span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {displayFields.map(([key, label]) => {
            const value = fields[key as keyof NormalizedFields] as string;
            const score = confidence[key as keyof FieldConfidenceScores];
            if (!score) return null;

            const isLow = lowConfidenceFields.includes(key);

            return (
              <div
                key={key}
                className={`rounded-md border p-3 ${isLow ? confidenceBorder(score.level) : "border-gray-200"}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                      {isLow && (
                        <svg
                          className="h-4 w-4 text-yellow-500"
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
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-900">
                      {value || <span className="italic text-gray-400">(empty)</span>}
                    </p>
                  </div>
                  <div className="ml-4 flex flex-col items-end gap-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${confidenceBadge(score.level)}`}
                    >
                      {score.level}
                    </span>
                    <span className="text-xs text-gray-500">{Math.round(score.score * 100)}%</span>
                  </div>
                </div>
                {score.issues.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {score.issues.map((issue, i) => (
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
        <Button variant="secondary" onClick={onEdit}>
          Edit Fields
        </Button>
        <Button onClick={onContinue}>Continue</Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
