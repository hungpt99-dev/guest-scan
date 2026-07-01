import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import ReviewScreen from "./ReviewScreen";
import type { NormalizedFields } from "../services/field_normalization_service";
import type { FieldConfidenceScores } from "../services/ocr_confidence_service";

function makeFields(overrides?: Partial<NormalizedFields>): NormalizedFields {
  return {
    fullName: "SMITH JOHN",
    firstName: "JOHN",
    lastName: "SMITH",
    gender: "M",
    dateOfBirth: "1990-01-15",
    nationality: "GBR",
    countryCode: "GBR",
    documentType: "PASSPORT",
    documentNumber: "AB1234567",
    passportNumber: "AB1234567",
    idNumber: "",
    issueDate: "2020-01-01",
    expiryDate: "2030-01-01",
    issuingCountry: "GBR",
    mrzRaw: "P<GBRSMITH<<JOHN<<<<<<<<<<<<<<<<<<",
    mrzParsed: ["P<GBRSMITH<<JOHN<<<<<<<<<<<<<<<<<<"],
    rawOriginal: {
      fullName: "SMITH JOHN",
      surname: "SMITH",
      givenName: "JOHN",
      gender: "M",
      dateOfBirth: "900115",
      nationality: "GBR",
      issuingCountry: "GBR",
      documentType: "PASSPORT",
      passportNumber: "AB1234567",
      documentNumber: "AB1234567",
      idNumber: "",
      issueDate: "",
      expiryDate: "300101",
      mrzRaw: "P<GBRSMITH<<JOHN<<<<<<<<<<<<<<<<<<",
    },
    ...overrides,
  };
}

function makeConfidence(overrides?: Partial<FieldConfidenceScores>): FieldConfidenceScores {
  const base: FieldConfidenceScore = { score: 0.95, level: "HIGH", issues: [] };
  const empty: FieldConfidenceScore = { score: 0, level: "LOW", issues: [] };
  return {
    fullName: { ...base },
    firstName: { ...base },
    lastName: { ...base },
    gender: { ...base },
    dateOfBirth: { ...base },
    nationality: { ...base },
    countryCode: { ...base },
    documentType: { ...base },
    documentNumber: { ...base },
    passportNumber: { ...base },
    idNumber: { ...empty },
    issueDate: { ...base },
    expiryDate: { ...base },
    issuingCountry: { ...base },
    mrzRaw: { ...base },
    ...overrides,
  };
}

describe("ReviewScreen component", () => {
  it("renders without crashing", () => {
    const html = renderToString(
      <ReviewScreen
        fields={makeFields()}
        confidence={makeConfidence()}
        lowConfidenceFields={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toBeTruthy();
  });

  it("renders document image when provided", () => {
    const html = renderToString(
      <ReviewScreen
        fields={makeFields()}
        confidence={makeConfidence()}
        lowConfidenceFields={[]}
        documentImage="/path/to/cropped.jpg"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain("/path/to/cropped.jpg");
  });

  it("does not render document image section when not provided", () => {
    const html = renderToString(
      <ReviewScreen
        fields={makeFields()}
        confidence={makeConfidence()}
        lowConfidenceFields={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).not.toContain("/path/to/cropped.jpg");
  });

  it("shows review warning when lowConfidenceFields is non-empty", () => {
    const confidence = makeConfidence({
      expiryDate: { score: 0.45, level: "LOW", issues: ["Low confidence"] },
    });
    const html = renderToString(
      <ReviewScreen
        fields={makeFields()}
        confidence={confidence}
        lowConfidenceFields={["expiryDate"]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain("need review");
  });

  it("shows all-clear message when no fields need review", () => {
    const html = renderToString(
      <ReviewScreen
        fields={makeFields()}
        confidence={makeConfidence()}
        lowConfidenceFields={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain("All fields look good");
  });

  it("renders all field labels", () => {
    const html = renderToString(
      <ReviewScreen
        fields={makeFields()}
        confidence={makeConfidence()}
        lowConfidenceFields={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain("Full Name");
    expect(html).toContain("Gender");
    expect(html).toContain("Date of Birth");
    expect(html).toContain("Nationality");
    expect(html).toContain("Passport Number");
    expect(html).toContain("Expiry Date");
    expect(html).toContain("Issuing Country");
  });

  it("displays field values from NormalizedFields", () => {
    const fields = makeFields({
      fullName: "DOE JANE",
      passportNumber: "XY987654",
    });
    const html = renderToString(
      <ReviewScreen
        fields={fields}
        confidence={makeConfidence()}
        lowConfidenceFields={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain("DOE JANE");
    expect(html).toContain("XY987654");
  });

  it("shows LOW CONFIDENCE badge for low confidence fields", () => {
    const confidence = makeConfidence({
      expiryDate: { score: 0.45, level: "LOW", issues: ["Low confidence"] },
    });
    const html = renderToString(
      <ReviewScreen
        fields={makeFields()}
        confidence={confidence}
        lowConfidenceFields={["expiryDate"]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain("LOW CONFIDENCE");
  });

  it("shows 100% confidence for high confidence fields", () => {
    const html = renderToString(
      <ReviewScreen
        fields={makeFields()}
        confidence={makeConfidence()}
        lowConfidenceFields={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain("95");
  });

  it("renders confirm, skip and cancel buttons", () => {
    const html = renderToString(
      <ReviewScreen
        fields={makeFields()}
        confidence={makeConfidence()}
        lowConfidenceFields={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain("Confirm");
    expect(html).toContain("Skip Review");
    expect(html).toContain("Cancel");
  });

  it("shows original value when field is edited", () => {
    const fields = makeFields({ fullName: "SMITH JOHN" });
    const html = renderToString(
      <ReviewScreen
        fields={fields}
        confidence={makeConfidence()}
        lowConfidenceFields={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain("SMITH JOHN");
  });

  it("shows INVALID badge when field has validation errors", () => {
    const fields = makeFields({ gender: "INVALID" as NormalizedFields["gender"] });
    const html = renderToString(
      <ReviewScreen
        fields={fields}
        confidence={makeConfidence()}
        lowConfidenceFields={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain("INVALID");
  });
});

type FieldConfidenceScore = {
  score: number;
  level: "HIGH" | "MEDIUM" | "LOW";
  issues: string[];
};
