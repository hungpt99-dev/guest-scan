import Card from "../components/common/Card";
import Button from "../components/common/Button";
import type { ConfirmedFields } from "../services/staff_review_service";

type Props = {
  confirmed: ConfirmedFields;
  isSaving: boolean;
  saveError?: string | null;
  onConfirm: () => void;
  onGoBack: () => void;
  onCancel: () => void;
};

const SUMMARY_LABELS: Record<string, string> = {
  fullName: "Full Name",
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

export default function FinalConfirmationScreen({
  confirmed,
  isSaving,
  saveError,
  onConfirm,
  onGoBack,
  onCancel,
}: Props) {
  const { fields, lowConfidenceFields, edits, original, confirmedAt } = confirmed;

  const hasEdits =
    Object.keys(edits).some((key) =>
      key !== "firstName" && key !== "lastName" && key !== "fullName"
        ? (edits as Record<string, string>)[key] !== (original as unknown as Record<string, string>)[key]
        : false,
    ) ||
    edits.fullName !== original.fullName ||
    edits.firstName !== original.firstName ||
    edits.lastName !== original.lastName;

  return (
    <div className="space-y-6">
      <Card title="Final Confirmation — Review Before Save" className="border-2 border-green-200">
        {isSaving && (
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center gap-2 text-blue-800">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span className="text-sm font-medium">Saving guest data...</span>
            </div>
          </div>
        )}

        {saveError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
            <div className="flex items-center gap-2 text-red-800">
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
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <span className="text-sm font-medium">Save failed</span>
            </div>
            <p className="mt-1 text-sm text-red-700">{saveError}</p>
          </div>
        )}

        {hasEdits && (
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center gap-2 text-blue-800">
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
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                />
              </svg>
              <span className="text-sm font-medium">Staff corrections applied</span>
            </div>
          </div>
        )}

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
                {lowConfidenceFields.length} low-confidence field{lowConfidenceFields.length !== 1 ? "s" : ""} reviewed
                and accepted
              </span>
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-200">
          {Object.entries(SUMMARY_LABELS).map(([key, label]) => {
            const value = (fields as unknown as Record<string, string>)[key] || "";
            const isLow = lowConfidenceFields.includes(key);

            return (
              <div key={key} className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-600">{label}</span>
                <span className={`text-sm font-medium ${isLow ? "text-yellow-700" : "text-gray-900"}`}>
                  {value || <span className="italic text-gray-400">(empty)</span>}
                  {isLow && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                      REVIEWED
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {confirmedAt && (
          <p className="mt-4 text-xs text-gray-400">Confirmed at: {new Date(confirmedAt).toLocaleString()}</p>
        )}
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={onConfirm} disabled={isSaving}>
          {isSaving ? "Saving..." : "Confirm & Save"}
        </Button>
        <Button variant="secondary" onClick={onGoBack}>
          Go Back
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
