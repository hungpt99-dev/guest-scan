import { logger } from "../lib/logger";

export type MrzParseResult = {
  documentType: string;
  issuingCountry: string;
  surname: string;
  givenName: string;
  fullName: string;
  passportNumber: string;
  nationality: string;
  dateOfBirth: string;
  gender: string;
  expiryDate: string;
  optionalData: string;
  checkDigits: Record<string, boolean>;
  mrzLines: string[];
};

export type MrzParserError = "MRZ_FORMAT_UNKNOWN" | "MRZ_PARSE_FAILED";

export interface MrzParserService {
  parseMrzLines(lines: string[]): MrzParseResult;
}

const WEIGHTS = [7, 3, 1];

function charValue(ch: string | undefined): number {
  if (ch === undefined) return 0;
  if (ch >= "0" && ch <= "9") return parseInt(ch, 10);
  if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 65 + 10;
  if (ch === "<") return 0;
  return 0;
}

function computeCheckDigit(value: string): string {
  let total = 0;
  for (let i = 0; i < value.length; i++) {
    total += charValue(value[i] ?? "") * (WEIGHTS[i % 3] ?? 1);
  }
  return String(total % 10);
}

function validateCheckDigit(value: string, expected: string): boolean {
  if (expected === "<") return true;
  const computed = computeCheckDigit(value);
  return computed === expected;
}

function parseNameField(nameField: string): {
  surname: string;
  givenName: string;
  fullName: string;
} {
  const parts = nameField.split("<<");
  const surname = (parts[0] || "").replace(/</g, " ").trim();
  const givenRaw = parts.slice(1).join("<");
  const givenName = givenRaw.replace(/</g, " ").trim();
  const fullName = [surname, givenName].filter(Boolean).join(" ");
  return { surname, givenName, fullName };
}

