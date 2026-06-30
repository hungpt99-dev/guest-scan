export type MrzParsedFields = {
  fullName: string;
  surname: string;
  givenName: string;
  gender: string;
  dateOfBirth: string;
  nationality: string;
  issuingCountry: string;
  documentType: string;
  passportNumber: string;
  documentNumber: string;
  idNumber: string;
  issueDate: string;
  expiryDate: string;
  mrzRaw: string;
  mrzParsed: string[];
  checkDigits: Record<string, boolean>;
};

export type NormalizedFields = {
  fullName: string;
  firstName: string;
  lastName: string;
  gender: "M" | "F" | "X" | "UNKNOWN";
  dateOfBirth: string;
  nationality: string;
  countryCode: string;
  documentType: "PASSPORT" | "ID_CARD" | "UNKNOWN";
  documentNumber: string;
  passportNumber: string;
  idNumber: string;
  issueDate: string;
  expiryDate: string;
  issuingCountry: string;
  mrzRaw: string;
  mrzParsed: string[];
  rawOriginal: {
    fullName: string;
    surname: string;
    givenName: string;
    gender: string;
    dateOfBirth: string;
    nationality: string;
    issuingCountry: string;
    documentType: string;
    passportNumber: string;
    documentNumber: string;
    idNumber: string;
    issueDate: string;
    expiryDate: string;
    mrzRaw: string;
  };
};

export interface FieldNormalizationService {
  normalizeFields(parsedFields: MrzParsedFields): NormalizedFields;
}

const ISO2_TO_ISO3: Record<string, string> = {
  VN: "VNM",
  US: "USA",
  KR: "KOR",
  CN: "CHN",
  JP: "JPN",
  FR: "FRA",
  DE: "DEU",
  GB: "GBR",
  IT: "ITA",
  ES: "ESP",
  CA: "CAN",
  AU: "AUS",
  BR: "BRA",
  IN: "IND",
  RU: "RUS",
  MX: "MEX",
  ID: "IDN",
  NL: "NLD",
  SA: "SAU",
  CH: "CHE",
  SE: "SWE",
  NO: "NOR",
  DK: "DNK",
  FI: "FIN",
  BE: "BEL",
  AT: "AUT",
  PT: "PRT",
  GR: "GRC",
  IE: "IRL",
  NZ: "NZL",
  SG: "SGP",
  MY: "MYS",
  TH: "THA",
  PH: "PHL",
  HK: "HKG",
  TW: "TWN",
  AR: "ARG",
  CL: "CHL",
  CO: "COL",
  ZA: "ZAF",
  EG: "EGY",
  NG: "NGA",
  KE: "KEN",
  TR: "TUR",
  PL: "POL",
  CZ: "CZE",
  HU: "HUN",
  RO: "ROU",
  UA: "UKR",
  IL: "ISR",
  AE: "ARE",
  PK: "PAK",
  BD: "BGD",
  MM: "MMR",
  LA: "LAO",
  KH: "KHM",
  MO: "MAC",
  MN: "MNG",
  NP: "NPL",
  LK: "LKA",
  KZ: "KAZ",
  UZ: "UZB",
  QA: "QAT",
  KW: "KWT",
  OM: "OMN",
  IR: "IRN",
};

