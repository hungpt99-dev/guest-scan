export type MrzFormat = "TD1" | "TD2" | "TD3" | "UNKNOWN";

export type MrzFieldResult = {
  value: string;
  raw: string;
  corrected: boolean;
  valid: boolean;
};

export type MrzCorrection = {
  field: string;
  from: string;
  to: string;
  reason: string;
};

export type MrzParseResult = {
  format: MrzFormat;
  documentType: MrzFieldResult;
  issuingCountry: MrzFieldResult;
  surname: MrzFieldResult;
  givenName: MrzFieldResult;
  fullName: MrzFieldResult;
  passportNumber: MrzFieldResult;
  nationality: MrzFieldResult;
  dateOfBirth: MrzFieldResult;
  gender: MrzFieldResult;
  expiryDate: MrzFieldResult;
  optionalData: MrzFieldResult;
  checkDigits: Record<string, boolean>;
  overallValid: boolean;
  corrections: MrzCorrection[];
  mrzLines: string[];
};

export type MrzParserOptions = {
  correctOcrErrors?: boolean;
  validateChecksums?: boolean;
  centuryBreak?: number;
};

const WEIGHTS = [7, 3, 1];
const DEFAULT_OPTIONS: Required<MrzParserOptions> = {
  correctOcrErrors: true,
  validateChecksums: true,
  centuryBreak: 49,
};

const AMBIGUOUS_PAIRS: Array<[string, string]> = [
  ["O", "0"],
  ["0", "O"],
  ["I", "1"],
  ["1", "I"],
];

function charValue(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "A" && ch <= "Z") return ch.charCodeAt(0) - 55;
  if (ch === "<") return 0;
  return 0;
}

function computeCheckDigit(value: string): string {
  let total = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i] ?? "";
    total += charValue(ch) * WEIGHTS[i % 3]!;
  }
  return String(total % 10);
}

export function hasAmbiguousChars(value: string): boolean {
  return /[O0I1]/.test(value);
}

function getAmbiguousPositions(value: string): number[] {
  const positions: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch && /[O0I1]/.test(ch)) {
      positions.push(i);
    }
  }
  return positions;
}

function* generateSubstitutions(value: string, positions: number[]): Generator<string> {
  if (positions.length === 0) return;

  for (const pos of positions) {
    const ch = value[pos];
    if (!ch) continue;
    for (const pair of AMBIGUOUS_PAIRS) {
      if (ch === pair[0]) {
        yield value.slice(0, pos) + pair[1] + value.slice(pos + 1);
      }
    }
  }
}

function correctFieldWithCheckDigit(
  rawValue: string,
  expectedCheckDigit: string,
  fieldName: string,
): { value: string; corrected: boolean; correction?: MrzCorrection } {
  const digit = computeCheckDigit(rawValue);
  if (digit === expectedCheckDigit || expectedCheckDigit === "<" || expectedCheckDigit === "") {
    return { value: rawValue, corrected: false };
  }

  if (!hasAmbiguousChars(rawValue)) {
    return { value: rawValue, corrected: false };
  }

  const positions = getAmbiguousPositions(rawValue);
  for (const candidate of generateSubstitutions(rawValue, positions)) {
    const candidateDigit = computeCheckDigit(candidate);
    if (candidateDigit === expectedCheckDigit) {
      return {
        value: candidate,
        corrected: true,
        correction: { field: fieldName, from: rawValue, to: candidate, reason: "checksum_fix" },
      };
    }
  }

  return { value: rawValue, corrected: false };
}

function correctNameField(rawValue: string): { value: string; corrected: boolean; correction?: MrzCorrection } {
  let corrected = false;
  let value = rawValue;

  if (/[0]/.test(value) && /[O]/.test(value)) {
    value = value.replace(/0/g, "O");
    corrected = true;
  } else if (/[0]/.test(value)) {
    value = value.replace(/0/g, "O");
    corrected = true;
  }

  if (/[1]/.test(value) && /[I]/.test(value)) {
    value = value.replace(/1/g, "I");
    corrected = true;
  } else if (/[1]/.test(value)) {
    value = value.replace(/1/g, "I");
    corrected = true;
  }

  if (corrected && value !== rawValue) {
    return { value, corrected: true, correction: { field: "name", from: rawValue, to: value, reason: "ocr_fix" } };
  }

  return { value: rawValue, corrected: false };
}

