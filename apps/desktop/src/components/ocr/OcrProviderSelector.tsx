import { useId } from "react";
import type { OcrProviderType, OcrProcessingStatus } from "@guestfill/shared";
import Button from "../common/Button";

type OcrProviderOption = {
  value: OcrProviderType;
  label: string;
  description: string;
  badge: string;
};

const PROVIDER_OPTIONS: OcrProviderOption[] = [
  {
    value: "LOCAL",
    label: "Local OCR",
    description: "Free offline OCR. Good for testing and simple extraction. Review data before use.",
    badge: "Free / Offline",
  },
  {
    value: "AZURE",
    label: "Azure OCR",
    description: "Production-grade OCR with Azure Document Intelligence. Best for accurate passport/ID extraction.",
    badge: "Production",
  },
];

const STATUS_LABELS: Record<OcrProcessingStatus, string> = {
  IDLE: "Ready",
  UPLOADING: "Uploading image...",
  PROCESSING: "Extracting document information...",
  COMPLETED: "Extraction completed",
  FAILED: "Extraction failed",
};

interface OcrProviderSelectorProps {
  selectedProvider: OcrProviderType;
  onProviderChange: (provider: OcrProviderType) => void;
  processingStatus: OcrProcessingStatus;
  errorMessage?: string;
  onRetry?: () => void;
  disabled?: boolean;
}

export default function OcrProviderSelector({
  selectedProvider,
  onProviderChange,
  processingStatus,
  errorMessage,
  onRetry,
  disabled = false,
}: OcrProviderSelectorProps) {
  const groupId = useId();
  const isProcessing = processingStatus === "UPLOADING" || processingStatus === "PROCESSING";
  const isCompleted = processingStatus === "COMPLETED";
  const isFailed = processingStatus === "FAILED";

  return (
    <div className="space-y-4" data-testid="ocr-provider-selector">
      <fieldset disabled={disabled || isProcessing}>
        <legend className="text-sm font-medium text-gray-700 mb-2">OCR Provider</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PROVIDER_OPTIONS.map((option) => {
            const isSelected = selectedProvider === option.value;
            return (
              <label
                key={option.value}
                data-testid={`provider-option-${option.value.toLowerCase()}`}
                className={`relative flex flex-col rounded-lg border p-4 cursor-pointer transition-colors
                  ${
                    isSelected
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                  }
                  ${disabled ? "opacity-60 cursor-not-allowed" : ""}
                `}
              >
                <input
                  type="radio"
                  name={groupId}
                  value={option.value}
                  checked={isSelected}
                  onChange={() => onProviderChange(option.value)}
                  className="sr-only"
                  aria-label={option.label}
                />
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{option.label}</span>
                  <span
                    data-testid={`provider-badge-${option.value.toLowerCase()}`}
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                      ${option.value === "AZURE" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`}
                  >
                    {option.badge}
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{option.description}</p>
                {isSelected && (
                  <span
                    className="mt-2 inline-flex items-center text-xs font-medium text-blue-600"
                    data-testid="selected-indicator"
                  >
                    <svg className="mr-1 h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Selected
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div data-testid="ocr-status" className="rounded-md border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isProcessing && (
              <div
                className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"
                data-testid="processing-spinner"
              />
            )}
            {isCompleted && (
              <svg
                className="h-4 w-4 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
            {isFailed && (
              <svg
                className="h-4 w-4 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span
              className={`text-sm ${isCompleted ? "text-green-700" : isFailed ? "text-red-700" : "text-gray-600"}`}
              data-testid="status-label"
            >
              {STATUS_LABELS[processingStatus]}
            </span>
          </div>
          {isProcessing && (
            <span className="text-xs text-gray-400" data-testid="processing-indicator">
              Processing...
            </span>
          )}
        </div>

        {isFailed && errorMessage && (
          <div className="mt-2" data-testid="error-detail">
            <p className="text-xs text-red-600 mb-2">{errorMessage}</p>
            {onRetry && (
              <Button variant="ghost" onClick={onRetry} data-testid="retry-button">
                Retry OCR
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
