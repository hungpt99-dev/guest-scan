import type { OcrResult, ExtractedFields, ExtractedField, DocumentType } from "@guestfill/shared";
import { maskPassportNumber, maskFullName } from "@guestfill/shared";
import { BaseOcrProvider } from "./base-ocr-provider";
import {
  getConfidenceLevel,
  makeField,
  normalizeDate,
  normalizeGender,
  normalizeDocumentType,
  checkDateExpired,
  normalizeCountryCode,
  normalizeDocumentNumber,
} from "./utils/normalization";
import { detectWarnings } from "./utils/warnings";
import { logger } from "../lib/logger";
import { isTauri } from "../lib/isTauri";

const AZURE_FIELD_DEFAULT_CONFIDENCE = 0.7;

interface AzureFieldValue {
  value: string;
  confidence: number;
}

interface AzureExtractionResponse {
  docType: string;
  fields: Record<string, AzureFieldValue>;
  content?: string;
  overallConfidence: number;
}

const AZURE_FIELD_MAP: Record<string, keyof ExtractedFields> = {
  FirstName: "firstName",
  LastName: "lastName",
  DateOfBirth: "dateOfBirth",
  Sex: "gender",
  Nationality: "nationality",
  DocumentNumber: "passportNumber",
  DateOfExpiry: "expiryDate",
  DateOfIssue: "issueDate",
  CountryOfIssue: "issuingCountry",
  Address: "address",
  PassportNumber: "passportNumber",
  IdNumber: "idNumber",
};

function extractDocTypeFromField(docType: string, fields: Record<string, AzureFieldValue>): DocumentType {
  if (docType.includes("idDocument.passport") || docType.includes("passport")) {
    return "PASSPORT";
  }
  if (docType.includes("idDocument.idCard") || docType.includes("idCard") || docType.includes("identity")) {
    return "ID_CARD";
  }

  const knownDocNumber = fields["DocumentNumber"]?.value ?? "";
  const knownIdNumber = fields["IdNumber"]?.value ?? "";
  if (knownDocNumber && knownDocNumber.length > 6 && !knownDocNumber.startsWith("ID")) {
    return "PASSPORT";
  }
  if (knownIdNumber) {
    return "ID_CARD";
  }

  return "UNKNOWN";
}

export class AzureOCRProvider extends BaseOcrProvider {
  readonly name = "AzureOCR";
  readonly type = "AZURE" as const;