function correctDateField(
  rawValue: string,
  fieldName: string,
): { value: string; corrected: boolean; correction?: MrzCorrection } {
  let value = rawValue;
  const replacements: Array<{ from: RegExp; to: string }> = [];

  if (/O/.test(value)) replacements.push({ from: /O/g, to: "0" });
  if (/I/.test(value)) replacements.push({ from: /I/g, to: "1" });
  if (/Z/.test(value)) replacements.push({ from: /Z/g, to: "2" });
  if (/S/.test(value)) replacements.push({ from: /S/g, to: "5" });
  if (/B/.test(value)) replacements.push({ from: /B/g, to: "8" });

  for (const r of replacements) {
    value = value.replace(r.from, r.to);
  }

  if (value !== rawValue) {
    return { value, corrected: true, correction: { field: fieldName, from: rawValue, to: value, reason: "ocr_fix" } };
  }

  return { value: rawValue, corrected: false };
}

function correctPassportNumber(
  num: string,
  fieldName: string,
): { value: string; corrected: boolean; correction?: MrzCorrection } {
  let value = num;

  if (/O/.test(value)) value = value.replace(/O/g, "0");
  if (/I/.test(value)) value = value.replace(/I/g, "1");

  if (value !== num) {
    return { value, corrected: true, correction: { field: fieldName, from: num, to: value, reason: "ocr_fix" } };
  }

  return { value: num, corrected: false };
}

export function detectMrzFormat(lines: string[]): MrzFormat {
  const cleaned = lines.map((l) => l.trim()).filter(Boolean);
  if (cleaned.length < 2) return "UNKNOWN";

  const l1 = cleaned[0]!.length;
  const l2 = cleaned[1]!.length;

  if (l1 >= 44 && l2 >= 44) return "TD3";
  if (l1 >= 36 && l2 >= 36) return "TD2";
  if (l1 >= 30 && l2 >= 30) return "TD1";

  return "UNKNOWN";
}

function parseNameField(raw: string): { surname: string; givenName: string; fullName: string } {
  const parts = raw.split("<<");
  const surname = (parts[0] || "").replace(/</g, " ").trim();
  const givenRaw = parts.slice(1).join("<");
  const givenName = givenRaw.replace(/</g, " ").trim();
  const fullName = [surname, givenName].filter(Boolean).join(" ");
  return { surname, givenName, fullName };
}

