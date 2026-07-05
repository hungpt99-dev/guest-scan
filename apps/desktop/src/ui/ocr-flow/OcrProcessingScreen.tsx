import Card from "../../components/common/Card";
import type { PipelineProgress, PipelineStage } from "../../services/ocr_pipeline_service";

type Props = {
  progress: PipelineProgress[];
  error?: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
};

const STAGE_LABELS: Record<PipelineStage, { label: string; order: number }> = {
  QUALITY_CHECK: { label: "Checking image quality", order: 1 },
  DOCUMENT_CROP: { label: "Cropping document", order: 2 },
  PREPROCESSING: { label: "Preprocessing image", order: 3 },
  MRZ_DETECTION: { label: "Detecting MRZ region", order: 4 },
  OCR: { label: "Running OCR", order: 5 },
  MRZ_PARSE: { label: "Parsing MRZ text", order: 6 },
  CHECKSUM_VALIDATION: { label: "Validating MRZ checksums", order: 7 },
  FIELD_NORMALIZATION: { label: "Normalizing extracted fields", order: 8 },
  CONFIDENCE_SCORING: { label: "Calculating confidence scores", order: 9 },
  STAFF_REVIEW: { label: "Preparing review", order: 10 },
};

const STAGE_COUNT = Object.keys(STAGE_LABELS).length;

export default function OcrProcessingScreen({ progress, error, onCancel, onRetry }: Props) {
  const currentStage = progress.length > 0 ? progress[progress.length - 1] : null;
  const currentStageInfo = currentStage ? STAGE_LABELS[currentStage.stage] : null;
  const overallProgress = currentStageInfo ? Math.round((currentStageInfo.order / STAGE_COUNT) * 100) : 0;

  return (
    <div className="space-y-6">
      <Card title="Processing Document">
        {!error && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{currentStage?.message || "Starting..."}</span>
                <span className="font-medium text-blue-600">{overallProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-500 ease-out"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>

            <ul className="space-y-2">
              {Object.entries(STAGE_LABELS).map(([stage, info]) => {
                const completed = progress.some((p) => p.stage === stage);
                const active = currentStage?.stage === stage;
                return (
                  <li
                    key={stage}
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                      completed ? "bg-green-50 text-green-700" : active ? "bg-blue-50 text-blue-700" : "text-gray-400"
                    }`}
                  >
                    {completed ? (
                      <svg
                        className="h-5 w-5 flex-shrink-0 text-green-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : active ? (
                      <div className="h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    ) : (
                      <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-gray-300" />
                    )}
                    <span>{info.label}</span>
                  </li>
                );
              })}
            </ul>

            {onCancel && (
              <div className="pt-2">
                <button onClick={onCancel} className="text-sm text-gray-500 underline hover:text-gray-700">
                  Cancel processing
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="space-y-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2">
                <svg
                  className="h-5 w-5 flex-shrink-0 text-red-600"
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
                <span className="text-sm font-medium text-red-800">Processing failed</span>
              </div>
              <p className="mt-2 text-sm text-red-700">{error}</p>
            </div>
            {onRetry && (
              <button onClick={onRetry} className="text-sm font-medium text-blue-600 underline hover:text-blue-500">
                Try Again
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
