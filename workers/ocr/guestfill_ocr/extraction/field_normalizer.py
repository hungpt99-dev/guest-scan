"""Normalize extracted fields to standard formats."""

import re
from datetime import datetime


def normalize_name(raw: str) -> str:
    if not raw:
        return ""
    name = raw.strip()
    name = re.sub(r"\s+", " ", name)
    name = name.replace("<", " ")
    name = re.sub(r"\s+", " ", name).strip()
    return name.upper()


def normalize_passport_number(raw: str) -> str:
    if not raw:
        return ""
    return raw.strip().upper().rstrip("<")


def normalize_id_number(raw: str) -> str:
    if not raw:
        return ""
    return raw.strip().upper()


def normalize_gender(raw: str) -> str:
    if not raw:
        return "UNKNOWN"
    upper = raw.strip().upper()
    if upper in ("M", "MALE", "NAM"):
        return "M"
    if upper in ("F", "FEMALE", "NỮ", "NU"):
        return "F"
    if upper == "<":
        return "UNKNOWN"
    return "UNKNOWN"


def normalize_date(raw: str, output_format: str = "yyyy-MM-dd") -> str:
    if not raw:
        return ""
    clean = raw.strip().replace(" ", "")
    patterns = [
        (r"^(\d{2})(\d{2})(\d{4})$", "%d%m%Y"),
        (r"^(\d{4})(\d{2})(\d{2})$", "%Y%m%d"),
        (r"^(\d{2})(\d{2})(\d{2})$", "%y%m%d"),
    ]
    for pattern, fmt in patterns:
        m = re.match(pattern, clean)
        if m:
            try:
                dt = datetime.strptime(clean, fmt)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                pass
    separators = ["-", "/", "."]
    for sep in separators:
        parts = clean.split(sep)
        if len(parts) == 3:
            if len(parts[0]) == 4:
                try:
                    dt = datetime.strptime(clean, f"%Y{sep}%m{sep}%d")
                    return dt.strftime("%Y-%m-%d")
                except ValueError:
                    pass
            elif len(parts[2]) == 4:
                try:
                    dt = datetime.strptime(clean, f"%d{sep}%m{sep}%Y")
                    return dt.strftime("%Y-%m-%d")
                except ValueError:
                    pass
                try:
                    dt = datetime.strptime(clean, f"%m{sep}%d{sep}%Y")
                    return dt.strftime("%Y-%m-%d")
                except ValueError:
                    pass
            elif len(parts[2]) == 2:
                try:
                    dt = datetime.strptime(clean, f"%d{sep}%m{sep}%y")
                    return dt.strftime("%Y-%m-%d")
                except ValueError:
                    pass
    return raw


def normalize_country(raw: str, output_format: str = "ISO3") -> str:
    if not raw:
        return ""
    upper = raw.strip().upper()
    if len(upper) == 3:
        return upper
    if len(upper) == 2:
        country_map = {
            "VN": "VNM",
            "US": "USA",
            "KR": "KOR",
            "CN": "CHN",
            "JP": "JPN",
            "FR": "FRA",
            "DE": "DEU",
            "GB": "GBR",
            "IT": "ITA",
            "ES": "ESP",
            "CA": "CAN",
            "AU": "AUS",
            "BR": "BRA",
            "MX": "MEX",
            "IN": "IND",
            "RU": "RUS",
            "TH": "THA",
            "SG": "SGP",
            "MY": "MYS",
            "ID": "IDN",
        }
        return country_map.get(upper, upper)
    return upper[:3] if len(upper) >= 3 else upper
