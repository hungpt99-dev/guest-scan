import { describe, it, expect } from "vitest";
import { createFieldNormalizationService } from "../../services/field_normalization_service";
import type { MrzParsedFields } from "../../services/field_normalization_service";

function makeMrzParsedFields(overrides: Partial<MrzParsedFields> = {}): MrzParsedFields {
  return {
    fullName: "MUSTER JOHN MICHAEL",
    surname: "MUSTER",
    givenName: "JOHN MICHAEL",
    gender: "M",
    dateOfBirth: "1985-10-10",
    nationality: "UTO",
    issuingCountry: "UTO",
    documentType: "PASSPORT",
    passportNumber: "AB123456",
    documentNumber: "AB123456",
    idNumber: "",
    issueDate: "",
    expiryDate: "2020-01-01",
    mrzRaw: "P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<\nAB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04",
    mrzParsed: ["P<UTOMUSTER<<JOHN<MICHAEL<<<<<<<<<<<<<<<<<<<<<<<", "AB123456<7UTO8510101M2001011<<<<<<<<<<<<<<<<04"],
    checkDigits: {
      passport_number_valid: true,
      date_of_birth_valid: true,
      expiry_date_valid: true,
      optional_data_valid: true,
      final_composite_valid: true,
      overall_valid: true,
    },
    ...overrides,
  };
}

