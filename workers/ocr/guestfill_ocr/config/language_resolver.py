"""Language resolution for global OCR support.

Resolves the best OCR language(s) from a country code,
document type, or script detection. Supports 60+ countries
mapped to PaddleOCR and Tesseract language codes.
"""

from dataclasses import dataclass, field

ISO3_TO_PPOCR: dict[str, str] = {
    "GBR": "en",
    "USA": "en",
    "CAN": "en",
    "AUS": "en",
    "NZL": "en",
    "IRL": "en",
    "ZAF": "en",
    "NGA": "en",
    "GHA": "en",
    "KEN": "en",
    "FRA": "fr",
    "DEU": "de",
    "ITA": "it",
    "ESP": "es",
    "PRT": "pt",
    "NLD": "nl",
    "BEL": "nl",
    "CHE": "en",
    "AUT": "de",
    "SWE": "en",
    "NOR": "en",
    "DNK": "en",
    "FIN": "en",
    "POL": "pl",
    "CZE": "en",
    "HUN": "en",
    "ROU": "en",
    "GRC": "en",
    "TUR": "tr",
    "RUS": "ru",
    "UKR": "ru",
    "BLR": "ru",
    "KAZ": "ru",
    "SRB": "ru",
    "BGR": "ru",
    "CHN": "ch",
    "TWN": "ch",
    "HKG": "ch",
    "JPN": "ja",
    "KOR": "ko",
    "VNM": "vi",
    "IDN": "vi",
    "PHL": "en",
    "MYS": "en",
    "SGP": "en",
    "THA": "en",
    "MMR": "en",
    "KHM": "en",
    "LAO": "en",
    "ARE": "ar",
    "SAU": "ar",
    "QAT": "ar",
    "OMN": "ar",
    "BHR": "ar",
    "KWT": "ar",
    "JOR": "ar",
    "EGY": "ar",
    "MAR": "ar",
    "DZA": "ar",
    "TUN": "ar",
    "LBN": "ar",
    "IRQ": "ar",
    "SYR": "ar",
    "LBY": "ar",
    "ISR": "en",
    "IRN": "en",
    "IND": "en",
    "NPL": "en",
    "BGD": "en",
    "PAK": "en",
    "LKA": "en",
    "BRA": "pt",
    "MEX": "es",
    "ARG": "es",
    "COL": "es",
    "CHL": "es",
    "PER": "es",
    "VEN": "es",
}

ISO3_TO_TESSERACT: dict[str, str] = {
    "GBR": "eng",
    "USA": "eng",
    "CAN": "eng",
    "AUS": "eng",
    "NZL": "eng",
    "IRL": "eng",
    "ZAF": "eng",
    "NGA": "eng",
    "GHA": "eng",
    "KEN": "eng",
    "FRA": "fra",
    "DEU": "deu",
    "ITA": "ita",
    "ESP": "spa",
    "PRT": "por",
    "NLD": "nld",
    "BEL": "nld",
    "CHE": "eng",
    "AUT": "deu",
    "SWE": "swe",
    "NOR": "nor",
    "DNK": "dan",
    "FIN": "fin",
    "POL": "pol",
    "CZE": "ces",
    "HUN": "hun",
    "ROU": "ron",
    "GRC": "ell",
    "TUR": "tur",
    "RUS": "rus",
    "UKR": "ukr",
    "BLR": "bel",
    "KAZ": "kaz",
    "SRB": "srp",
    "BGR": "bul",
    "CHN": "chi_sim",
    "TWN": "chi_tra",
    "HKG": "chi_tra",
    "JPN": "jpn",
    "KOR": "kor",
    "VNM": "vie",
    "IDN": "ind",
    "PHL": "eng",
    "MYS": "eng",
    "SGP": "eng",
    "THA": "tha",
    "MMR": "eng",
    "KHM": "eng",
    "LAO": "eng",
    "ARE": "ara",
    "SAU": "ara",
    "QAT": "ara",
    "OMN": "ara",
    "BHR": "ara",
    "KWT": "ara",
    "JOR": "ara",
    "EGY": "ara",
    "MAR": "ara",
    "DZA": "ara",
    "TUN": "ara",
    "LBN": "ara",
    "IRQ": "ara",
    "SYR": "ara",
    "LBY": "ara",
    "ISR": "heb",
    "IRN": "eng",
    "IND": "eng",
    "NPL": "eng",
    "BGD": "ben",
    "PAK": "eng",
    "LKA": "eng",
    "BRA": "por",
    "MEX": "spa",
    "ARG": "spa",
    "COL": "spa",
    "CHL": "spa",
    "PER": "spa",
    "VEN": "spa",
}

