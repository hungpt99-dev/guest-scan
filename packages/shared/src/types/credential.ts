export type KeyType = "api_key" | "endpoint";

export type CredentialStatus = {
  provider: string;
  has_key: boolean;
  has_endpoint: boolean;
  endpoint_preview: string;
  key_preview: string;
};

export type SaveCredentialRequest = {
  provider: string;
  key_type: KeyType;
  value: string;
};

export type GetCredentialRequest = {
  provider: string;
  key_type: KeyType;
};

export type OcrProviderCredentialConfig = {
  label: string;
  provider: string;
  requiresEndpoint: boolean;
  endpointLabel: string;
  endpointPlaceholder: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
};

export const OCR_PROVIDER_CREDENTIAL_CONFIGS: OcrProviderCredentialConfig[] = [
  {
    label: "Microsoft Azure Document Intelligence",
    provider: "AZURE",
    requiresEndpoint: true,
    endpointLabel: "Endpoint URL",
    endpointPlaceholder: "https://your-resource.cognitiveservices.azure.com/",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "Paste your Azure API key",
  },
];

export const KEYRING_SERVICE_NAME = "com.guestfill.ocr";