  async processImage(imagePath: string, signal?: AbortSignal): Promise<OcrResult> {
    const startTime = performance.now();
    this.canceled = false;

    const cleanup = this.setupAbortSignal(signal);
    try {
      this.checkCanceled();

      const response = await this.callAzureDocumentIntelligence(imagePath);

      this.checkCanceled();

      const fields = this.mapFieldsToExtractedFields(response.fields);

      if (this.canceled) throw new DOMException("OCR was canceled", "AbortError");

      if (response.docType && !fields.documentType?.value) {
        const detectedDocType = extractDocTypeFromField(response.docType, response.fields);
        if (detectedDocType !== "UNKNOWN") {
          fields.documentType = makeField(detectedDocType, response.overallConfidence, "azure_document_intelligence");
        }
      }

      if (!fields.fullName?.value && (fields.firstName?.value || fields.lastName?.value)) {
        const name = [fields.lastName?.value, fields.firstName?.value].filter(Boolean).join(" ");
        fields.fullName = makeField(
          name,
          Math.min(fields.lastName?.confidence ?? 1, fields.firstName?.confidence ?? 1),
          "azure_document_intelligence",
        );
      }

      const overallConfidence = response.overallConfidence;
      const overallConfidenceLevel = getConfidenceLevel(overallConfidence);
      const warnings = detectWarnings(fields, overallConfidence);
      const detectedDocumentType = fields.documentType?.value
        ? normalizeDocumentType(fields.documentType.value)
        : undefined;
      const detectedGender = fields.gender?.value ? normalizeGender(fields.gender.value) : undefined;
      const isExpired = fields.expiryDate?.value ? checkDateExpired(fields.expiryDate.value) : undefined;

      logger.info("AzureOCRProvider: extraction completed", {
        overallConfidence,
        fieldCount: Object.keys(fields).length,
        maskedName: fields.fullName?.value ? maskFullName(fields.fullName.value) : undefined,
        maskedPassport: fields.passportNumber?.value ? maskPassportNumber(fields.passportNumber.value) : undefined,
        warnings,
      });

      return {
        fields,
        rawText: response.content,
        overallConfidence,
        overallConfidenceLevel,
        provider: "AZURE",
        warnings,
        detectedDocumentType,
        detectedGender,
        isExpired,
        processingTimeMs: Math.round(performance.now() - startTime),
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      logger.error("AzureOCRProvider: processing failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    } finally {
      if (cleanup) cleanup();
    }
  }

  protected async checkAvailability(): Promise<boolean> {
    if (!isTauri()) {
      this._isAvailable = false;
      return false;
    }

    try {
      const { invoke } = await import("@tauri-apps/api/tauri");
      this._isAvailable = await invoke<boolean>("check_azure_available");
      return this._isAvailable;
    } catch {
      this._isAvailable = false;
      return false;
    }
  }

  private async callAzureDocumentIntelligence(imagePath: string): Promise<AzureExtractionResponse> {
    if (!isTauri()) {
      throw new Error("Azure OCR is only available in the desktop app (Tauri).");
    }

    await this.ensureAvailable();

    const { invoke } = await import("@tauri-apps/api/tauri");

    const result = await invoke<AzureExtractionResponse>("extract_azure_document", {
      imagePath,
    });

    return result;
  }

  private mapFieldsToExtractedFields(azureFields: Record<string, AzureFieldValue>): ExtractedFields {
    const fields: ExtractedFields = {};

    for (const [azureKey, azureField] of Object.entries(azureFields)) {
      const mappedKey = AZURE_FIELD_MAP[azureKey];
      if (!mappedKey) continue;

      let value = azureField.value;
      const confidence = azureField.confidence ?? AZURE_FIELD_DEFAULT_CONFIDENCE;
      const source: ExtractedField["source"] = "azure_document_intelligence";

      if (mappedKey === "gender") {
        value = normalizeGender(value);
      } else if (mappedKey === "dateOfBirth" || mappedKey === "expiryDate" || mappedKey === "issueDate") {
        const normalized = normalizeDate(value);
        if (normalized) {
          value = normalized;
        }
      } else if (mappedKey === "nationality" || mappedKey === "issuingCountry") {
        value = normalizeCountryCode(value);
      } else if (mappedKey === "passportNumber" || mappedKey === "idNumber") {
        value = normalizeDocumentNumber(value);
      }

      if (value) {
        fields[mappedKey] = makeField(value, confidence, source);
      }
    }

    if (fields.passportNumber?.value && !fields.idNumber?.value) {
      const docType = this.inferDocumentTypeFromNumber(fields.passportNumber.value);
      if (docType === "PASSPORT") {
        fields.documentType = makeField("PASSPORT", fields.passportNumber.confidence, "azure_document_intelligence");
      }
    }
    if (fields.idNumber?.value && !fields.passportNumber?.value) {
      fields.documentType = makeField("ID_CARD", fields.idNumber.confidence, "azure_document_intelligence");
    }

    return fields;
  }

  private inferDocumentTypeFromNumber(number: string): DocumentType {
    const upper = number.toUpperCase();
    if (/^[A-Z]{2}\d{6,}$/.test(upper)) {
      return "PASSPORT";
    }
    if (/^\d{9,12}$/.test(number) || /^[A-Z]\d{8}$/.test(upper)) {
      return "ID_CARD";
    }
    return "UNKNOWN";
  }
}
