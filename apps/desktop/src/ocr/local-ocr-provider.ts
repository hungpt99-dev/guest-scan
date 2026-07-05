import { createWorker, PSM } from "tesseract.js";
import type { Worker, RecognizeResult } from "tesseract.js";
import type { OcrResult, ExtractedFields } from "@guestfill/shared";
import { parseMrz, detectMrzFormat } from "./mrz_parser";
import { BaseOcrProvider } from "./base-ocr-provider";
import {
  getConfidenceLevel,
  makeField,
  normalizeDate,
  normalizeGender,
  normalizeDocumentType,
  checkDateExpired,
} from "./utils/normalization";
import { detectWarnings } from "./utils/warnings";
import { logger } from "../lib/logger";
import { isTauri } from "../lib/isTauri";

const MRZ_MIN_LINE_LENGTH = 30;
const MRZ_VALID_CHARS_RATIO = 0.8;
const DEFAULT_CONFIDENCE = 0.7;

function isMrzLine(line: string): boolean {
  const stripped = line.replace(/\s/g, "").toUpperCase();
  if (stripped.length < MRZ_MIN_LINE_LENGTH) return false;
  const validChars = [...stripped].filter((c) => /[A-Z0-9<]/.test(c));
  return validChars.length / stripped.length >= MRZ_VALID_CHARS_RATIO;
}

function parseVisualFields(rawText: string, tesseractConfidence: number): ExtractedFields {
  const fields: ExtractedFields = {};
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const upperText = rawText.toUpperCase();

  const labelPatterns: Array<{
    labels: string[];
    field: keyof ExtractedFields;
    extract: (value: string) => string;
  }> = [
    {
      labels: ["PASSPORT NO", "PASSPORT NUMBER", "PASSPORT\\s*:", "DOCUMENT NO", "DOCUMENT NUMBER"],
      field: "passportNumber",
      extract: (v) => v.replace(/[^A-Z0-9]/g, "").trim(),
    },
    {
      labels: ["ID NO", "ID NUMBER", "IDENTITY NO", "NATIONAL ID"],
      field: "idNumber",
      extract: (v) => v.replace(/[^A-Z0-9]/g, "").trim(),
    },
    {
      labels: ["SURNAME", "LAST NAME", "FAMILY NAME"],
      field: "lastName",
      extract: (v) => v.trim(),
    },
    {
      labels: ["GIVEN NAME", "FIRST NAME", "GIVEN NAMES"],
      field: "firstName",
      extract: (v) => v.trim(),
    },
    {
      labels: ["DATE OF BIRTH", "DOB", "BIRTH DATE", "DATE OF BIRTH\\s*:"],
      field: "dateOfBirth",
      extract: (v) => normalizeDate(v) ?? v.trim(),
    },
    {
      labels: ["NATIONALITY", "NATIONALITY\\s*:"],
      field: "nationality",
      extract: (v) => v.replace(/[^A-Z]/g, "").slice(0, 3),
    },
    {
      labels: ["SEX", "GENDER"],
      field: "gender",
      extract: (v) => normalizeGender(v),
    },
    {
      labels: ["DATE OF ISSUE", "ISSUE DATE", "DATE OF ISSUE\\s*:"],
      field: "issueDate",
      extract: (v) => normalizeDate(v) ?? v.trim(),
    },
    {
      labels: ["DATE OF EXPIRY", "EXPIRY DATE", "EXPIRES", "DATE OF EXPIRY\\s*:"],
      field: "expiryDate",
      extract: (v) => normalizeDate(v) ?? v.trim(),
    },
    {
      labels: ["ISSUING COUNTRY", "ISSUING COUNTRY\\s*:", "COUNTRY OF ISSUE"],
      field: "issuingCountry",
      extract: (v) => v.replace(/[^A-Z]/g, "").slice(0, 3),
    },
    {
      labels: ["PLACE OF BIRTH", "BIRTH PLACE"],
      field: "address",
      extract: (v) => v.trim(),
    },
    {
      labels: ["ADDRESS", "RESIDENCE"],
      field: "address",
      extract: (v) => v.trim(),
    },
  ];

  for (const line of lines) {
    for (const pattern of labelPatterns) {
      if (fields[pattern.field]) continue;
      for (const label of pattern.labels) {
        const regex = new RegExp(`(?:(?:${label})\\s*[:\\s]*)(.+)$`, "i");
        const match = line.match(regex);
        if (match?.[1]) {
          const value = pattern.extract(match[1]);
          if (value) {
            fields[pattern.field] = makeField(value, tesseractConfidence, "visual_ocr");
          }
          break;
        }
      }
    }
  }

  const mrzCodePattern = rawText.match(/[A-Z0-9<]{30,}(?:\n|\r)[A-Z0-9<]{30,}(?:\n|\r[A-Z0-9<]{10,})?/);
  if (mrzCodePattern) {
    fields.mrzCode = makeField(mrzCodePattern[0].replace(/\s/g, "").toUpperCase(), tesseractConfidence, "visual_ocr");
  }

  if (!fields.fullName?.value && (fields.firstName?.value || fields.lastName?.value)) {
    const name = [fields.lastName?.value, fields.firstName?.value].filter(Boolean).join(" ");
    fields.fullName = makeField(
      name,
      Math.min(fields.lastName?.confidence ?? 1, fields.firstName?.confidence ?? 1),
      (fields.lastName ?? fields.firstName)?.source,
    );
  }

  if (!fields.documentType?.value) {
    const hasPassport = /PASSPORT|P<|PASSPORT\s*NO/i.test(upperText);
    const hasIdCard = /ID\s*CARD|IDENTITY\s*CARD|IDENTIFICATION|I<|NATIONAL\s*ID/i.test(upperText);
    if (hasPassport) {
      fields.documentType = makeField("PASSPORT", tesseractConfidence, "visual_ocr");
    } else if (hasIdCard) {
      fields.documentType = makeField("ID_CARD", tesseractConfidence, "visual_ocr");
    }
  }

  return fields;
}

