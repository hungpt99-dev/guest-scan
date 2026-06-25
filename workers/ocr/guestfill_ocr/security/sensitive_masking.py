"""Mask sensitive data for safe logging and display."""


def mask_string(value: str, visible_start: int = 4, mask_char: str = "*") -> str:
    if not value:
        return ""
    if len(value) <= visible_start:
        return value
    visible = value[:visible_start]
    masked = mask_char * (len(value) - visible_start)
    return visible + masked


def mask_passport_number(passport: str) -> str:
    return mask_string(passport, 4)


def mask_id_number(id_num: str) -> str:
    return mask_string(id_num, 4)


def mask_full_name(name: str) -> str:
    if not name:
        return ""
    parts = name.split()
    if not parts:
        return name
    last = parts[-1]
    if len(parts) > 1:
        return " ".join(parts[:-1]) + " " + mask_string(last, 1)
    return mask_string(last, 1)


def mask_date_of_birth(dob: str) -> str:
    return mask_string(dob, 4)


def mask_mrz_text(mrz: str) -> str:
    if len(mrz) <= 10:
        return mrz[:5] + "*****" if len(mrz) > 5 else mrz
    return mrz[:5] + "****" + mrz[-1]
