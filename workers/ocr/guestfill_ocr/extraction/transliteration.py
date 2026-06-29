"""Transliteration module for non-Latin to Latin script conversion.

Provides transliteration for guest names found in passport visual zones
that use non-Latin scripts (Arabic, Cyrillic, CJK, Devanagari, etc.).

All transliteration is done locally with built-in mappings.
No external API calls or network requests.
"""

from dataclasses import dataclass, field

ARABIC_TO_LATIN: dict[str, str] = {
    "\u0627": "A",
    "\u0628": "B",
    "\u062a": "T",
    "\u062b": "TH",
    "\u062c": "J",
    "\u062d": "H",
    "\u062e": "KH",
    "\u062f": "D",
    "\u0630": "DH",
    "\u0631": "R",
    "\u0632": "Z",
    "\u0633": "S",
    "\u0634": "SH",
    "\u0635": "S",
    "\u0636": "D",
    "\u0637": "T",
    "\u0638": "Z",
    "\u0639": "A",
    "\u063a": "GH",
    "\u0641": "F",
    "\u0642": "Q",
    "\u0643": "K",
    "\u0644": "L",
    "\u0645": "M",
    "\u0646": "N",
    "\u0647": "H",
    "\u0648": "W",
    "\u064a": "Y",
    "\u0621": "",
    "\u0623": "A",
    "\u0625": "I",
    "\u0624": "W",
    "\u0626": "Y",
    "\u0649": "A",
    "\u0629": "H",
    # Arabic diacritics - skip
    "\u064e": "",
    "\u064f": "",
    "\u0650": "",
    "\u0651": "",
    "\u0652": "",
}

CYRILLIC_TO_LATIN: dict[str, str] = {
    "\u0410": "A",
    "\u0411": "B",
    "\u0412": "V",
    "\u0413": "G",
    "\u0414": "D",
    "\u0415": "E",
    "\u0401": "YO",
    "\u0416": "ZH",
    "\u0417": "Z",
    "\u0418": "I",
    "\u0419": "Y",
    "\u041a": "K",
    "\u041b": "L",
    "\u041c": "M",
    "\u041d": "N",
    "\u041e": "O",
    "\u041f": "P",
    "\u0420": "R",
    "\u0421": "S",
    "\u0422": "T",
    "\u0423": "U",
    "\u0424": "F",
    "\u0425": "KH",
    "\u0426": "TS",
    "\u0427": "CH",
    "\u0428": "SH",
    "\u0429": "SHCH",
    "\u042a": "",
    "\u042b": "Y",
    "\u042c": "",
    "\u042d": "E",
    "\u042e": "YU",
    "\u042f": "YA",
    "\u0430": "a",
    "\u0431": "b",
    "\u0432": "v",
    "\u0433": "g",
    "\u0434": "d",
    "\u0435": "e",
    "\u0451": "yo",
    "\u0436": "zh",
    "\u0437": "z",
    "\u0438": "i",
    "\u0439": "y",
    "\u043a": "k",
    "\u043b": "l",
    "\u043c": "m",
    "\u043d": "n",
    "\u043e": "o",
    "\u043f": "p",
    "\u0440": "r",
    "\u0441": "s",
    "\u0442": "t",
    "\u0443": "u",
    "\u0444": "f",
    "\u0445": "kh",
    "\u0446": "ts",
    "\u0447": "ch",
    "\u0448": "sh",
    "\u0449": "shch",
    "\u044a": "",
    "\u044b": "y",
    "\u044c": "",
    "\u044d": "e",
    "\u044e": "yu",
    "\u044f": "ya",
}

