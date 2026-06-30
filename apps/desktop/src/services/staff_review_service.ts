import type { NormalizedFields } from "./field_normalization_service";
import type { FieldConfidenceScores } from "./ocr_confidence_service";
import { logger } from "../lib/logger";

export type EditableFields = {
  fullName: string;
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  nationality: string;
  countryCode: string;
  documentType: string;
  documentNumber: string;
  passportNumber: string;
  idNumber: string;
  issueDate: string;
  expiryDate: string;
  issuingCountry: string;
};

export type ConfirmedFields = {
  fields: NormalizedFields;
  edits: EditableFields;
  original: NormalizedFields;
  lowConfidenceFields: string[];
  confirmedAt: string;
  confirmedBy: "STAFF";
};

export type PendingReview = {
  fields: NormalizedFields;
  confidence: FieldConfidenceScores;
  lowConfidenceFields: string[];
  edits: EditableFields;
  confirmed: boolean;
};

export interface StaffReviewService {
  reviewResult(fields: NormalizedFields, confidence: FieldConfidenceScores): Promise<PendingReview>;

  editField(pending: PendingReview, fieldName: keyof EditableFields, value: string): Promise<PendingReview>;

  confirmResult(pending: PendingReview): Promise<ConfirmedFields>;

  cancelReview(pending: PendingReview): void;
}

const LOW_CONFIDENCE_LEVELS = ["LOW", "MEDIUM"] as const;

function identifyLowConfidenceFields(confidence: FieldConfidenceScores): string[] {
  const low: string[] = [];
  for (const [field, score] of Object.entries(confidence)) {
    if (LOW_CONFIDENCE_LEVELS.includes(score.level as (typeof LOW_CONFIDENCE_LEVELS)[number])) {
      low.push(field);
    }
  }
  return low;
}

function fieldsToEditable(fields: NormalizedFields): EditableFields {
  return {
    fullName: fields.fullName,
    firstName: fields.firstName,
    lastName: fields.lastName,
    gender: fields.gender,
    dateOfBirth: fields.dateOfBirth,
    nationality: fields.nationality,
    countryCode: fields.countryCode,
    documentType: fields.documentType,
    documentNumber: fields.documentNumber,
    passportNumber: fields.passportNumber,
    idNumber: fields.idNumber,
    issueDate: fields.issueDate,
    expiryDate: fields.expiryDate,
    issuingCountry: fields.issuingCountry,
  };
}

function mergeEditsIntoFields(original: NormalizedFields, edits: EditableFields): NormalizedFields {
  return {
    ...original,
    fullName: edits.fullName,
    firstName: edits.firstName,
    lastName: edits.lastName,
    gender: edits.gender as NormalizedFields["gender"],
    dateOfBirth: edits.dateOfBirth,
    nationality: edits.nationality,
    countryCode: edits.countryCode,
    documentType: edits.documentType as NormalizedFields["documentType"],
    documentNumber: edits.documentNumber,
    passportNumber: edits.passportNumber,
    idNumber: edits.idNumber,
    issueDate: edits.issueDate,
    expiryDate: edits.expiryDate,
    issuingCountry: edits.issuingCountry,
  };
}

export function createStaffReviewService(): StaffReviewService {
  return new DefaultStaffReviewService();
}

class DefaultStaffReviewService implements StaffReviewService {
  async reviewResult(fields: NormalizedFields, confidence: FieldConfidenceScores): Promise<PendingReview> {
    const lowConfidenceFields = identifyLowConfidenceFields(confidence);

    logger.info("StaffReviewService: OCR result ready for review", {
      lowConfidenceFieldCount: lowConfidenceFields.length,
      lowConfidenceFields,
    });

    const edits = fieldsToEditable(fields);

    return {
      fields,
      confidence,
      lowConfidenceFields,
      edits,
      confirmed: false,
    };
  }

  async editField(pending: PendingReview, fieldName: keyof EditableFields, value: string): Promise<PendingReview> {
    if (pending.confirmed) {
      logger.warn("StaffReviewService: attempted to edit already confirmed result");
      return pending;
    }

    const maskedValue = fieldName.toLowerCase().includes("number") ? value.slice(0, 3) + "***" : value;

    logger.info("StaffReviewService: staff edited field", {
      field: fieldName,
      newValue: maskedValue,
    });

    return {
      ...pending,
      edits: {
        ...pending.edits,
        [fieldName]: value,
      },
    };
  }

  async confirmResult(pending: PendingReview): Promise<ConfirmedFields> {
    const mergedFields = mergeEditsIntoFields(pending.fields, pending.edits);

    const hasEdits = Object.keys(pending.edits).some(
      (key) =>
        pending.edits[key as keyof EditableFields] !== fieldsToEditable(pending.fields)[key as keyof EditableFields],
    );

    if (hasEdits) {
      logger.info("StaffReviewService: staff confirmed with edits", {
        lowConfidenceFields: pending.lowConfidenceFields,
      });
    } else {
      logger.info("StaffReviewService: staff confirmed without edits");
    }

    return {
      fields: mergedFields,
      edits: { ...pending.edits },
      original: { ...pending.fields },
      lowConfidenceFields: [...pending.lowConfidenceFields],
      confirmedAt: new Date().toISOString(),
      confirmedBy: "STAFF",
    };
  }

  cancelReview(pending: PendingReview): void {
    logger.info("StaffReviewService: staff cancelled review", {
      lowConfidenceFieldCount: pending.lowConfidenceFields.length,
    });
  }
}
