import Card from "../components/common/Card";
import Button from "../components/common/Button";
import type { ImageQualityWarning } from "../services/image_quality_service";

type Props = {
  warnings: ImageQualityWarning[];
  imagePreview?: string;
  onRetake: () => void;
  onForceProceed: () => void;
  onCancel: () => void;
};

const WARNING_LABELS: Record<ImageQualityWarning, { label: string; description: string }> = {
  BLURRY: { label: "Blurry Image", description: "The image appears blurry. Please ensure the document is in focus." },
  TOO_DARK: { label: "Too Dark", description: "The image is underexposed. Increase lighting on the document." },
  TOO_BRIGHT: { label: "Too Bright", description: "The image is overexposed. Reduce direct light on the document." },
  LOW_CONTRAST: { label: "Low Contrast", description: "The document lacks contrast against the background." },
  GLARE_DETECTED: {
    label: "Glare / Reflection",
    description: "Glare or reflection detected. Avoid direct light on the document.",
  },
  SKEWED: { label: "Skewed / Rotated", description: "The document is not straight. Please align it properly." },
  LOW_RESOLUTION: { label: "Low Resolution", description: "The image resolution is too low. Move the camera closer." },
  EDGES_NOT_VISIBLE: {
    label: "Edges Not Visible",
    description: "The document edges are not fully visible. Frame the entire document.",
  },
};

export default function ImageQualityWarningScreen({
  warnings,
  imagePreview,
  onRetake,
  onForceProceed,
  onCancel,
}: Props) {
  return (
    <div className="space-y-6">
      <Card title="Image Quality Warning" className="border-2 border-yellow-300">
        <div className="mb-4 flex items-center gap-2 text-yellow-800">
          <svg
            className="h-6 w-6 flex-shrink-0"
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
          <span className="text-sm font-medium">
            {warnings.length} quality issue{warnings.length !== 1 ? "s" : ""} detected
          </span>
        </div>

        {imagePreview && (
          <div className="mb-4 overflow-hidden rounded-lg border border-yellow-200">
            <img src={imagePreview} alt="Captured image" className="mx-auto max-h-48 w-full object-contain" />
          </div>
        )}

        <ul className="space-y-3">
          {warnings.map((w) => {
            const info = WARNING_LABELS[w];
            return (
              <li key={w} className="rounded-md bg-yellow-50 p-3">
                <div className="flex items-start gap-2">
                  <svg
                    className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600"
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
                  <div>
                    <p className="text-sm font-medium text-yellow-800">{info.label}</p>
                    <p className="text-sm text-yellow-700">{info.description}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={onRetake}>Retake Photo</Button>
        <Button variant="secondary" onClick={onForceProceed}>
          Proceed Anyway
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