GREEK_TO_LATIN: dict[str, str] = {
    "\u0391": "A",
    "\u0392": "V",
    "\u0393": "G",
    "\u0394": "D",
    "\u0395": "E",
    "\u0396": "Z",
    "\u0397": "I",
    "\u0398": "TH",
    "\u0399": "I",
    "\u039a": "K",
    "\u039b": "L",
    "\u039c": "M",
    "\u039d": "N",
    "\u039e": "X",
    "\u039f": "O",
    "\u03a0": "P",
    "\u03a1": "R",
    "\u03a3": "S",
    "\u03a4": "T",
    "\u03a5": "Y",
    "\u03a6": "F",
    "\u03a7": "CH",
    "\u03a8": "PS",
    "\u03a9": "O",
    "\u03b1": "a",
    "\u03b2": "v",
    "\u03b3": "g",
    "\u03b4": "d",
    "\u03b5": "e",
    "\u03b6": "z",
    "\u03b7": "i",
    "\u03b8": "th",
    "\u03b9": "i",
    "\u03ba": "k",
    "\u03bb": "l",
    "\u03bc": "m",
    "\u03bd": "n",
    "\u03be": "x",
    "\u03bf": "o",
    "\u03c0": "p",
    "\u03c1": "r",
    "\u03c3": "s",
    "\u03c4": "t",
    "\u03c5": "y",
    "\u03c6": "f",
    "\u03c7": "ch",
    "\u03c8": "ps",
    "\u03c9": "o",
}

DEVANAGARI_TO_LATIN: dict[str, str] = {
    "\u0905": "a",
    "\u0906": "aa",
    "\u0907": "i",
    "\u0908": "ii",
    "\u0909": "u",
    "\u090a": "uu",
    "\u090b": "ri",
    "\u090f": "e",
    "\u0910": "ai",
    "\u0913": "o",
    "\u0914": "au",
    "\u0915": "k",
    "\u0916": "kh",
    "\u0917": "g",
    "\u0918": "gh",
    "\u0919": "ng",
    "\u091a": "ch",
    "\u091b": "chh",
    "\u091c": "j",
    "\u091d": "jh",
    "\u091e": "ny",
    "\u091f": "t",
    "\u0920": "th",
    "\u0921": "d",
    "\u0922": "dh",
    "\u0923": "n",
    "\u0924": "t",
    "\u0925": "th",
    "\u0926": "d",
    "\u0927": "dh",
    "\u0928": "n",
    "\u092a": "p",
    "\u092b": "ph",
    "\u092c": "b",
    "\u092d": "bh",
    "\u092e": "m",
    "\u092f": "y",
    "\u0930": "r",
    "\u0932": "l",
    "\u0933": "l",
    "\u0935": "v",
    "\u0936": "sh",
    "\u0937": "sh",
    "\u0938": "s",
    "\u0939": "h",
    "\u093e": "aa",
    "\u093f": "i",
    "\u0940": "ii",
    "\u0941": "u",
    "\u0942": "uu",
    "\u0943": "ri",
    "\u0947": "e",
    "\u0948": "ai",
    "\u094b": "o",
    "\u094c": "au",
}

THAI_TO_LATIN: dict[str, str] = {
    "\u0e01": "k",
    "\u0e02": "kh",
    "\u0e03": "kh",
    "\u0e04": "kh",
    "\u0e05": "kh",
    "\u0e06": "k",
    "\u0e07": "ng",
    "\u0e08": "ch",
    "\u0e09": "ch",
    "\u0e0a": "ch",
    "\u0e0b": "s",
    "\u0e0c": "ch",
    "\u0e0d": "y",
    "\u0e0e": "d",
    "\u0e0f": "t",
    "\u0e10": "th",
    "\u0e11": "th",
    "\u0e12": "th",
    "\u0e13": "n",
    "\u0e14": "d",
    "\u0e15": "t",
    "\u0e16": "th",
    "\u0e17": "th",
    "\u0e18": "th",
    "\u0e19": "n",
    "\u0e1a": "b",
    "\u0e1b": "p",
    "\u0e1c": "ph",
    "\u0e1d": "f",
    "\u0e1e": "ph",
    "\u0e1f": "f",
    "\u0e20": "ph",
    "\u0e21": "m",
    "\u0e22": "y",
    "\u0e23": "r",
    "\u0e24": "ri",
    "\u0e25": "l",
    "\u0e26": "lu",
    "\u0e27": "w",
    "\u0e28": "s",
    "\u0e29": "s",
    "\u0e2a": "s",
    "\u0e2b": "h",
    "\u0e2c": "l",
    "\u0e2d": "o",
    "\u0e2e": "h",
}


@dataclass
class TransliterationResult:
    latin: str = ""
    method: str = ""
    confidence: float = 0.0
    details: dict = field(default_factory=dict)