function parseMrzDate(raw: string, centuryBreak: number): string {
  if (!raw || raw.replace(/</g, "").length < 6) return "";
  const clean = raw.replace(/</g, "0");
  if (clean.length !== 6) return "";

  const yearTwo = parseInt(clean.slice(0, 2), 10);
  const month = parseInt(clean.slice(2, 4), 10);
  const day = parseInt(clean.slice(4, 6), 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return "";

  const fullYear = yearTwo <= centuryBreak ? 2000 + yearTwo : 1900 + yearTwo;
  return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function createFieldResult(value: string, raw: string, valid: boolean, corrected: boolean): MrzFieldResult {
  return { value, raw, corrected, valid };
}

function emptyResult(lines: string[]): MrzParseResult {
  return {
    format: "UNKNOWN",
    documentType: createFieldResult("", "", false, false),
    issuingCountry: createFieldResult("", "", false, false),
    surname: createFieldResult("", "", false, false),
    givenName: createFieldResult("", "", false, false),
    fullName: createFieldResult("", "", false, false),
    passportNumber: createFieldResult("", "", false, false),
    nationality: createFieldResult("", "", false, false),
    dateOfBirth: createFieldResult("", "", false, false),
    gender: createFieldResult("", "", false, false),
    expiryDate: createFieldResult("", "", false, false),
    optionalData: createFieldResult("", "", false, false),
    checkDigits: {},
    overallValid: false,
    corrections: [],
    mrzLines: lines,
  };
}

function parseTd3(line1: string, line2: string, options: Required<MrzParserOptions>): MrzParseResult {
  const result = emptyResult([line1, line2]);
  result.format = "TD3";

  const docType = line1[0] || "";
  result.documentType = createFieldResult(
    docType === "P" ? "PASSPORT" : docType === "I" || docType === "ID" ? "ID_CARD" : docType,
    docType,
    true,
    false,
  );

  let issuingRaw = (line1.slice(2, 5) || "").replace(/</g, "");
  let issuingCorrected = false;
  if (options.correctOcrErrors && issuingRaw.length > 0 && /[0OI1]/.test(issuingRaw)) {
    const corrected = correctNameField(issuingRaw);
    if (corrected.corrected && corrected.correction) {
      issuingRaw = corrected.value;
      issuingCorrected = true;
      result.corrections.push(corrected.correction);
    }
  }
  result.issuingCountry = createFieldResult(issuingRaw, issuingRaw, issuingRaw.length === 3, issuingCorrected);

  let nameRaw = line1.length >= 44 ? line1.slice(5, 44) : line1.slice(5);
  let nameCorrected: { value: string; corrected: boolean; correction?: MrzCorrection } = {
    value: nameRaw,
    corrected: false,
  };
  if (options.correctOcrErrors) {
    nameCorrected = correctNameField(nameRaw);
    if (nameCorrected.corrected && nameCorrected.correction) {
      nameRaw = nameCorrected.value;
      result.corrections.push(nameCorrected.correction);
    }
  }
  const parsedName = parseNameField(nameRaw);
  result.surname = createFieldResult(
    parsedName.surname,
    nameRaw,
    parsedName.surname.length > 0,
    nameCorrected.corrected,
  );
  result.givenName = createFieldResult(
    parsedName.givenName,
    nameRaw,
    parsedName.givenName.length > 0,
    nameCorrected.corrected,
  );
  result.fullName = createFieldResult(
    parsedName.fullName,
    nameRaw,
    parsedName.fullName.length > 0,
    nameCorrected.corrected,
  );

  const passNum = line2.slice(0, 9).replace(/</g, "");
  const passNumRaw = line2.slice(0, 9);
  const passCd = line2[9] || "";
  let passResult: { value: string; corrected: boolean; correction?: MrzCorrection } = {
    value: passNum,
    corrected: false,
  };

  if (options.validateChecksums && options.correctOcrErrors) {
    passResult = correctFieldWithCheckDigit(line2.slice(0, 9), passCd, "passportNumber");
    if (passResult.corrected && passResult.correction) {
      result.corrections.push(passResult.correction);
    }
  } else if (options.correctOcrErrors && hasAmbiguousChars(passNumRaw)) {
    const corrected = correctPassportNumber(passNumRaw, "passportNumber");
    if (corrected.corrected && corrected.correction) {
      passResult = { value: corrected.value.replace(/</g, ""), corrected: true, correction: corrected.correction };
      result.corrections.push(corrected.correction);
    }
  }

  const finalPassValue = passResult.value.replace(/</g, "");
  result.passportNumber = createFieldResult(finalPassValue, passNumRaw.replace(/</g, ""), true, passResult.corrected);

  let natRaw = line2.slice(10, 13) || "";
  let natCorrected = false;
  if (natRaw.includes("<")) natRaw = natRaw.replace(/</g, "");
  if (options.correctOcrErrors && natRaw.length > 0 && /[0OI1]/.test(natRaw)) {
    const corrected = correctNameField(natRaw);
    if (corrected.corrected && corrected.correction) {
      natRaw = corrected.value;
      natCorrected = true;
      result.corrections.push(corrected.correction);
    }
  }
  result.nationality = createFieldResult(natRaw, natRaw, natRaw.length === 3, natCorrected);

  const dobRaw = line2.slice(13, 19);
  const dobCd = line2[19] || "";
  let dobResult: { value: string; corrected: boolean } = {
    value: parseMrzDate(dobRaw, options.centuryBreak),
    corrected: false,
  };

  if (options.validateChecksums && options.correctOcrErrors) {
    const dobCheckResult = correctFieldWithCheckDigit(dobRaw, dobCd, "dateOfBirth");
    const dateToParse = dobCheckResult.value;
    if (dobCheckResult.correction) result.corrections.push(dobCheckResult.correction);
    dobResult = { value: parseMrzDate(dateToParse, options.centuryBreak), corrected: dobCheckResult.corrected };
  }

  if (options.correctOcrErrors && !dobResult.value && hasAmbiguousChars(dobRaw)) {
    const corrected = correctDateField(dobRaw, "dateOfBirth");
    if (corrected.corrected && corrected.correction) {
      dobResult = { value: parseMrzDate(corrected.value, options.centuryBreak), corrected: true };
      result.corrections.push(corrected.correction);
    }
  }

  result.dateOfBirth = createFieldResult(
    dobResult.value || "",
    dobRaw,
    dobResult.value.length > 0,
    dobResult.corrected,
  );

  const genderRaw = line2[20] || "";
  result.gender = createFieldResult(
    genderRaw === "M" ? "M" : genderRaw === "F" ? "F" : "UNKNOWN",
    genderRaw,
    genderRaw === "M" || genderRaw === "F",
    false,
  );

  const expiryRaw = line2.slice(21, 27);
  const expiryCd = line2[27] || "";
  let expiryResult = { value: parseMrzDate(expiryRaw, options.centuryBreak), corrected: false };

  if (options.validateChecksums && options.correctOcrErrors) {
    const expiryCheckResult = correctFieldWithCheckDigit(expiryRaw, expiryCd, "expiryDate");
    const dateToParse = expiryCheckResult.value;
    if (expiryCheckResult.correction) result.corrections.push(expiryCheckResult.correction);
    expiryResult = { value: parseMrzDate(dateToParse, options.centuryBreak), corrected: expiryCheckResult.corrected };
  }

  if (options.correctOcrErrors && !expiryResult.value && hasAmbiguousChars(expiryRaw)) {
    const corrected = correctDateField(expiryRaw, "expiryDate");
    if (corrected.corrected) {
      expiryResult = { value: parseMrzDate(corrected.value, options.centuryBreak), corrected: true };
      if (corrected.correction) result.corrections.push(corrected.correction);
    }
  }

  result.expiryDate = createFieldResult(
    expiryResult.value || "",
    expiryRaw,
    expiryResult.value.length > 0,
    expiryResult.corrected,
  );

  const optRaw = line2.slice(28, 42);
  const optValue = optRaw.replace(/</g, "").trim();
  result.optionalData = createFieldResult(optValue, optRaw, true, false);

  if (options.validateChecksums) {
    const passportCdValid = computeCheckDigit(line2.slice(0, 9)) === passCd || passCd === "<" || passResult.corrected;
    const dobCdValid = computeCheckDigit(dobRaw) === dobCd || dobCd === "<" || dobResult.corrected;
    const expiryCdValid = computeCheckDigit(expiryRaw) === expiryCd || expiryCd === "<" || expiryResult.corrected;
    const optCd = line2[42] || "";
    const optCdValid = computeCheckDigit(optRaw) === optCd || optCd === "<" || optCd === "";
    const compositeInput = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 43);
    const compositeCd = line2[43] || "";
    const compositeCdValid =
      computeCheckDigit(compositeInput) === compositeCd || compositeCd === "<" || compositeCd === "";

    result.checkDigits = {
      passport_number_valid: passportCdValid,
      date_of_birth_valid: dobCdValid,
      expiry_date_valid: expiryCdValid,
      optional_data_valid: optCdValid,
      final_composite_valid: compositeCdValid,
      overall_valid: passportCdValid && dobCdValid && expiryCdValid && compositeCdValid,
    };
    result.overallValid = passportCdValid && dobCdValid && expiryCdValid && compositeCdValid;
  }

  return result;
}

function parseTd2(line1: string, line2: string, options: Required<MrzParserOptions>): MrzParseResult {
  const result = emptyResult([line1, line2]);
  result.format = "TD2";

  const docType = line1[0] || "";
  result.documentType = createFieldResult(
    docType === "P" ? "PASSPORT" : docType === "I" || docType === "ID" ? "ID_CARD" : docType,
    docType,
    true,
    false,
  );

  let issuingRaw = (line1.slice(2, 5) || "").replace(/</g, "");
  if (options.correctOcrErrors && issuingRaw.length > 0 && /[0OI1]/.test(issuingRaw)) {
    const corrected = correctNameField(issuingRaw);
    if (corrected.corrected && corrected.correction) {
      issuingRaw = corrected.value;
      result.corrections.push(corrected.correction);
    }
  }
  result.issuingCountry = createFieldResult(issuingRaw, issuingRaw, issuingRaw.length === 3, false);

  let nameRaw = line1.length >= 36 ? line1.slice(5, 36) : line1.slice(5);
  let nameCorrected: { value: string; corrected: boolean; correction?: MrzCorrection } = {
    value: nameRaw,
    corrected: false,
  };
  if (options.correctOcrErrors) {
    nameCorrected = correctNameField(nameRaw);
    if (nameCorrected.corrected && nameCorrected.correction) {
      nameRaw = nameCorrected.value;
      result.corrections.push(nameCorrected.correction);
    }
  }
  const parsedName = parseNameField(nameRaw);
  result.surname = createFieldResult(
    parsedName.surname,
    nameRaw,
    parsedName.surname.length > 0,
    nameCorrected.corrected,
  );
  result.givenName = createFieldResult(
    parsedName.givenName,
    nameRaw,
    parsedName.givenName.length > 0,
    nameCorrected.corrected,
  );
  result.fullName = createFieldResult(
    parsedName.fullName,
    nameRaw,
    parsedName.fullName.length > 0,
    nameCorrected.corrected,
  );

  const passNum = line2.slice(0, 9).replace(/</g, "");
  const passCd = line2[9] || "";
  let passResult: { value: string; corrected: boolean; correction?: MrzCorrection } = {
    value: passNum,
    corrected: false,
  };

  if (options.validateChecksums && options.correctOcrErrors) {
    passResult = correctFieldWithCheckDigit(line2.slice(0, 9), passCd, "passportNumber");
    if (passResult.correction) {
      result.corrections.push(passResult.correction);
    }
  } else if (options.correctOcrErrors && hasAmbiguousChars(line2.slice(0, 9))) {
    const corrected = correctPassportNumber(line2.slice(0, 9), "passportNumber");
    if (corrected.corrected && corrected.correction) {
      passResult = { value: corrected.value.replace(/</g, ""), corrected: true, correction: corrected.correction };
      result.corrections.push(corrected.correction);
    }
  }

  result.passportNumber = createFieldResult(passResult.value.replace(/</g, ""), passNum, true, passResult.corrected);

  let natRaw = line2.slice(10, 13) || "";
  if (natRaw.includes("<")) natRaw = natRaw.replace(/</g, "");
  if (options.correctOcrErrors && natRaw.length > 0 && /[0OI1]/.test(natRaw)) {
    const corrected = correctNameField(natRaw);
    if (corrected.corrected && corrected.correction) {
      natRaw = corrected.value;
      result.corrections.push(corrected.correction);
    }
  }
  result.nationality = createFieldResult(natRaw, natRaw, natRaw.length === 3, false);

  const dobRaw = line2.slice(13, 19);
  const dobCd = line2[19] || "";
  let dobResult: { value: string; corrected: boolean } = {
    value: parseMrzDate(dobRaw, options.centuryBreak),
    corrected: false,
  };

  if (options.validateChecksums && options.correctOcrErrors) {
    const dobCheckResult = correctFieldWithCheckDigit(dobRaw, dobCd, "dateOfBirth");
    const dateToParse = dobCheckResult.value;
    if (dobCheckResult.correction) result.corrections.push(dobCheckResult.correction);
    dobResult = { value: parseMrzDate(dateToParse, options.centuryBreak), corrected: dobCheckResult.corrected };
  }

  if (options.correctOcrErrors && !dobResult.value && hasAmbiguousChars(dobRaw)) {
    const corrected = correctDateField(dobRaw, "dateOfBirth");
    if (corrected.corrected && corrected.correction) {
      dobResult = { value: parseMrzDate(corrected.value, options.centuryBreak), corrected: true };
      result.corrections.push(corrected.correction);
    }
  }

  result.dateOfBirth = createFieldResult(
    dobResult.value || "",
    dobRaw,
    dobResult.value.length > 0,
    dobResult.corrected,
  );

  const genderRaw = line2[20] || "";
  result.gender = createFieldResult(
    genderRaw === "M" ? "M" : genderRaw === "F" ? "F" : "UNKNOWN",
    genderRaw,
    genderRaw === "M" || genderRaw === "F",
    false,
  );

  const expiryRaw = line2.slice(21, 27);
  const expiryCd = line2[27] || "";
  let expiryResult: { value: string; corrected: boolean } = {
    value: parseMrzDate(expiryRaw, options.centuryBreak),
    corrected: false,
  };

  if (options.validateChecksums && options.correctOcrErrors) {
    const expiryCheckResult = correctFieldWithCheckDigit(expiryRaw, expiryCd, "expiryDate");
    const dateToParse = expiryCheckResult.value;
    if (expiryCheckResult.correction) result.corrections.push(expiryCheckResult.correction);
    expiryResult = { value: parseMrzDate(dateToParse, options.centuryBreak), corrected: expiryCheckResult.corrected };
  }

  if (options.correctOcrErrors && !expiryResult.value && hasAmbiguousChars(expiryRaw)) {
    const corrected = correctDateField(expiryRaw, "expiryDate");
    if (corrected.corrected && corrected.correction) {
      expiryResult = { value: parseMrzDate(corrected.value, options.centuryBreak), corrected: true };
      result.corrections.push(corrected.correction);
    }
  }

  result.expiryDate = createFieldResult(
    expiryResult.value || "",
    expiryRaw,
    expiryResult.value.length > 0,
    expiryResult.corrected,
  );

  const optRaw = line2.slice(28, 36);
  const optValue = optRaw.replace(/</g, "").trim();
  result.optionalData = createFieldResult(optValue, optRaw, true, false);

  if (options.validateChecksums) {
    const passportCdValid = computeCheckDigit(line2.slice(0, 9)) === passCd || passCd === "<" || passResult.corrected;
    const dobCdValid = computeCheckDigit(dobRaw) === dobCd || dobCd === "<" || dobResult.corrected;
    const expiryCdValid = computeCheckDigit(expiryRaw) === expiryCd || expiryCd === "<" || expiryResult.corrected;
    const optCd = line2[35] || "";
    const optCdValid = computeCheckDigit(optRaw) === optCd || optCd === "<" || optCd === "";

    result.checkDigits = {
      passport_number_valid: passportCdValid,
      date_of_birth_valid: dobCdValid,
      expiry_date_valid: expiryCdValid,
      optional_data_valid: optCdValid,
      final_composite_valid: passportCdValid,
      overall_valid: passportCdValid && dobCdValid && expiryCdValid,
    };
    result.overallValid = passportCdValid && dobCdValid && expiryCdValid;
  }

  return result;
}

function parseTd1(line1: string, line2: string, line3: string, options: Required<MrzParserOptions>): MrzParseResult {
  const result = emptyResult([line1, line2, line3]);
  result.format = "TD1";

  const docType = line1[0] || "";
  result.documentType = createFieldResult(
    docType === "P" ? "PASSPORT" : docType === "I" || docType === "ID" ? "ID_CARD" : docType,
    docType,
    true,
    false,
  );

  let issuingRaw = (line1.slice(2, 5) || "").replace(/</g, "");
  if (options.correctOcrErrors && issuingRaw.length > 0 && /[0OI1]/.test(issuingRaw)) {
    const corrected = correctNameField(issuingRaw);
    if (corrected.corrected && corrected.correction) {
      issuingRaw = corrected.value;
      result.corrections.push(corrected.correction);
    }
  }
  result.issuingCountry = createFieldResult(issuingRaw, issuingRaw, issuingRaw.length === 3, false);

  let nameRaw = line1.length >= 30 ? line1.slice(5, 30) : line1.slice(5);
  let nameCorrected: { value: string; corrected: boolean; correction?: MrzCorrection } = {
    value: nameRaw,
    corrected: false,
  };
  if (options.correctOcrErrors) {
    nameCorrected = correctNameField(nameRaw);
    if (nameCorrected.corrected && nameCorrected.correction) {
      nameRaw = nameCorrected.value;
      result.corrections.push(nameCorrected.correction);
    }
  }
  const parsedName = parseNameField(nameRaw);
  result.surname = createFieldResult(
    parsedName.surname,
    nameRaw,
    parsedName.surname.length > 0,
    nameCorrected.corrected,
  );
  result.givenName = createFieldResult(
    parsedName.givenName,
    nameRaw,
    parsedName.givenName.length > 0,
    nameCorrected.corrected,
  );
  result.fullName = createFieldResult(
    parsedName.fullName,
    nameRaw,
    parsedName.fullName.length > 0,
    nameCorrected.corrected,
  );

  const passNum = line2.slice(0, 9).replace(/</g, "");
  const passCd = line2[9] || "";
  let passResult: { value: string; corrected: boolean; correction?: MrzCorrection } = {
    value: passNum,
    corrected: false,
  };

  if (options.validateChecksums && options.correctOcrErrors) {
    passResult = correctFieldWithCheckDigit(line2.slice(0, 9), passCd, "passportNumber");
    if (passResult.correction) {
      result.corrections.push(passResult.correction);
    }
  } else if (options.correctOcrErrors && hasAmbiguousChars(line2.slice(0, 9))) {
    const corrected = correctPassportNumber(line2.slice(0, 9), "passportNumber");
    if (corrected.corrected && corrected.correction) {
      passResult = { value: corrected.value.replace(/</g, ""), corrected: true, correction: corrected.correction };
      result.corrections.push(corrected.correction);
    }
  }

  result.passportNumber = createFieldResult(passResult.value.replace(/</g, ""), passNum, true, passResult.corrected);

  let natRaw = line2.slice(10, 13) || "";
  if (natRaw.includes("<")) natRaw = natRaw.replace(/</g, "");
  if (options.correctOcrErrors && natRaw.length > 0 && /[0OI1]/.test(natRaw)) {
    const corrected = correctNameField(natRaw);
    if (corrected.corrected && corrected.correction) {
      natRaw = corrected.value;
      result.corrections.push(corrected.correction);
    }
  }
  result.nationality = createFieldResult(natRaw, natRaw, natRaw.length === 3, false);

  const dobRaw = line2.slice(13, 19);
  const dobCd = line2[19] || "";
  let dobResult: { value: string; corrected: boolean } = {
    value: parseMrzDate(dobRaw, options.centuryBreak),
    corrected: false,
  };

  if (options.validateChecksums && options.correctOcrErrors) {
    const dobCheckResult = correctFieldWithCheckDigit(dobRaw, dobCd, "dateOfBirth");
    const dateToParse = dobCheckResult.value;
    if (dobCheckResult.correction) result.corrections.push(dobCheckResult.correction);
    dobResult = { value: parseMrzDate(dateToParse, options.centuryBreak), corrected: dobCheckResult.corrected };
  }

  if (options.correctOcrErrors && !dobResult.value && hasAmbiguousChars(dobRaw)) {
    const corrected = correctDateField(dobRaw, "dateOfBirth");
    if (corrected.corrected && corrected.correction) {
      dobResult = { value: parseMrzDate(corrected.value, options.centuryBreak), corrected: true };
      result.corrections.push(corrected.correction);
    }
  }

  result.dateOfBirth = createFieldResult(
    dobResult.value || "",
    dobRaw,
    dobResult.value.length > 0,
    dobResult.corrected,
  );

  const genderRaw = line2[20] || "";
  result.gender = createFieldResult(
    genderRaw === "M" ? "M" : genderRaw === "F" ? "F" : "UNKNOWN",
    genderRaw,
    genderRaw === "M" || genderRaw === "F",
    false,
  );

  const expiryRaw = line2.slice(21, 27);
  const expiryCd = line2[27] || "";
  let expiryResult: { value: string; corrected: boolean } = {
    value: parseMrzDate(expiryRaw, options.centuryBreak),
    corrected: false,
  };

  if (options.validateChecksums && options.correctOcrErrors) {
    const expiryCheckResult = correctFieldWithCheckDigit(expiryRaw, expiryCd, "expiryDate");
    const dateToParse = expiryCheckResult.value;
    if (expiryCheckResult.correction) result.corrections.push(expiryCheckResult.correction);
    expiryResult = { value: parseMrzDate(dateToParse, options.centuryBreak), corrected: expiryCheckResult.corrected };
  }

  if (options.correctOcrErrors && !expiryResult.value && hasAmbiguousChars(expiryRaw)) {
    const corrected = correctDateField(expiryRaw, "expiryDate");
    if (corrected.corrected && corrected.correction) {
      expiryResult = { value: parseMrzDate(corrected.value, options.centuryBreak), corrected: true };
      result.corrections.push(corrected.correction);
    }
  }

  result.expiryDate = createFieldResult(
    expiryResult.value || "",
    expiryRaw,
    expiryResult.value.length > 0,
    expiryResult.corrected,
  );

  const optRaw = (line2.slice(28, 30) + (line3 || "")).replace(/</g, " ").trim();
  result.optionalData = createFieldResult(optRaw, optRaw, true, false);

  if (options.validateChecksums) {
    const passportCdValid = computeCheckDigit(line2.slice(0, 9)) === passCd || passCd === "<" || passResult.corrected;
    const dobCdValid = computeCheckDigit(dobRaw) === dobCd || dobCd === "<" || dobResult.corrected;
    const expiryCdValid = computeCheckDigit(expiryRaw) === expiryCd || expiryCd === "<" || expiryResult.corrected;
    const compositeInput = line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 28);
    let compositeCdValid = true;
    if (line2.length >= 30) {
      const compositeCandidate = line2[29];
      if (compositeCandidate && compositeCandidate !== "<") {
        compositeCdValid = computeCheckDigit(compositeInput) === compositeCandidate;
      }
    }

    result.checkDigits = {
      passport_number_valid: passportCdValid,
      date_of_birth_valid: dobCdValid,
      expiry_date_valid: expiryCdValid,
      optional_data_valid: true,
      final_composite_valid: compositeCdValid,
      overall_valid: passportCdValid && dobCdValid && expiryCdValid && compositeCdValid,
    };
    result.overallValid = passportCdValid && dobCdValid && expiryCdValid && compositeCdValid;
  }

  return result;
}