function parseMrzDate(mrzDate: string): string {
  if (!mrzDate || (mrzDate.match(/</g) || []).length > 2) return "";
  const clean = mrzDate.replace(/</g, "0");
  if (clean.length !== 6) return "";
  const year = parseInt(clean.slice(0, 2), 10);
  const month = parseInt(clean.slice(2, 4), 10);
  const day = parseInt(clean.slice(4, 6), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const fullYear = year <= 49 ? 2000 + year : 1900 + year;
  return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function detectFormat(lines: string[]): string | null {
  const l1 = (lines[0] || "").length;
  const l2 = (lines[1] || "").length;
  const l3 = (lines[2] || "").length;
  if (l1 >= 44 && l2 >= 44) return "TD3";
  if (l1 >= 36 && l2 >= 36) return "TD2";
  if (l1 >= 30 && l2 >= 30 && l3 >= 30) return "TD1";
  if (l1 >= 30 && l2 >= 30) return "TD1";
  return null;
}

function emptyResult(): MrzParseResult {
  return {
    documentType: "PASSPORT",
    issuingCountry: "",
    surname: "",
    givenName: "",
    fullName: "",
    passportNumber: "",
    nationality: "",
    dateOfBirth: "",
    gender: "UNKNOWN",
    expiryDate: "",
    optionalData: "",
    checkDigits: {},
    mrzLines: [],
  };
}

function parseTd3(line1: string, line2: string): MrzParseResult {
  const result = emptyResult();
  result.mrzLines = [line1, line2];
  result.documentType = line1.startsWith("I<") || line1.startsWith("ID") ? "ID_CARD" : "PASSPORT";

  if (line1.length >= 5) result.issuingCountry = line1.slice(2, 5).replace(/</g, "");
  const nameResult = parseNameField(line1.length >= 44 ? line1.slice(5, 44) : line1.slice(5));
  result.surname = nameResult.surname;
  result.givenName = nameResult.givenName;
  result.fullName = nameResult.fullName;

  if (line2.length >= 44) {
    result.passportNumber = line2.slice(0, 9).replace(/</g, "");
    result.nationality = line2.slice(10, 13);
    result.dateOfBirth = parseMrzDate(line2.slice(13, 19));
    const genderRaw = line2[20];
    result.gender = genderRaw === "M" ? "M" : genderRaw === "F" ? "F" : "UNKNOWN";
    result.expiryDate = parseMrzDate(line2.slice(21, 27));
    result.optionalData = line2.slice(28, 42).replace(/</g, "").trim();

    const passportCd = validateCheckDigit(line2.slice(0, 9), line2[9] || "");
    const dobCd = validateCheckDigit(line2.slice(13, 19), line2[19] || "");
    const expiryCd = validateCheckDigit(line2.slice(21, 27), line2[27] || "");
    const optionalCd = validateCheckDigit(line2.slice(28, 42), line2[42] || "");
    const compositeInput = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43);
    const compositeCd = validateCheckDigit(compositeInput, line2[43] || "");

    result.checkDigits = {
      passport_number_valid: passportCd,
      date_of_birth_valid: dobCd,
      expiry_date_valid: expiryCd,
      optional_data_valid: optionalCd,
      final_composite_valid: compositeCd,
      overall_valid: passportCd && dobCd && expiryCd && compositeCd,
    };
  }

  return result;
}

function parseTd2(line1: string, line2: string): MrzParseResult {
  const result = emptyResult();
  result.mrzLines = [line1, line2];
  result.documentType = line1.startsWith("I<") || line1.startsWith("ID") ? "ID_CARD" : "PASSPORT";

  if (line1.length >= 5) result.issuingCountry = line1.slice(2, 5).replace(/</g, "");
  const nameResult = parseNameField(line1.length >= 36 ? line1.slice(5, 36) : line1.slice(5));
  result.surname = nameResult.surname;
  result.givenName = nameResult.givenName;
  result.fullName = nameResult.fullName;

  if (line2.length >= 36) {
    result.passportNumber = line2.slice(0, 9).replace(/</g, "");
    result.nationality = line2.slice(10, 13);
    result.dateOfBirth = parseMrzDate(line2.slice(13, 19));
    const genderRaw = line2[20];
    result.gender = genderRaw === "M" ? "M" : genderRaw === "F" ? "F" : "UNKNOWN";
    result.expiryDate = parseMrzDate(line2.slice(21, 27));
    result.optionalData = line2.slice(28, 35).replace(/</g, "").trim();

    const passportCd = validateCheckDigit(line2.slice(0, 9), line2[9] || "");
    const dobCd = validateCheckDigit(line2.slice(13, 19), line2[19] || "");
    const expiryCd = validateCheckDigit(line2.slice(21, 27), line2[27] || "");
    const optionalCd = validateCheckDigit(line2.slice(28, 35), line2[35] || "");

    result.checkDigits = {
      passport_number_valid: passportCd,
      date_of_birth_valid: dobCd,
      expiry_date_valid: expiryCd,
      optional_data_valid: optionalCd,
      final_composite_valid: true,
      overall_valid: passportCd && dobCd && expiryCd,
    };
  }

  return result;
}

function parseTd1(line1: string, line2: string, line3: string): MrzParseResult {
  const result = emptyResult();
  result.mrzLines = [line1, line2, line3];
  result.documentType = line1.startsWith("I<") || line1.startsWith("ID") ? "ID_CARD" : "PASSPORT";

  if (line1.length >= 5) result.issuingCountry = line1.slice(2, 5).replace(/</g, "");
  const nameResult = parseNameField(line1.length >= 30 ? line1.slice(5, 30) : line1.slice(5));
  result.surname = nameResult.surname;
  result.givenName = nameResult.givenName;
  result.fullName = nameResult.fullName;

  if (line2.length >= 30) {
    result.passportNumber = line2.slice(0, 9).replace(/</g, "");
    result.nationality = line2.slice(10, 13);
    result.dateOfBirth = parseMrzDate(line2.slice(13, 19));
    const genderRaw = line2[20];
    result.gender = genderRaw === "M" ? "M" : genderRaw === "F" ? "F" : "UNKNOWN";
    result.expiryDate = parseMrzDate(line2.slice(21, 27));
    result.optionalData = (line2.slice(28, 30) + (line3 || "")).replace(/</g, " ").trim();

    const passportCd = validateCheckDigit(line2.slice(0, 9), line2[9] || "");
    const dobCd = validateCheckDigit(line2.slice(13, 19), line2[19] || "");
    const expiryCd = validateCheckDigit(line2.slice(21, 27), line2[27] || "");
    const compositeInput = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 28);
    let compositeCd = true;
    if (line2.length >= 30) {
      const compositeCandidate = line2[29];
      if (compositeCandidate && compositeCandidate !== "<") {
        compositeCd = validateCheckDigit(compositeInput, compositeCandidate);
      }
    }

    result.checkDigits = {
      passport_number_valid: passportCd,
      date_of_birth_valid: dobCd,
      expiry_date_valid: expiryCd,
      optional_data_valid: true,
      final_composite_valid: compositeCd,
      overall_valid: passportCd && dobCd && expiryCd && compositeCd,
    };
  }

  return result;
}

export function createMrzParserService(): MrzParserService {
  return new DefaultMrzParserService();
}

class DefaultMrzParserService implements MrzParserService {
  parseMrzLines(lines: string[]): MrzParseResult {
    const cleanedLines = lines.map((l) => l.trim()).filter(Boolean);

    if (cleanedLines.length < 2) {
      logger.warn("MrzParserService: fewer than 2 MRZ lines provided", {
        count: cleanedLines.length,
      });
      const result = emptyResult();
      result.mrzLines = cleanedLines;
      return result;
    }

    const format = detectFormat(cleanedLines);
    if (!format) {
      logger.warn("MrzParserService: unknown MRZ format");
      const result = emptyResult();
      result.mrzLines = cleanedLines;
      return result;
    }

    logger.debug("MrzParserService: detected format", { format });

    switch (format) {
      case "TD3":
        return parseTd3(cleanedLines[0]!, cleanedLines[1]!);
      case "TD2":
        return parseTd2(cleanedLines[0]!, cleanedLines[1]!);
      case "TD1":
        return parseTd1(cleanedLines[0]!, cleanedLines[1]!, cleanedLines[2] || "");
      default:
        return emptyResult();
    }
  }
}