def _detect_non_latin_script(text: str) -> str | None:
    if not text:
        return None

    arabic_count = sum(1 for ch in text if "\u0600" <= ch <= "\u06ff" or "\u0750" <= ch <= "\u077f")
    cyrillic_count = sum(1 for ch in text if "\u0400" <= ch <= "\u04ff")
    greek_count = sum(1 for ch in text if "\u0370" <= ch <= "\u03ff")
    devanagari_count = sum(1 for ch in text if "\u0900" <= ch <= "\u097f")
    thai_count = sum(1 for ch in text if "\u0e00" <= ch <= "\u0e7f")
    cjk_count = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff" or "\u3400" <= ch <= "\u4dbf")

    non_latin = arabic_count + cyrillic_count + greek_count + devanagari_count + thai_count + cjk_count
    if non_latin == 0:
        return None

    if cjk_count > non_latin * 0.5:
        return "cjk"
    if arabic_count > non_latin * 0.5:
        return "arabic"
    if cyrillic_count > non_latin * 0.5:
        return "cyrillic"
    if devanagari_count > non_latin * 0.5:
        return "devanagari"
    if thai_count > non_latin * 0.5:
        return "thai"
    if greek_count > non_latin * 0.5:
        return "greek"

    return None


def transliterate(text: str, source_script: str | None = None) -> TransliterationResult:
    if not text:
        return TransliterationResult()

    if source_script is None:
        source_script = _detect_non_latin_script(text)
        if source_script is None:
            return TransliterationResult(latin=text, method="none", confidence=1.0)

    if source_script == "arabic":
        return _transliterate_arabic(text)
    elif source_script == "cyrillic":
        return _transliterate_cyrillic(text)
    elif source_script == "cjk":
        return _transliterate_cjk(text)
    elif source_script == "devanagari":
        return _transliterate_devanagari(text)
    elif source_script == "thai":
        return _transliterate_thai(text)
    elif source_script == "greek":
        return _transliterate_greek(text)

    return TransliterationResult(latin=text, method="none", confidence=1.0)


def _transliterate_arabic(text: str) -> TransliterationResult:
    result: list[str] = []
    for ch in text:
        tr = ARABIC_TO_LATIN.get(ch, ch)
        if tr:
            result.append(tr)
    latin = "".join(result)
    return TransliterationResult(
        latin=latin,
        method="arabic_iso233",
        confidence=0.7 if latin else 0.0,
        details={"source_script": "arabic", "char_count": len(text)},
    )


def _transliterate_cyrillic(text: str) -> TransliterationResult:
    result: list[str] = []
    for ch in text:
        tr = CYRILLIC_TO_LATIN.get(ch, ch)
        if tr:
            result.append(tr)
    latin = "".join(result)
    return TransliterationResult(
        latin=latin,
        method="cyrillic_iso9",
        confidence=0.8 if latin else 0.0,
        details={"source_script": "cyrillic", "char_count": len(text)},
    )


def _transliterate_cjk(text: str) -> TransliterationResult:
    latin = text
    return TransliterationResult(
        latin=latin,
        method="cjk_preserved",
        confidence=0.3,
        details={"source_script": "cjk", "char_count": len(text)},
    )


def _transliterate_devanagari(text: str) -> TransliterationResult:
    result: list[str] = []
    for ch in text:
        tr = DEVANAGARI_TO_LATIN.get(ch, ch)
        if tr:
            result.append(tr)
        else:
            result.append(ch)
    latin = "".join(result)
    return TransliterationResult(
        latin=latin,
        method="devanagari_iso15919",
        confidence=0.7 if latin else 0.0,
        details={"source_script": "devanagari", "char_count": len(text)},
    )


def _transliterate_thai(text: str) -> TransliterationResult:
    result: list[str] = []
    for ch in text:
        tr = THAI_TO_LATIN.get(ch, ch)
        if tr:
            result.append(tr)
        else:
            result.append(ch)
    latin = "".join(result)
    return TransliterationResult(
        latin=latin,
        method="thai_iso11940",
        confidence=0.6 if latin else 0.0,
        details={"source_script": "thai", "char_count": len(text)},
    )


def _transliterate_greek(text: str) -> TransliterationResult:
    result: list[str] = []
    for ch in text:
        tr = GREEK_TO_LATIN.get(ch, ch)
        if tr:
            result.append(tr)
    latin = "".join(result)
    return TransliterationResult(
        latin=latin,
        method="greek_iso843",
        confidence=0.8 if latin else 0.0,
        details={"source_script": "greek", "char_count": len(text)},
    )
