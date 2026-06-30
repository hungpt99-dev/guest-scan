import { logger } from "../lib/logger";

export type MrzChecksumValidationResult = {
  passportNumberValid: boolean;
  dateOfBirthValid: boolean;
  expiryDateValid: boolean;
  optionalDataValid: boolean;
  finalCompositeValid: boolean;
  overallValid: boolean;
  errors: string[];
};

export interface MrzChecksumValidator {
  validateChecksums(lines: string[]): MrzChecksumValidationResult;
}

const WEIGHTS = [7, 3, 1];

function charValue(ch: string): number {
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

function validateCheckDigit(value: string, expected: string | undefined): boolean {
  if (!expected || expected === "<") return true;
  const computed = computeCheckDigit(value);
  const valid = computed === expected;
  if (!valid) {
    logger.debug("MrzChecksumValidator: check digit mismatch", {
      computed,
      expected,
      valueLength: value.length,
    });
  }
  return valid;
}

export function createMrzChecksumValidator(): MrzChecksumValidator {
  return new DefaultMrzChecksumValidator();
}

class DefaultMrzChecksumValidator implements MrzChecksumValidator {
  validateChecksums(lines: string[]): MrzChecksumValidationResult {
    const cleaned = lines.map((l) => l.trim()).filter(Boolean);
    const result: MrzChecksumValidationResult = {
      passportNumberValid: false,
      dateOfBirthValid: false,
      expiryDateValid: false,
      optionalDataValid: false,
      finalCompositeValid: false,
      overallValid: false,
      errors: [],
    };

    if (cleaned.length < 2) {
      result.errors.push("INSUFFICIENT_LINES");
      return result;
    }

    const line2 = cleaned[1]!;
    const l2 = line2.length;

    if (l2 >= 44) {
      return this.validateTd3(line2, result);
    }
    if (l2 >= 36) {
      return this.validateTd2(line2, result);
    }
    if (l2 >= 30) {
      const line3 = cleaned[2] || "";
      return this.validateTd1(line2, line3, result);
    }

    result.errors.push("UNKNOWN_FORMAT");
    return result;
  }

  private validateTd3(line2: string, result: MrzChecksumValidationResult): MrzChecksumValidationResult {
    const passportNumber = line2.slice(0, 9);
    const passportCd = line2[9] || "";
    const dob = line2.slice(13, 19);
    const dobCd = line2[19] || "";
    const expiry = line2.slice(21, 27);
    const expiryCd = line2[27] || "";
    const optional = line2.slice(28, 42);
    const optionalCd = line2[42] || "";
    const compositeInput = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43);
    const compositeCd = line2[43] || "";

    result.passportNumberValid = validateCheckDigit(passportNumber, passportCd);
    result.dateOfBirthValid = validateCheckDigit(dob, dobCd);
    result.expiryDateValid = validateCheckDigit(expiry, expiryCd);
    result.optionalDataValid = validateCheckDigit(optional, optionalCd);
    result.finalCompositeValid = validateCheckDigit(compositeInput, compositeCd);

    if (!result.passportNumberValid) result.errors.push("PASSPORT_NUMBER_CHECK_FAILED");
    if (!result.dateOfBirthValid) result.errors.push("DOB_CHECK_FAILED");
    if (!result.expiryDateValid) result.errors.push("EXPIRY_CHECK_FAILED");
    if (!result.optionalDataValid) result.errors.push("OPTIONAL_DATA_CHECK_FAILED");
    if (!result.finalCompositeValid) result.errors.push("FINAL_COMPOSITE_CHECK_FAILED");

    result.overallValid =
      result.passportNumberValid && result.dateOfBirthValid && result.expiryDateValid && result.finalCompositeValid;

    return result;
  }

  private validateTd2(line2: string, result: MrzChecksumValidationResult): MrzChecksumValidationResult {
    const passportNumber = line2.slice(0, 9);
    const passportCd = line2[9] || "";
    const dob = line2.slice(13, 19);
    const dobCd = line2[19] || "";
    const expiry = line2.slice(21, 27);
    const expiryCd = line2[27] || "";
    const optional = line2.slice(28, 35);
    const optionalCd = line2[35] || "";

    result.passportNumberValid = validateCheckDigit(passportNumber, passportCd);
    result.dateOfBirthValid = validateCheckDigit(dob, dobCd);
    result.expiryDateValid = validateCheckDigit(expiry, expiryCd);
    result.optionalDataValid = validateCheckDigit(optional, optionalCd);
    result.finalCompositeValid = result.passportNumberValid;

    if (!result.passportNumberValid) result.errors.push("PASSPORT_NUMBER_CHECK_FAILED");
    if (!result.dateOfBirthValid) result.errors.push("DOB_CHECK_FAILED");
    if (!result.expiryDateValid) result.errors.push("EXPIRY_CHECK_FAILED");
    if (!result.optionalDataValid) result.errors.push("OPTIONAL_DATA_CHECK_FAILED");

    result.overallValid = result.passportNumberValid && result.dateOfBirthValid && result.expiryDateValid;

    return result;
  }

  private validateTd1(line2: string, _line3: string, result: MrzChecksumValidationResult): MrzChecksumValidationResult {
    const passportNumber = line2.slice(0, 9);
    const passportCd = line2[9] || "";
    const dob = line2.slice(13, 19);
    const dobCd = line2[19] || "";
    const expiry = line2.slice(21, 27);
    const expiryCd = line2[27] || "";
    const compositeInput = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 28);

    result.passportNumberValid = validateCheckDigit(passportNumber, passportCd);
    result.dateOfBirthValid = validateCheckDigit(dob, dobCd);
    result.expiryDateValid = validateCheckDigit(expiry, expiryCd);
    result.optionalDataValid = true;

    let compositeCd = true;
    if (line2.length >= 30) {
      const compositeCandidate = line2[29];
      if (compositeCandidate && compositeCandidate !== "<") {
        compositeCd = validateCheckDigit(compositeInput, compositeCandidate);
      }
    }
    result.finalCompositeValid = compositeCd;

    if (!result.passportNumberValid) result.errors.push("PASSPORT_NUMBER_CHECK_FAILED");
    if (!result.dateOfBirthValid) result.errors.push("DOB_CHECK_FAILED");
    if (!result.expiryDateValid) result.errors.push("EXPIRY_CHECK_FAILED");
    if (!result.finalCompositeValid) result.errors.push("FINAL_COMPOSITE_CHECK_FAILED");

    result.overallValid =
      result.passportNumberValid && result.dateOfBirthValid && result.expiryDateValid && result.finalCompositeValid;

    return result;
  }
}
