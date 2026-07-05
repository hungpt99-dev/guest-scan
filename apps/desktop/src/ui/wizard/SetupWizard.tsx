import { useState, useEffect, useCallback } from "react";
import Card from "../../components/common/Card";
import Button from "../../components/common/Button";
import ErrorMessage from "../../components/common/ErrorMessage";
import {
  createSettingsService,
  createInMemorySettingsStore,
  type SettingsService,
  type AppSettings,
  DEFAULT_APP_SETTINGS,
} from "../../services/settings-service";
import {
  createAutoFillMappingService,
  createInMemoryProfileStore,
  type AutoFillMappingService,
} from "../../services/auto-fill-mapping-service";

type SetupStep = "welcome" | "camera" | "ocr" | "autofill" | "complete";

type CameraDevice = {
  deviceId: string;
  label: string;
};

type SetupWizardProps = {
  settingsService?: SettingsService;
  mappingService?: AutoFillMappingService;
  onComplete: () => void;
  onSkip?: () => void;
};

const ENGINE_LABELS: Record<string, string> = {
  paddle: "PaddleOCR (Recommended)",
  tesseract: "Tesseract",
  mock: "Mock OCR (Testing)",
};

const ENGINE_DESCRIPTIONS: Record<string, string> = {
  paddle: "High accuracy OCR engine optimized for passport/ID documents. Requires ~500MB download.",
  tesseract: "Open-source OCR engine. Good fallback option. Lower accuracy than PaddleOCR.",
  mock: "Simulates OCR results for testing purposes. Not for real passport scanning.",
};

const LANGUAGE_LABELS: Record<string, string> = {
  eng: "English",
  chi: "Chinese",
  jpn: "Japanese",
  kor: "Korean",
  fra: "French",
  deu: "German",
  spa: "Spanish",
  ita: "Italian",
  por: "Portuguese",
  rus: "Russian",
  ara: "Arabic",
  hin: "Hindi",
};

