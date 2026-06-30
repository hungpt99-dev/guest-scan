import { useState, useEffect, useCallback } from "react";
import Card from "../../components/common/Card";
import Button from "../../components/common/Button";
import ErrorMessage from "../../components/common/ErrorMessage";
import {
  createSettingsService,
  createInMemorySettingsStore,
  type SettingsService,
  type AppSettings,
  type SettingsUpdate,
} from "../../services/settings-service";
import {
  createAutoFillMappingService,
  createInMemoryProfileStore,
  type AutoFillMappingService,
  type AutoFillProfile,
} from "../../services/auto-fill-mapping-service";

type SettingsPageProps = {
  settingsService?: SettingsService;
  mappingService?: AutoFillMappingService;
};

const ENGINE_LABELS: Record<string, string> = {
  paddle: "PaddleOCR",
  tesseract: "Tesseract",
  mock: "Mock OCR (Testing)",
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

export default function SettingsPage({ settingsService, mappingService }: SettingsPageProps) {
  const svc = settingsService ?? createSettingsService(createInMemorySettingsStore());
  const mapSvc = mappingService ?? createAutoFillMappingService(createInMemoryProfileStore());

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<AutoFillProfile[]>([]);

  useEffect(() => {
    Promise.all([svc.loadSettings(), mapSvc.getAllProfiles()])
      .then(([s, p]) => {
        setSettings(s);
        setProfiles(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load settings"))
      .finally(() => setLoading(false));
  }, [svc, mapSvc]);

  const save = useCallback(
    async (update: SettingsUpdate) => {
      if (!settings) return;
      setSaving(true);
      setError(null);
      setSuccess(null);
      try {
        const updated = await svc.updateSettings(update);
        setSettings(updated);
        setSuccess("Settings saved successfully.");
        setTimeout(() => setSuccess(null), 3000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save settings");
      } finally {
        setSaving(false);
      }
    },
    [settings, svc],
  );

  const resetAll = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const reset = await svc.resetSettings();
      setSettings(reset);
      setSuccess("Settings reset to defaults.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset settings");
    } finally {
      setSaving(false);
    }
  }, [svc]);

  const updateOcr = useCallback(
    <K extends keyof AppSettings["ocr"]>(key: K, value: AppSettings["ocr"][K]) => {
      if (!settings) return;
      save({ ocr: { ...settings.ocr, [key]: value } });
    },
    [settings, save],
  );

  const updateCamera = useCallback(
    <K extends keyof AppSettings["camera"]>(key: K, value: AppSettings["camera"][K]) => {
      if (!settings) return;
      save({ camera: { ...settings.camera, [key]: value } });
    },
    [settings, save],
  );

  const updateRetention = useCallback(
    <K extends keyof AppSettings["imageRetention"]>(key: K, value: AppSettings["imageRetention"][K]) => {
      if (!settings) return;
      save({ imageRetention: { ...settings.imageRetention, [key]: value } });
    },
    [settings, save],
  );

  const updateAutoFill = useCallback(
    <K extends keyof AppSettings["autoFill"]>(key: K, value: AppSettings["autoFill"][K]) => {
      if (!settings) return;
      save({ autoFill: { ...settings.autoFill, [key]: value } });
    },
    [settings, save],
  );

  const updatePrivacy = useCallback(
    <K extends keyof AppSettings["privacy"]>(key: K, value: AppSettings["privacy"][K]) => {
      if (!settings) return;
      save({ privacy: { ...settings.privacy, [key]: value } });
    },
    [settings, save],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!settings) {
    return <ErrorMessage message="Failed to load settings. Please try again." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <div className="flex gap-2">
          {success && <span className="flex items-center text-sm text-green-600">{success}</span>}
          <Button variant="secondary" onClick={resetAll} disabled={saving}>
            Reset to Defaults
          </Button>
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      <Card title="OCR Engine">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">OCR Engine</label>
            <select
              value={settings.ocr.engineType}
              onChange={(e) => updateOcr("engineType", e.target.value as AppSettings["ocr"]["engineType"])}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {svc.getOcrEngines().map((engine) => (
                <option key={engine} value={engine}>
                  {ENGINE_LABELS[engine] ?? engine}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Language</label>
            <select
              value={settings.ocr.paddleLanguage}
              onChange={(e) => {
                updateOcr("paddleLanguage", e.target.value);
                updateOcr("tesseractLanguage", e.target.value);
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
              onChange={(e) => updateOcr("enableFallback", e.target.checked)}
              className="rounded"
            />
            <label htmlFor="enable-fallback" className="text-sm text-gray-700">
              Enable fallback to Tesseract
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enable-gpu"
              checked={settings.ocr.enableGpu}
              onChange={(e) => updateOcr("enableGpu", e.target.checked)}
              className="rounded"
            />
            <label htmlFor="enable-gpu" className="text-sm text-gray-700">
              Enable GPU acceleration (if available)
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
              onChange={(e) => updateOcr("ocrConfidenceThreshold", parseFloat(e.target.value))}
              className="mt-1 w-full"
            />
            <p className="mt-1 text-xs text-gray-400">
              Fields below this threshold will be highlighted for manual review.
            </p>
          </div>

          {settings.ocr.engineType === "paddle" && (
            <div>
              <label className="block text-sm font-medium text-gray-700">PaddleOCR Worker Path</label>
              <input
                type="text"
                value={settings.ocr.paddleWorkerPath}
                onChange={(e) => updateOcr("paddleWorkerPath", e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Leave empty for default path"
              />
            </div>
          )}

          {settings.ocr.engineType === "tesseract" && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Tesseract Path</label>
              <input
                type="text"
                value={settings.ocr.tesseractPath}
                onChange={(e) => updateOcr("tesseractPath", e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. C:\Program Files\Tesseract-OCR\tesseract.exe"
              />
            </div>
          )}
        </div>
      </Card>

      <Card title="Camera">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Camera Resolution</label>
            <div className="mt-1 flex gap-2">
              <input
                type="number"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={settings.camera.resolution.width}
                onChange={(e) =>
                  updateCamera("resolution", {
                    ...settings.camera.resolution,
                    width: parseInt(e.target.value) || 640,
                  })
                }
                min={320}
                max={4096}
              />
              <span className="flex items-center text-gray-400">×</span>
              <input
                type="number"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={settings.camera.resolution.height}
                onChange={(e) =>
                  updateCamera("resolution", {
                    ...settings.camera.resolution,
                    height: parseInt(e.target.value) || 480,
                  })
                }
                min={240}
                max={4096}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card title="Image Retention">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="retention-enabled"
              checked={settings.imageRetention.enabled}
              onChange={(e) => updateRetention("enabled", e.target.checked)}
              className="rounded"
            />
            <label htmlFor="retention-enabled" className="text-sm text-gray-700">
              Keep processed images on disk
            </label>
          </div>

          {settings.imageRetention.enabled && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Max Age (days)</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={settings.imageRetention.maxAgeDays}
                  onChange={(e) => updateRetention("maxAgeDays", parseInt(e.target.value) || 1)}
                  min={1}
                  max={365}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Max Images</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={settings.imageRetention.maxImages}
                  onChange={(e) => updateRetention("maxImages", parseInt(e.target.value) || 1)}
                  min={1}
                  max={10000}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Storage Path</label>
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={settings.imageRetention.storagePath}
                  onChange={(e) => updateRetention("storagePath", e.target.value)}
                  placeholder="Leave empty for app default directory"
                />
              </div>
            </>
          )}
        </div>
      </Card>

      <Card title="Auto-fill">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Active Profile</label>
            <select
              value={settings.autoFill.activeProfileId}
              onChange={(e) => updateAutoFill("activeProfileId", e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">None (disabled)</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? " (Default)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="autofill-test-mode"
              checked={settings.autoFill.enableTestMode}
              onChange={(e) => updateAutoFill("enableTestMode", e.target.checked)}
              className="rounded"
            />
            <label htmlFor="autofill-test-mode" className="text-sm text-gray-700">
              Enable test mode (preview values before real auto-fill)
            </label>
          </div>

          {profiles.length === 0 && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3">
              <p className="text-sm text-yellow-800">
                No auto-fill profiles configured. Create one from the Setup Wizard or add a profile manually.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card title="Privacy & Security">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            These settings control how sensitive data is handled. Changes apply to future operations only.
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.privacy.maskDocumentNumberInLogs}
                onChange={(e) => updatePrivacy("maskDocumentNumberInLogs", e.target.checked)}
                className="rounded"
              />
              Mask document numbers in logs
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.privacy.maskFullNameInLogs}
                onChange={(e) => updatePrivacy("maskFullNameInLogs", e.target.checked)}
                className="rounded"
              />
              Mask full names in logs
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.privacy.maskImagesInLogs}
                onChange={(e) => updatePrivacy("maskImagesInLogs", e.target.checked)}
                className="rounded"
              />
              Mask image references in logs
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.privacy.deleteTempImagesAfterProcessing}
                onChange={(e) => updatePrivacy("deleteTempImagesAfterProcessing", e.target.checked)}
                className="rounded"
              />
              Delete temporary images after processing
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.privacy.retentionEnabled}
                onChange={(e) => updatePrivacy("retentionEnabled", e.target.checked)}
                className="rounded"
              />
              Enable image retention (keeps processed images longer)
            </label>
          </div>
        </div>
      </Card>

      <Card title="Appearance">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Theme</label>
            <select
              value={settings.theme}
              onChange={(e) => save({ theme: e.target.value as AppSettings["theme"] })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Language</label>
            <select
              value={settings.language}
              onChange={(e) => save({ language: e.target.value })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="en">English</option>
              <option value="vi">Vietnamese</option>
              <option value="zh">Chinese</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
            </select>
          </div>
        </div>
      </Card>
    </div>
  );
}
