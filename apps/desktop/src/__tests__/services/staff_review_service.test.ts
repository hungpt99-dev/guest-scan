import { describe, it, expect } from "vitest";
import { createStaffReviewService } from "../../services/staff_review_service";
import type { FieldConfidenceScores } from "../../services/ocr_confidence_service";
import type { NormalizedFields } from "../../services/field_normalization_service";

function makeFields(overrides: Partial<NormalizedFields> = {}): NormalizedFields {
  return {
    fullName: "JOHN DOE",
    firstName: "JOHN",
    lastName: "DOE",
    gender: "M",
    dateOfBirth: "1990-01-15",
    nationality: "USA",
    countryCode: "USA",
    documentType: "PASSPORT",
    documentNumber: "AB1234567",
    passportNumber: "AB1234567",
    idNumber: "",
    issueDate: "2020-06-01",
    expiryDate: "2030-06-01",
    issuingCountry: "USA",
    mrzRaw: "P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<\nAB1234567<USA9001155M3006017<<<<<<<<",
    mrzParsed: ["P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<", "AB1234567<USA9001155M3006017<<<<<<<<"],
    rawOriginal: {
      fullName: "JOHN DOE",
      surname: "DOE",
      givenName: "JOHN",
      gender: "M",
      dateOfBirth: "900115",
      nationality: "USA",
      issuingCountry: "USA",
      documentType: "P",
      passportNumber: "AB1234567",
      documentNumber: "AB1234567",
      idNumber: "",
      issueDate: "",
      expiryDate: "300601",
      mrzRaw: "P<USADOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<\nAB1234567<USA9001155M3006017<<<<<<<<",
    },
    ...overrides,
  };
}

function makeHighConfidence(): FieldConfidenceScores {
  return {
    fullName: { score: 0.95, level: "HIGH", issues: [] },
    firstName: { score: 0.95, level: "HIGH", issues: [] },
    lastName: { score: 0.95, level: "HIGH", issues: [] },
    gender: { score: 0.95, level: "HIGH", issues: [] },
    dateOfBirth: { score: 0.95, level: "HIGH", issues: [] },
    nationality: { score: 0.95, level: "HIGH", issues: [] },
    countryCode: { score: 0.95, level: "HIGH", issues: [] },
    documentType: { score: 0.95, level: "HIGH", issues: [] },
    documentNumber: { score: 0.95, level: "HIGH", issues: [] },
    passportNumber: { score: 0.95, level: "HIGH", issues: [] },
    idNumber: { score: 0.0, level: "LOW", issues: ["Field is empty"] },
    issueDate: { score: 0.95, level: "HIGH", issues: [] },
    expiryDate: { score: 0.95, level: "HIGH", issues: [] },
    issuingCountry: { score: 0.95, level: "HIGH", issues: [] },
    mrzRaw: { score: 0.92, level: "HIGH", issues: [] },
  };
}

function makeMixedConfidence(): FieldConfidenceScores {
  return {
    fullName: { score: 0.55, level: "LOW", issues: ["Low overall OCR confidence"] },
    firstName: { score: 0.55, level: "LOW", issues: ["Low overall OCR confidence"] },
    lastName: { score: 0.95, level: "HIGH", issues: [] },
    gender: { score: 0.7, level: "MEDIUM", issues: [] },
    dateOfBirth: { score: 0.95, level: "HIGH", issues: [] },
    nationality: { score: 0.6, level: "MEDIUM", issues: ["Invalid country code"] },
    countryCode: { score: 0.6, level: "MEDIUM", issues: ["Invalid country code"] },
    documentType: { score: 0.95, level: "HIGH", issues: [] },
    documentNumber: { score: 0.85, level: "HIGH", issues: [] },
    passportNumber: { score: 0.85, level: "HIGH", issues: [] },
    idNumber: { score: 0.4, level: "LOW", issues: ["Field is empty"] },
    issueDate: { score: 0.95, level: "HIGH", issues: [] },
    expiryDate: { score: 0.95, level: "HIGH", issues: [] },
    issuingCountry: { score: 0.6, level: "MEDIUM", issues: ["Invalid country code"] },
    mrzRaw: { score: 0.92, level: "HIGH", issues: [] },
  };
}