function normalizeName(raw: string): string {
  if (!raw) return "";
  return raw.replace(/</g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

function normalizeGender(raw: string): "M" | "F" | "X" | "UNKNOWN" {
  if (!raw) return "UNKNOWN";
  const upper = raw.trim().toUpperCase();
  if (upper === "M" || upper === "MALE" || upper === "NAM") return "M";
  if (upper === "F" || upper === "FEMALE" || upper === "NỮ" || upper === "NU") return "F";
  if (upper === "X" || upper === "NON-BINARY" || upper === "NONBINARY" || upper === "OTHER") return "X";
  return "UNKNOWN";
}

function normalizeDocumentType(raw: string): "PASSPORT" | "ID_CARD" | "UNKNOWN" {
  if (!raw) return "UNKNOWN";
  const upper = raw.trim().toUpperCase();
  if (upper === "PASSPORT" || upper === "P" || upper === "PN" || upper === "PD") return "PASSPORT";
  if (upper === "ID_CARD" || upper === "ID" || upper === "I" || upper === "IDENTITY" || upper === "IDENTITY_CARD")
    return "ID_CARD";
  return "UNKNOWN";
}

function normalizeCountryCode(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.trim().toUpperCase().replace(/</g, "");
  if (!cleaned) return "";
  if (cleaned.length === 3) {
    return cleaned;
  }
  if (cleaned.length === 2) {
    return ISO2_TO_ISO3[cleaned] ?? cleaned;
  }
  return cleaned.slice(0, 3);
}

function normalizeDocumentNumber(raw: string): string {
  if (!raw) return "";
  return raw.trim().toUpperCase().replace(/</g, "");
}

function normalizePassportNumber(rawPassport: string, rawDocument: string, docType: string): string {
  const val = rawPassport || rawDocument;
  if (!val) return "";
  const cleaned = val.trim().toUpperCase().replace(/</g, "");
  if (docType === "PASSPORT") return cleaned;
  return cleaned;
}

function normalizeIdNumber(rawId: string, rawDocument: string, docType: string): string {
  if (docType === "ID_CARD") {
    const val = rawId || rawDocument;
    if (!val) return "";
    return val.trim().toUpperCase().replace(/</g, "");
  }
  const val = rawId || rawDocument;
  if (!val) return "";
  return val.trim().toUpperCase().replace(/</g, "");
}

function normalizeDate(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.trim();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateRegex.test(cleaned)) return cleaned;
  const mrzDateRegex = /^(\d{2})(\d{2})(\d{2})$/;
  const mrzMatch = cleaned.match(mrzDateRegex);
  if (mrzMatch) {
    const year = parseInt(mrzMatch[1]!, 10);
    const month = parseInt(mrzMatch[2]!, 10);
    const day = parseInt(mrzMatch[3]!, 10);
    const fullYear = year <= 49 ? 2000 + year : 1900 + year;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${fullYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const fullMrzRegex = /^(\d{4})(\d{2})(\d{2})$/;
  const fullMatch = cleaned.match(fullMrzRegex);
  if (fullMatch) {
    const year = parseInt(fullMatch[1]!, 10);
    const month = parseInt(fullMatch[2]!, 10);
    const day = parseInt(fullMatch[3]!, 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const sepRegex = /^(\d{4})[^\d](\d{2})[^\d](\d{2})$/;
  const sepMatch = cleaned.match(sepRegex);
  if (sepMatch) {
    return `${sepMatch[1]!}-${sepMatch[2]!}-${sepMatch[3]!}`;
  }
  return cleaned;
}

export function createFieldNormalizationService(): FieldNormalizationService {
  return new DefaultFieldNormalizationService();
}

class DefaultFieldNormalizationService implements FieldNormalizationService {
  normalizeFields(parsedFields: MrzParsedFields): NormalizedFields {
    const rawSurname = parsedFields.surname;
    const rawGivenName = parsedFields.givenName;
    const rawFullName = parsedFields.fullName;

    const lastName = normalizeName(rawSurname || rawFullName.split(/[<\s]+/)[0] || "");
    const firstName = normalizeName(rawGivenName || "");
    const fullName = normalizeName(rawFullName || [lastName, firstName].filter(Boolean).join(" "));

    const gender = normalizeGender(parsedFields.gender);

    const dateOfBirth = normalizeDate(parsedFields.dateOfBirth);
    const expiryDate = normalizeDate(parsedFields.expiryDate);
    const issueDate = normalizeDate(parsedFields.issueDate);

    const nationality = normalizeCountryCode(parsedFields.nationality);
    const issuingCountry = normalizeCountryCode(parsedFields.issuingCountry);
    const countryCode = issuingCountry || nationality;

    const docType = normalizeDocumentType(parsedFields.documentType);

    const passportNumber = normalizePassportNumber(parsedFields.passportNumber, parsedFields.documentNumber, docType);

    const documentNumber = normalizeDocumentNumber(parsedFields.documentNumber || parsedFields.passportNumber);

    const idNumber = normalizeIdNumber(parsedFields.idNumber, parsedFields.documentNumber, docType);

    const mrzRaw = parsedFields.mrzRaw || "";
    const mrzParsed = parsedFields.mrzParsed ?? [];

    return {
      fullName,
      firstName,
      lastName,
      gender,
      dateOfBirth,
      nationality,
      countryCode,
      documentType: docType,
      documentNumber,
      passportNumber,
      idNumber,
      issueDate,
      expiryDate,
      issuingCountry,
      mrzRaw,
      mrzParsed,
      rawOriginal: {
        fullName: rawFullName,
        surname: rawSurname,
        givenName: rawGivenName,
        gender: parsedFields.gender,
        dateOfBirth: parsedFields.dateOfBirth,
        nationality: parsedFields.nationality,
        issuingCountry: parsedFields.issuingCountry,
        documentType: parsedFields.documentType,
        passportNumber: parsedFields.passportNumber,
        documentNumber: parsedFields.documentNumber,
        idNumber: parsedFields.idNumber,
        issueDate: parsedFields.issueDate,
        expiryDate: parsedFields.expiryDate,
        mrzRaw,
      },
    };
  }
}