export default function SetupWizard({ settingsService, mappingService, onComplete, onSkip }: SetupWizardProps) {
  const [step, setStep] = useState<SetupStep>("welcome");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const svc = settingsService ?? createSettingsService(createInMemorySettingsStore());
  const mapSvc = mappingService ?? createAutoFillMappingService(createInMemoryProfileStore());

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [profileName, setProfileName] = useState("Default Hotel Profile");

  useEffect(() => {
    svc
      .loadSettings()
      .then(setSettings)
      .catch(() => {});
  }, [svc]);

  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => {
        const videoDevices = devices
          .filter((d) => d.kind === "videoinput")
          .map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
          }));
        setCameras(videoDevices);
        if (videoDevices.length > 0 && !settings.camera.deviceId) {
          setSettings((prev) => ({
            ...prev,
            camera: {
              ...prev.camera,
              deviceId: videoDevices[0]!.deviceId,
              label: videoDevices[0]!.label,
            },
          }));
        }
      })
      .catch(() => {});
  }, []);

  const updateOcrSetting = useCallback(
    <K extends keyof (typeof settings)["ocr"]>(key: K, value: (typeof settings)["ocr"][K]) => {
      setSettings((prev) => ({
        ...prev,
        ocr: { ...prev.ocr, [key]: value },
      }));
    },
    [],
  );

  const handleComplete = async () => {
    setSaving(true);
    setError(null);
    try {
      await svc.updateSettings({ ...settings, onboardingCompleted: true });
      await mapSvc.createProfile(profileName);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const totalSteps = 4;
  const stepOrder: SetupStep[] = ["welcome", "camera", "ocr", "autofill", "complete"];
  const currentIndex = stepOrder.indexOf(step);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">GuestFill Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          Let's get you ready to scan passports and auto-fill check-in forms.
        </p>
      </div>

      {step !== "welcome" && step !== "complete" && (
        <div className="flex items-center justify-center gap-2">
          {stepOrder.slice(0, -1).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  i < currentIndex
                    ? "bg-blue-600 text-white"
                    : i === currentIndex
                      ? "border-2 border-blue-600 bg-blue-50 text-blue-600"
                      : "border-2 border-gray-300 bg-white text-gray-400"
                }`}
              >
                {i < currentIndex ? "✓" : i + 1}
              </div>
              {i < totalSteps - 1 && (
                <div className={`h-0.5 w-8 ${i < currentIndex ? "bg-blue-600" : "bg-gray-300"}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {error && <ErrorMessage message={error} />}

      {step === "welcome" && (
        <Card title="Welcome to GuestFill">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              This wizard will help you configure the app for first-time use. We'll set up:
            </p>
            <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
              <li>Camera or scanner for capturing passport/ID images</li>
              <li>OCR engine for text recognition</li>
              <li>Auto-fill profile for hotel check-in forms</li>
            </ul>
            <p className="text-sm text-gray-500">
              All data stays on your local PC. No images or personal data are uploaded to any third-party service.
            </p>
            <div className="flex gap-3 pt-2">
              <Button onClick={() => setStep("camera")}>Get Started</Button>
              {onSkip && (
                <Button variant="ghost" onClick={onSkip}>
                  Skip Setup
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {step === "camera" && (
        <Card title="Step 1: Camera Setup">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Select the camera or scanner you'll use to capture passport/ID images.
            </p>

            {cameras.length === 0 && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
                <p className="text-sm text-yellow-800">
                  No camera devices detected. You can skip this step and select a camera later in Settings.
                </p>
              </div>
            )}

            {cameras.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Camera Device</label>
                <select
                  value={settings.camera.deviceId}
                  onChange={(e) => {
                    const device = cameras.find((c) => c.deviceId === e.target.value);
                    setSettings((prev) => ({
                      ...prev,
                      camera: {
                        ...prev.camera,
                        deviceId: e.target.value,
                        label: device?.label ?? "",
                      },
                    }));
                  }}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {cameras.map((cam) => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">Resolution</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={settings.camera.resolution.width}
                  onChange={(e) => {
                    const w = parseInt(e.target.value) || 640;
                    setSettings((prev) => ({
                      ...prev,
                      camera: {
                        ...prev.camera,
                        resolution: { ...prev.camera.resolution, width: w },
                      },
                    }));
                  }}
                  placeholder="Width"
                  min={320}
                  max={4096}
                />
                <span className="flex items-center text-gray-400">×</span>
                <input
                  type="number"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={settings.camera.resolution.height}
                  onChange={(e) => {
                    const h = parseInt(e.target.value) || 480;
                    setSettings((prev) => ({
                      ...prev,
                      camera: {
                        ...prev.camera,
                        resolution: { ...prev.camera.resolution, height: h },
                      },
                    }));
                  }}
                  placeholder="Height"
                  min={240}
                  max={4096}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={() => setStep("ocr")}>Continue</Button>
              <Button variant="ghost" onClick={() => setStep("ocr")}>
                Skip
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === "ocr" && (
        <Card title="Step 2: OCR Engine">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Choose the OCR engine for reading passport/ID text. PaddleOCR is recommended for best accuracy.
            </p>

            <div className="space-y-3">
              {(["paddle", "tesseract", "mock"] as const).map((engine) => (
                <label
                  key={engine}
                  className={`block cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                    settings.ocr.engineType === engine
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="ocr-engine"
                      value={engine}
                      checked={settings.ocr.engineType === engine}
                      onChange={() => updateOcrSetting("engineType", engine)}
                      className="mt-1"
                    />
                    <div>
                      <p className="font-medium text-gray-900">{ENGINE_LABELS[engine]}</p>
                      <p className="text-sm text-gray-500">{ENGINE_DESCRIPTIONS[engine]}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">OCR Language</label>
              <select
                value={settings.ocr.paddleLanguage}
                onChange={(e) => {
                  updateOcrSetting("paddleLanguage", e.target.value);
                  updateOcrSetting("tesseractLanguage", e.target.value);
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {svc.getSupportedLanguages().map((lang) => (
                  <option key={lang} value={lang}>
                    {LANGUAGE_LABELS[lang] ?? lang}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enable-fallback"
                checked={settings.ocr.enableFallback}
                onChange={(e) => updateOcrSetting("enableFallback", e.target.checked)}
                className="rounded"
              />
              <label htmlFor="enable-fallback" className="text-sm text-gray-700">
                Fall back to Tesseract if PaddleOCR fails
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Confidence Threshold ({Math.round(settings.ocr.ocrConfidenceThreshold * 100)}%)
              </label>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={settings.ocr.ocrConfidenceThreshold}
                onChange={(e) => updateOcrSetting("ocrConfidenceThreshold", parseFloat(e.target.value))}
                className="mt-1 w-full"
              />
              <p className="mt-1 text-xs text-gray-400">
                Fields below this confidence will be highlighted for manual review.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={() => setStep("autofill")}>Continue</Button>
              <Button variant="ghost" onClick={() => setStep("camera")}>
                Back
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === "autofill" && (
        <Card title="Step 3: Auto-fill Profile">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Create your first auto-fill profile. This tells the app which OCR fields map to your hotel check-in form
              fields.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700">Profile Name</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. Hotel ABC Check-in"
              />
            </div>

            <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
              <p className="text-sm text-blue-800">
                You can configure detailed field mappings later in Settings {">"} Auto-fill Profiles. For now, a default
                profile will be created with standard mappings.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="test-mode"
                checked={settings.autoFill.enableTestMode}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    autoFill: { ...prev.autoFill, enableTestMode: e.target.checked },
                  }))
                }
                className="rounded"
              />
              <label htmlFor="test-mode" className="text-sm text-gray-700">
                Enable test mode (preview values before real auto-fill)
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleComplete} disabled={saving || !profileName.trim()}>
                {saving ? "Saving..." : "Complete Setup"}
              </Button>
              <Button variant="ghost" onClick={() => setStep("ocr")}>
                Back
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === "complete" && (
        <Card title="Setup Complete!">
          <div className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-8 w-8 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
            </div>
            <p className="text-gray-600">
              You're all set! You can now start scanning passports and auto-filling check-in forms.
            </p>
            <div className="flex justify-center gap-3">
              <Button onClick={onComplete}>Go to Home</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