describe("StaffReviewService", () => {
  const service = createStaffReviewService();

  describe("reviewResult", () => {
    it("creates a pending review with fields and confidence", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      expect(pending.fields).toEqual(fields);
      expect(pending.confidence).toEqual(confidence);
      expect(pending.confirmed).toBe(false);
    });

    it("identifies low-confidence fields from HIGH confidence", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      expect(pending.lowConfidenceFields).toContain("idNumber");
      expect(pending.lowConfidenceFields).not.toContain("fullName");
      expect(pending.lowConfidenceFields).not.toContain("expiryDate");
    });

    it("identifies LOW and MEDIUM confidence fields", async () => {
      const fields = makeFields();
      const confidence = makeMixedConfidence();
      const pending = await service.reviewResult(fields, confidence);

      expect(pending.lowConfidenceFields).toContain("fullName");
      expect(pending.lowConfidenceFields).toContain("gender");
      expect(pending.lowConfidenceFields).toContain("nationality");
      expect(pending.lowConfidenceFields).toContain("countryCode");
      expect(pending.lowConfidenceFields).toContain("idNumber");
      expect(pending.lowConfidenceFields).toContain("issuingCountry");
      expect(pending.lowConfidenceFields).not.toContain("lastName");
      expect(pending.lowConfidenceFields).not.toContain("expiryDate");
    });

    it("initializes edits with original field values", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      expect(pending.edits.fullName).toBe("JOHN DOE");
      expect(pending.edits.firstName).toBe("JOHN");
      expect(pending.edits.lastName).toBe("DOE");
      expect(pending.edits.gender).toBe("M");
      expect(pending.edits.dateOfBirth).toBe("1990-01-15");
      expect(pending.edits.passportNumber).toBe("AB1234567");
      expect(pending.edits.expiryDate).toBe("2030-06-01");
    });
  });

  describe("editField", () => {
    it("allows editing a field value", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      const updated = await service.editField(pending, "fullName", "JOHN M DOE");
      expect(updated.edits.fullName).toBe("JOHN M DOE");
      expect(updated.edits.firstName).toBe("JOHN");
    });

    it("rejects edit after confirmation", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);
      const confirmedPending = { ...pending, confirmed: true };

      const result = await service.editField(confirmedPending, "fullName", "CHANGED");
      expect(result.edits.fullName).toBe("JOHN DOE");
    });
  });

  describe("confirmResult", () => {
    it("returns ConfirmedFields with merged edits", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      const edited = await service.editField(pending, "fullName", "JOHN M DOE");
      const confirmed = await service.confirmResult(edited);

      expect(confirmed.fields.fullName).toBe("JOHN M DOE");
      expect(confirmed.fields.firstName).toBe("JOHN");
      expect(confirmed.original.fullName).toBe("JOHN DOE");
      expect(confirmed.edits.fullName).toBe("JOHN M DOE");
    });

    it("preserves original fields in confirmed result", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      const confirmed = await service.confirmResult(pending);

      expect(confirmed.original).toEqual(fields);
    });

    it("sets confirmedAt to a valid ISO string", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      const confirmed = await service.confirmResult(pending);

      expect(confirmed.confirmedAt).toBeTruthy();
      expect(() => new Date(confirmed.confirmedAt)).not.toThrow();
      expect(new Date(confirmed.confirmedAt).toISOString()).toBe(confirmed.confirmedAt);
    });

    it("sets confirmedBy to STAFF", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      const confirmed = await service.confirmResult(pending);

      expect(confirmed.confirmedBy).toBe("STAFF");
    });

    it("includes lowConfidenceFields in confirmed result", async () => {
      const fields = makeFields();
      const confidence = makeMixedConfidence();
      const pending = await service.reviewResult(fields, confidence);

      const confirmed = await service.confirmResult(pending);

      expect(confirmed.lowConfidenceFields).toContain("fullName");
      expect(confirmed.lowConfidenceFields).toContain("gender");
      expect(confirmed.lowConfidenceFields).toContain("nationality");
    });

    it("merges edits into fields for all editable fields", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      const edited = await service.editField(pending, "firstName", "JOHNNY");
      const edited2 = await service.editField(edited, "lastName", "DOE JR");
      const edited3 = await service.editField(edited2, "dateOfBirth", "1990-02-15");
      const confirmed = await service.confirmResult(edited3);

      expect(confirmed.fields.firstName).toBe("JOHNNY");
      expect(confirmed.fields.lastName).toBe("DOE JR");
      expect(confirmed.fields.dateOfBirth).toBe("1990-02-15");
    });
  });

  describe("cancelReview", () => {
    it("does not throw when cancelling", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      expect(() => service.cancelReview(pending)).not.toThrow();
    });

    it("does not confirm the pending review after cancel", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      service.cancelReview(pending);

      expect((pending as { confirmed: boolean }).confirmed).toBe(false);
    });
  });

  describe("no auto-save without confirmation", () => {
    it("reviewResult returns confirmed=false", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      expect(pending.confirmed).toBe(false);
    });

    it("ConfirmedFields can only be obtained via confirmResult", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      const confirmed = await service.confirmResult(pending);

      expect(confirmed).toHaveProperty("confirmedAt");
      expect(confirmed).toHaveProperty("confirmedBy");
      expect(confirmed.confirmedBy).toBe("STAFF");
    });

    it("confirmed fields are distinct from the pending review", async () => {
      const fields = makeFields();
      const confidence = makeHighConfidence();
      const pending = await service.reviewResult(fields, confidence);

      const confirmed = await service.confirmResult(pending);

      expect(confirmed).not.toBe(pending);
      expect(confirmed.fields).not.toBe(pending.fields);
    });
  });
});