export class LocalOCRProvider extends BaseOcrProvider {
  readonly name = "LocalOCR";
  readonly type = "LOCAL" as const;

  private worker: Worker | null = null;
  private workerPromise: Promise<Worker> | null = null;

  async processImage(imagePath: string, signal?: AbortSignal): Promise<OcrResult> {
    const startTime = performance.now();
    this.canceled = false;

    const cleanup = this.setupAbortSignal(signal);
    try {
      this.checkCanceled();

      const worker = await this.getWorker();

      this.checkCanceled();

      const imageSource = await this.resolveImageSource(imagePath);

      this.checkCanceled();

      logger.debug("LocalOCRProvider: starting recognition", {
        pathLength: imagePath.length,
      });

      const result: RecognizeResult = await worker.recognize(imageSource);

      this.checkCanceled();

      const rawText = result.data.text || "";
      const tesseractConfidence =
        result.data.confidence !== undefined ? result.data.confidence / 100 : DEFAULT_CONFIDENCE;

      const allTextLines = rawText.split("\n");
      const mrzCandidates = allTextLines.filter(isMrzLine);

      let fields: ExtractedFields;
      let hasMrz = false;

      if (mrzCandidates.length >= 2) {
        try {
          const cleanedLines = mrzCandidates.map((l) => l.replace(/\s/g, "").toUpperCase());
          const mrzResult = parseMrz(cleanedLines);

          const mrzConfidence = Math.min(tesseractConfidence + 0.1, 1);

          fields = {};

          if (mrzResult.fullName.value) {
            fields.fullName = makeField(mrzResult.fullName.value, mrzConfidence, "mrz");
          }
          if (mrzResult.surname.value) {
            fields.lastName = makeField(mrzResult.surname.value, mrzConfidence, "mrz");
          }
          if (mrzResult.givenName.value) {
            fields.firstName = makeField(mrzResult.givenName.value, mrzConfidence, "mrz");
          }
          if (mrzResult.dateOfBirth.value) {
            fields.dateOfBirth = makeField(mrzResult.dateOfBirth.value, mrzConfidence, "mrz");
          }
          if (mrzResult.gender.value) {
            fields.gender = makeField(normalizeGender(mrzResult.gender.value), mrzConfidence, "mrz");
          }
          if (mrzResult.nationality.value) {
            fields.nationality = makeField(mrzResult.nationality.value, mrzConfidence, "mrz");
          }
          if (mrzResult.passportNumber.value) {
            fields.passportNumber = makeField(mrzResult.passportNumber.value, mrzConfidence, "mrz");
          }
          if (mrzResult.documentType.value) {
            fields.documentType = makeField(normalizeDocumentType(mrzResult.documentType.value), mrzConfidence, "mrz");
          } else if (detectMrzFormat(cleanedLines) !== "UNKNOWN") {
            fields.documentType = makeField("PASSPORT", mrzConfidence, "mrz");
          }
          if (mrzResult.expiryDate.value) {
            fields.expiryDate = makeField(mrzResult.expiryDate.value, mrzConfidence, "mrz");
          }
          if (mrzResult.issuingCountry.value) {
            fields.issuingCountry = makeField(mrzResult.issuingCountry.value, mrzConfidence, "mrz");
          }
          if (mrzResult.optionalData.value) {
            fields.idNumber = makeField(mrzResult.optionalData.value, mrzConfidence, "mrz");
          }

          const mrzCode = cleanedLines.join("\n");
          fields.mrzCode = makeField(mrzCode, tesseractConfidence, "mrz");

          hasMrz = true;

          logger.debug("LocalOCRProvider: MRZ parsed successfully", {
            format: mrzResult.format,
            fullName: fields.fullName?.value?.replace(/./g, "*"),
          });
        } catch (parseError) {
          logger.warn("LocalOCRProvider: MRZ parsing failed, falling back to visual parsing", parseError);
          fields = parseVisualFields(rawText, tesseractConfidence);
        }
      } else {
        fields = parseVisualFields(rawText, tesseractConfidence);
      }

      if (!fields.fullName?.value && (fields.firstName?.value || fields.lastName?.value)) {
        const name = [fields.lastName?.value, fields.firstName?.value].filter(Boolean).join(" ");
        fields.fullName = makeField(
          name,
          Math.min(fields.lastName?.confidence ?? 1, fields.firstName?.confidence ?? 1),
          fields.firstName?.source ?? fields.lastName?.source,
        );
      }

      const overallConfidence = hasMrz ? tesseractConfidence : tesseractConfidence * 0.9;

      const overallConfidenceLevel = getConfidenceLevel(overallConfidence);

      const warnings = detectWarnings(fields, overallConfidence);
      if (!hasMrz) {
        warnings.push("MRZ_NOT_FOUND");
      }

      const detectedDocumentType = fields.documentType?.value
        ? normalizeDocumentType(fields.documentType.value)
        : undefined;

      const detectedGender = fields.gender?.value ? normalizeGender(fields.gender.value) : undefined;

      const isExpired = fields.expiryDate?.value ? checkDateExpired(fields.expiryDate.value) : undefined;

      return {
        fields,
        rawText,
        overallConfidence,
        overallConfidenceLevel,
        provider: "LOCAL",
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
      logger.error("LocalOCRProvider: processing failed", error);
      throw error;
    } finally {
      if (cleanup) cleanup();
    }
  }

  protected async checkAvailability(): Promise<boolean> {
    return this._isAvailable;
  }

  async destroy(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate().catch(() => {});
      this.worker = null;
      this.workerPromise = null;
    }
    await super.destroy();
  }