describe("FieldNormalizationService", () => {
  const service = createFieldNormalizationService();

  describe("normalizeFields", () => {
    it("normalizes TD3 passport fields correctly", () => {
      const parsed = makeMrzParsedFields();
      const result = service.normalizeFields(parsed);

      expect(result.fullName).toBe("MUSTER JOHN MICHAEL");
      expect(result.firstName).toBe("JOHN MICHAEL");
      expect(result.lastName).toBe("MUSTER");
      expect(result.gender).toBe("M");
      expect(result.dateOfBirth).toBe("1985-10-10");
      expect(result.nationality).toBe("UTO");
      expect(result.countryCode).toBe("UTO");
      expect(result.documentType).toBe("PASSPORT");
      expect(result.documentNumber).toBe("AB123456");
      expect(result.passportNumber).toBe("AB123456");
      expect(result.issueDate).toBe("");
      expect(result.expiryDate).toBe("2020-01-01");
      expect(result.issuingCountry).toBe("UTO");
    });

    it("normalizes gender to M, F, X, or UNKNOWN", () => {
      const male = service.normalizeFields(makeMrzParsedFields({ gender: "M" }));
      expect(male.gender).toBe("M");

      const female = service.normalizeFields(makeMrzParsedFields({ gender: "F" }));
      expect(female.gender).toBe("F");

      const nonBinary = service.normalizeFields(makeMrzParsedFields({ gender: "X" }));
      expect(nonBinary.gender).toBe("X");

      const emptyGender = service.normalizeFields(makeMrzParsedFields({ gender: "" }));
      expect(emptyGender.gender).toBe("UNKNOWN");
    });

    it("normalizes document type to PASSPORT or ID_CARD or UNKNOWN", () => {
      const passport = service.normalizeFields(makeMrzParsedFields({ documentType: "P" }));
      expect(passport.documentType).toBe("PASSPORT");

      const idCard = service.normalizeFields(makeMrzParsedFields({ documentType: "ID" }));
      expect(idCard.documentType).toBe("ID_CARD");

      const unknown = service.normalizeFields(makeMrzParsedFields({ documentType: "OTHER" }));
      expect(unknown.documentType).toBe("UNKNOWN");
    });

    it("normalizes country codes from 2-letter to 3-letter ISO", () => {
      const country = service.normalizeFields(makeMrzParsedFields({ nationality: "VN" }));
      expect(country.nationality).toBe("VNM");
    });

    it("passes through 3-letter ISO country codes unchanged", () => {
      const country = service.normalizeFields(makeMrzParsedFields({ nationality: "USA" }));
      expect(country.nationality).toBe("USA");
    });

    it("handles empty nationality", () => {
      const result = service.normalizeFields(makeMrzParsedFields({ nationality: "" }));
      expect(result.nationality).toBe("");
    });

    it("normalizes dates from YYMMDD to YYYY-MM-DD", () => {
      const result = service.normalizeFields(makeMrzParsedFields({ dateOfBirth: "900115" }));
      expect(result.dateOfBirth).toBe("1990-01-15");
    });

    it("passes through already normalized YYYY-MM-DD dates", () => {
      const result = service.normalizeFields(makeMrzParsedFields({ dateOfBirth: "1990-01-15" }));
      expect(result.dateOfBirth).toBe("1990-01-15");
    });

    it("handles dates with separators", () => {
      const result = service.normalizeFields(makeMrzParsedFields({ dateOfBirth: "1990/01/15" }));
      expect(result.dateOfBirth).toBe("1990-01-15");
    });

    it("returns empty string for empty date", () => {
      const result = service.normalizeFields(makeMrzParsedFields({ expiryDate: "" }));
      expect(result.expiryDate).toBe("");
    });

    it("cleans document number by removing filler chars", () => {
      const result = service.normalizeFields(makeMrzParsedFields({ documentNumber: "AB12<345<6" }));
      expect(result.documentNumber).toBe("AB123456");
    });

    it("preserves raw original field values", () => {
      const parsed = makeMrzParsedFields();
      const result = service.normalizeFields(parsed);

      expect(result.rawOriginal.fullName).toBe("MUSTER JOHN MICHAEL");
      expect(result.rawOriginal.gender).toBe("M");
      expect(result.rawOriginal.dateOfBirth).toBe("1985-10-10");
      expect(result.rawOriginal.documentType).toBe("PASSPORT");
    });

    it("sets countryCode from issuingCountry when available", () => {
      const result = service.normalizeFields(makeMrzParsedFields({ issuingCountry: "VNM", nationality: "" }));
      expect(result.countryCode).toBe("VNM");
    });

    it("falls back to nationality for countryCode when issuingCountry is empty", () => {
      const result = service.normalizeFields(makeMrzParsedFields({ issuingCountry: "", nationality: "USA" }));
      expect(result.countryCode).toBe("USA");
    });

    it("maps many ISO2 country codes to ISO3", () => {
      const cases: Record<string, string> = {
        US: "USA",
        VN: "VNM",
        JP: "JPN",
        KR: "KOR",
        GB: "GBR",
        DE: "DEU",
        FR: "FRA",
        CN: "CHN",
        IN: "IND",
        BR: "BRA",
        AU: "AUS",
        CA: "CAN",
        RU: "RUS",
        MX: "MEX",
        ID: "IDN",
        SG: "SGP",
        TH: "THA",
        MY: "MYS",
        PH: "PHL",
        HK: "HKG",
        TW: "TWN",
        SE: "SWE",
        NO: "NOR",
        DK: "DNK",
        FI: "FIN",
        NL: "NLD",
        BE: "BEL",
        CH: "CHE",
        AT: "AUT",
        IT: "ITA",
        ES: "ESP",
        PT: "PRT",
        GR: "GRC",
        IE: "IRL",
        NZ: "NZL",
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
        SA: "SAU",
        QA: "QAT",
        KW: "KWT",
        PK: "PAK",
        BD: "BGD",
        LK: "LKA",
        NP: "NPL",
        MM: "MMR",
        LA: "LAO",
        KH: "KHM",
        MN: "MNG",
        KZ: "KAZ",
        UZ: "UZB",
      };
      for (const [iso2, iso3] of Object.entries(cases)) {
        const result = service.normalizeFields(makeMrzParsedFields({ nationality: iso2 }));
        expect(result.nationality).toBe(iso3);
      }
    });

    it("passes through unknown 2-letter codes unchanged", () => {
      const result = service.normalizeFields(makeMrzParsedFields({ nationality: "ZZ" }));
      expect(result.nationality).toBe("ZZ");
    });

    it("handles empty gender gracefully", () => {
      const result = service.normalizeFields(makeMrzParsedFields({ gender: "" }));
      expect(result.gender).toBe("UNKNOWN");
    });

    it("handles full name with filler characters", () => {
      const parsed = makeMrzParsedFields({
        surname: "MUSTER<MANN",
        givenName: "JOHN",
        fullName: "MUSTER<MANN JOHN",
      });
      const result = service.normalizeFields(parsed);
      expect(result.lastName).toBe("MUSTER MANN");
    });

    it("normalizes genders: MALE, FEMALE, NAM, NỮ, NU", () => {
      const m1 = service.normalizeFields(makeMrzParsedFields({ gender: "MALE" }));
      expect(m1.gender).toBe("M");

      const m2 = service.normalizeFields(makeMrzParsedFields({ gender: "NAM" }));
      expect(m2.gender).toBe("M");

      const f1 = service.normalizeFields(makeMrzParsedFields({ gender: "FEMALE" }));
      expect(f1.gender).toBe("F");

      const f2 = service.normalizeFields(makeMrzParsedFields({ gender: "NỮ" }));
      expect(f2.gender).toBe("F");

      const f3 = service.normalizeFields(makeMrzParsedFields({ gender: "NU" }));
      expect(f3.gender).toBe("F");
    });

    it("normalizes non-binary gender variants to X", () => {
      const x = service.normalizeFields(makeMrzParsedFields({ gender: "X" }));
      expect(x.gender).toBe("X");

      const nonBinary = service.normalizeFields(makeMrzParsedFields({ gender: "NON-BINARY" }));
      expect(nonBinary.gender).toBe("X");

      const nonbinary = service.normalizeFields(makeMrzParsedFields({ gender: "NONBINARY" }));
      expect(nonbinary.gender).toBe("X");

      const other = service.normalizeFields(makeMrzParsedFields({ gender: "OTHER" }));
      expect(other.gender).toBe("X");
    });

    it("normalizes document types: P, PN, PD, I, IDENTITY, IDENTITY_CARD", () => {
      const p = service.normalizeFields(makeMrzParsedFields({ documentType: "P" }));
      expect(p.documentType).toBe("PASSPORT");

      const pn = service.normalizeFields(makeMrzParsedFields({ documentType: "PN" }));
      expect(pn.documentType).toBe("PASSPORT");

      const pd = service.normalizeFields(makeMrzParsedFields({ documentType: "PD" }));
      expect(pd.documentType).toBe("PASSPORT");

      const identity = service.normalizeFields(makeMrzParsedFields({ documentType: "IDENTITY" }));
      expect(identity.documentType).toBe("ID_CARD");

      const identityCard = service.normalizeFields(makeMrzParsedFields({ documentType: "IDENTITY_CARD" }));
      expect(identityCard.documentType).toBe("ID_CARD");

      const i = service.normalizeFields(makeMrzParsedFields({ documentType: "I" }));
      expect(i.documentType).toBe("ID_CARD");
    });

    it("produces all expected output fields", () => {
      const result = service.normalizeFields(makeMrzParsedFields());

      const expectedKeys = [
        "fullName",
        "firstName",
        "lastName",
        "gender",
        "dateOfBirth",
        "nationality",
        "countryCode",
        "documentType",
        "documentNumber",
        "passportNumber",
        "idNumber",
        "issueDate",
        "expiryDate",
        "issuingCountry",
        "mrzRaw",
        "mrzParsed",
        "rawOriginal",
      ];
      for (const key of expectedKeys) {
        expect(result).toHaveProperty(key);
      }
    });

    it("preserves mrzRaw and mrzParsed", () => {
      const parsed = makeMrzParsedFields();
      const result = service.normalizeFields(parsed);

      expect(result.mrzRaw).toBe(parsed.mrzRaw);
      expect(result.mrzParsed).toEqual(parsed.mrzParsed);
    });
  });
});