export function parseMrz(lines: string[], options?: MrzParserOptions): MrzParseResult {
  const opts: Required<MrzParserOptions> = { ...DEFAULT_OPTIONS, ...options };
  const cleaned = lines.map((l) => l.trim()).filter(Boolean);

  if (cleaned.length < 2) {
    return emptyResult(cleaned);
  }

  const format = detectMrzFormat(cleaned);
  if (format === "UNKNOWN") {
    return emptyResult(cleaned);
  }

  switch (format) {
    case "TD3":
      return parseTd3(cleaned[0]!, cleaned[1]!, opts);
    case "TD2":
      return parseTd2(cleaned[0]!, cleaned[1]!, opts);
    case "TD1":
      return parseTd1(cleaned[0]!, cleaned[1]!, cleaned[2] || "", opts);
    default:
      return emptyResult(cleaned);
  }
}

export function validateMrzChecksums(lines: string[]): Record<string, boolean> & { overallValid: boolean } {
  const result = parseMrz(lines, { correctOcrErrors: false, validateChecksums: true });
  return { ...result.checkDigits, overallValid: result.overallValid };
}

export function correctMrzOcrErrors(lines: string[]): { lines: string[]; corrections: MrzCorrection[] } {
  const result = parseMrz(lines, { correctOcrErrors: true, validateChecksums: true });

  const correctedLines = [...lines];
  for (let i = 0; i < correctedLines.length && i < result.mrzLines.length; i++) {
    correctedLines[i] = result.mrzLines[i]!;
  }

  return { lines: correctedLines, corrections: result.corrections.filter((c) => c.from !== c.to) };
}

export function computeMrzCheckDigit(value: string): string {
  return computeCheckDigit(value);
}