  private async getWorker(): Promise<Worker> {
    if (this.worker) return this.worker;
    if (this.workerPromise) return this.workerPromise;

    this.workerPromise = this.initWorker();
    return this.workerPromise;
  }

  private async initWorker(): Promise<Worker> {
    try {
      const worker = await createWorker("eng", undefined, {
        workerPath: undefined,
        corePath: undefined,
        langPath: undefined,
        gzip: true,
        logger: (msg) => {
          if (msg.status === "loading tesseract core") {
            logger.debug("LocalOCRProvider: loading Tesseract core");
          } else if (msg.status === "initializing tesseract") {
            logger.debug("LocalOCRProvider: initializing Tesseract engine");
          } else if (msg.status === "loading language traineddata") {
            logger.debug("LocalOCRProvider: loading language data");
          } else if (msg.status === "initializing api") {
            logger.debug("LocalOCRProvider: initializing API");
          }
        },
      });

      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
      });

      this.worker = worker;
      this._isAvailable = true;
      this.initialized = true;
      logger.info("LocalOCRProvider: initialized successfully");
      return worker;
    } catch (error) {
      this._isAvailable = false;
      this.workerPromise = null;
      logger.error("LocalOCRProvider: failed to initialize", error);
      throw error;
    }
  }

  private async resolveImageSource(imagePath: string): Promise<string> {
    if (imagePath.startsWith("data:") || imagePath.startsWith("blob:")) {
      return imagePath;
    }

    if (isTauri()) {
      try {
        const { convertFileSrc } = await import("@tauri-apps/api/tauri");
        return convertFileSrc(imagePath);
      } catch {
        logger.warn("LocalOCRProvider: failed to convert Tauri file path, trying raw path");
      }
    }

    if (imagePath.startsWith("http://") || imagePath.startsWith("https://") || imagePath.startsWith("file://")) {
      return imagePath;
    }

    try {
      const response = await fetch(imagePath);
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      logger.warn("LocalOCRProvider: could not convert image path, using as-is");
      return imagePath;
    }
  }
}