COUNTRY_TO_SCRIPT: dict[str, str] = {
    "GBR": "latin",
    "USA": "latin",
    "CAN": "latin",
    "AUS": "latin",
    "NZL": "latin",
    "IRL": "latin",
    "ZAF": "latin",
    "FRA": "latin",
    "DEU": "latin",
    "ITA": "latin",
    "ESP": "latin",
    "PRT": "latin",
    "NLD": "latin",
    "BEL": "latin",
    "CHE": "latin",
    "AUT": "latin",
    "SWE": "latin",
    "NOR": "latin",
    "DNK": "latin",
    "FIN": "latin",
    "POL": "latin",
    "CZE": "latin",
    "HUN": "latin",
    "ROU": "latin",
    "GRC": "greek",
    "TUR": "latin",
    "RUS": "cyrillic",
    "UKR": "cyrillic",
    "BLR": "cyrillic",
    "KAZ": "cyrillic",
    "SRB": "cyrillic",
    "BGR": "cyrillic",
    "CHN": "cjk",
    "TWN": "cjk",
    "HKG": "cjk",
    "JPN": "cjk",
    "KOR": "cjk",
    "VNM": "latin",
    "IDN": "latin",
    "PHL": "latin",
    "MYS": "latin",
    "SGP": "latin",
    "THA": "thai",
    "MMR": "latin",
    "KHM": "latin",
    "LAO": "latin",
    "ARE": "arabic",
    "SAU": "arabic",
    "QAT": "arabic",
    "OMN": "arabic",
    "BHR": "arabic",
    "KWT": "arabic",
    "JOR": "arabic",
    "EGY": "arabic",
    "MAR": "arabic",
    "DZA": "arabic",
    "TUN": "arabic",
    "LBN": "arabic",
    "IRQ": "arabic",
    "SYR": "arabic",
    "LBY": "arabic",
    "ISR": "hebrew",
    "IRN": "arabic",
    "IND": "devanagari",
    "NPL": "devanagari",
    "BGD": "bengali",
    "PAK": "arabic",
    "LKA": "latin",
    "NGA": "latin",
    "GHA": "latin",
    "KEN": "latin",
    "BRA": "latin",
    "MEX": "latin",
    "ARG": "latin",
    "COL": "latin",
    "CHL": "latin",
    "PER": "latin",
    "VEN": "latin",
}


@dataclass
class LanguageResolution:
    primary: str
    alternatives: list[str] = field(default_factory=list)
    script: str = "latin"
    tesseract_primary: str = "eng"
    tesseract_alternatives: list[str] = field(default_factory=list)
    confidence: float = 0.8


def resolve_ocr_languages(country_code: str | None = None) -> LanguageResolution:
    if country_code is None or country_code not in ISO3_TO_PPOCR:
        return _resolve_unknown()

    ppocr_lang = ISO3_TO_PPOCR[country_code]
    tess_lang = ISO3_TO_TESSERACT.get(country_code, "eng")
    script = COUNTRY_TO_SCRIPT.get(country_code, "latin")

    alternatives = _build_paddle_alternatives(ppocr_lang, script)
    tess_alternatives = _build_tesseract_alternatives(tess_lang, script)

    return LanguageResolution(
        primary=ppocr_lang,
        alternatives=alternatives,
        script=script,
        tesseract_primary=tess_lang,
        tesseract_alternatives=tess_alternatives,
        confidence=1.0,
    )


def _resolve_unknown() -> LanguageResolution:
    return LanguageResolution(
        primary="ml",
        alternatives=["ml", "en", "fr", "de", "es", "ar", "ru", "ch", "ja", "ko"],
        script="latin",
        tesseract_primary="eng",
        tesseract_alternatives=["eng", "fra", "deu", "spa", "ara", "rus", "chi_sim", "jpn", "kor"],
        confidence=0.5,
    )


def _build_paddle_alternatives(primary: str, script: str) -> list[str]:
    bases = ["ml", primary]
    if script == "arabic" or script == "cyrillic":
        bases.append("en")
    elif script == "cjk":
        bases.extend(["en", primary])
    elif script == "devanagari" or script == "thai" or script == "hebrew" or script == "greek":
        bases.append("en")
    else:
        bases.extend(["fr", "de", "es"])
    seen: set[str] = set()
    result: list[str] = []
    for lang in bases:
        if lang not in seen:
            seen.add(lang)
            result.append(lang)
    return result


def _build_tesseract_alternatives(primary: str, script: str) -> list[str]:
    bases = [primary]
    if script == "arabic":
        bases.append("ara")
    elif script == "cyrillic":
        bases.append("rus")
    elif script == "cjk":
        bases.extend(["chi_sim", "jpn", "kor"])
    else:
        bases.extend(["eng", "fra", "deu", "spa"])
    seen: set[str] = set()
    result: list[str] = []
    for lang in bases:
        if lang not in seen:
            seen.add(lang)
            result.append(lang)
    return result


def resolve_paddleocr_lang(country_code: str | None = None) -> str:
    if country_code is None:
        return "ml"
    return ISO3_TO_PPOCR.get(country_code, "ml")


def resolve_tesseract_lang(country_code: str | None = None) -> str:
    if country_code is None:
        return "eng"
    return ISO3_TO_TESSERACT.get(country_code, "eng")


def resolve_script(country_code: str | None = None) -> str:
    if country_code is None:
        return "latin"
    return COUNTRY_TO_SCRIPT.get(country_code, "latin")


def get_region_priority_languages(script: str) -> list[str]:
    script_to_langs: dict[str, list[str]] = {
        "latin": ["ml", "en", "fr", "de", "es", "it", "pt", "nl"],
        "arabic": ["ml", "ar", "en", "fr"],
        "cyrillic": ["ml", "ru", "en"],
        "cjk": ["ml", "ch", "en", "ja", "ko"],
        "devanagari": ["ml", "en"],
        "thai": ["ml", "en"],
        "hebrew": ["ml", "en"],
        "greek": ["ml", "en"],
    }
    return script_to_langs.get(script, ["ml", "en"])


def get_tesseract_lang_for_script(script: str) -> list[str]:
    script_to_langs: dict[str, list[str]] = {
        "latin": ["eng", "fra", "deu", "spa", "ita", "por", "nld"],
        "arabic": ["ara", "eng", "fra"],
        "cyrillic": ["rus", "eng", "ukr"],
        "cjk": ["chi_sim", "jpn", "kor", "eng"],
        "devanagari": ["eng"],
        "thai": ["tha", "eng"],
        "hebrew": ["heb", "eng"],
        "greek": ["ell", "eng"],
    }
    return script_to_langs.get(script, ["eng"])
