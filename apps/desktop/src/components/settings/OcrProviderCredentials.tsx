import { useState, useEffect, useCallback } from "react";
import Card from "../common/Card";
import Button from "../common/Button";
import ErrorMessage from "../common/ErrorMessage";
import { getCredentialService, type CredentialService } from "../../services/credential-service";
import { OCR_PROVIDER_CREDENTIAL_CONFIGS, type CredentialStatus } from "@guestfill/shared";

type OcrProviderCredentialsProps = {
  credentialService?: CredentialService;
};

type ProviderState = {
  status: CredentialStatus;
  endpoint: string;
  apiKey: string;
  dirty: boolean;
};

export default function OcrProviderCredentials({ credentialService }: OcrProviderCredentialsProps) {
  const svc = credentialService ?? getCredentialService();

  const [providerStates, setProviderStates] = useState<Record<string, ProviderState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const states: Record<string, ProviderState> = {};
        for (const config of OCR_PROVIDER_CREDENTIAL_CONFIGS) {
          const status = await svc.checkStatus(config.provider);
          let endpoint = "";
          let apiKey = "";
          if (status.has_endpoint) {
            try {
              endpoint = await svc.getCredential(config.provider, "endpoint");
            } catch {
              // endpoint not available
            }
          }
          if (status.has_key) {
            try {
              apiKey = await svc.getCredential(config.provider, "api_key");
            } catch {
              // api key not available
            }
          }
          states[config.provider] = { status, endpoint, apiKey, dirty: false };
        }
        setProviderStates(states);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load credential status");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [svc]);

  const updateField = useCallback((provider: string, field: "endpoint" | "apiKey", value: string) => {
    setProviderStates((prev) => {
      const current = prev[provider];
      if (!current) return prev;
      return { ...prev, [provider]: { ...current, [field]: value, dirty: true } };
    });
    setSuccess(null);
    setError(null);
  }, []);

  const saveProvider = useCallback(
    async (provider: string) => {
      const state = providerStates[provider];
      if (!state) return;

      setSaving(true);
      setError(null);
      setSuccess(null);

      try {
        const config = OCR_PROVIDER_CREDENTIAL_CONFIGS.find((c) => c.provider === provider);
        if (!config) return;

        if (config.requiresEndpoint && state.endpoint) {
          await svc.saveCredential(provider, "endpoint", state.endpoint);
        }
        if (state.apiKey) {
          await svc.saveCredential(provider, "api_key", state.apiKey);
        }

        const status = await svc.checkStatus(provider);
        setProviderStates((prev) => {
          const current = prev[provider];
          if (!current) return prev;
          return { ...prev, [provider]: { ...current, status, dirty: false } };
        });
        setSuccess(`${config.label} credentials saved successfully.`);
        setTimeout(() => setSuccess(null), 3000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save credentials");
      } finally {
        setSaving(false);
      }
    },
    [providerStates, svc],
  );

  const deleteProvider = useCallback(
    async (provider: string) => {
      setSaving(true);
      setError(null);
      try {
        await svc.deleteCredential(provider, "api_key");
        await svc.deleteCredential(provider, "endpoint");

        const status = await svc.checkStatus(provider);
        setProviderStates((prev) => ({
          ...prev,
          [provider]: { status, endpoint: "", apiKey: "", dirty: false },
        }));
        setSuccess("Credentials removed.");
        setTimeout(() => setSuccess(null), 3000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete credentials");
      } finally {
        setSaving(false);
      }
    },
    [svc],
  );

  if (loading) {
    return (
      <Card title="OCR Provider Credentials">
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (OCR_PROVIDER_CREDENTIAL_CONFIGS.length === 0) return null;

  return (
    <Card title="OCR Provider Credentials">
      <div className="space-y-6">
        <p className="text-sm text-gray-500">
          API keys and endpoints are stored securely in your system keychain. They never leave your device unencrypted.
        </p>

        {error && <ErrorMessage message={error} />}
        {success && <p className="text-sm text-green-600">{success}</p>}

        {OCR_PROVIDER_CREDENTIAL_CONFIGS.map((config) => {
          const state = providerStates[config.provider];
          if (!state) return null;

          const hasStored = state.status.has_key || state.status.has_endpoint;

          return (
            <div key={config.provider} className="rounded-md border border-gray-200 p-4">
              <h4 className="mb-3 text-sm font-semibold text-gray-800">{config.label}</h4>

              <div className="space-y-3">
                {config.requiresEndpoint && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{config.endpointLabel}</label>
                    <input
                      type="url"
                      value={state.endpoint}
                      onChange={(e) => updateField(config.provider, "endpoint", e.target.value)}
                      placeholder={config.endpointPlaceholder}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {hasStored && !state.dirty && !state.endpoint && (
                      <p className="mt-1 text-xs text-gray-400">Stored: {state.status.endpoint_preview}</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700">{config.apiKeyLabel}</label>
                  <input
                    type="password"
                    value={state.apiKey}
                    onChange={(e) => updateField(config.provider, "apiKey", e.target.value)}
                    placeholder={hasStored && !state.dirty ? state.status.key_preview : config.apiKeyPlaceholder}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    onClick={() => saveProvider(config.provider)}
                    disabled={saving || !state.dirty}
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  {hasStored && (
                    <Button variant="secondary" onClick={() => deleteProvider(config.provider)} disabled={saving}>
                      Remove
                    </Button>
                  )}
                </div>

                {hasStored && (
                  <p className="text-xs text-green-600">{"\u2713"} Credentials stored in system keychain</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
