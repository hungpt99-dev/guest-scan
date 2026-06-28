"""Safe MRZ repair using check digit validation.

Supports TD1 (3x30), TD2 (2x36), and TD3 (2x44) formats.
"""

from guestfill_ocr.passport.mrz_validator import compute_check_digit, validate_check_digit

CHAR_REPAIR_MAP: dict[str, list[str]] = {
    "O": ["0"],
    "I": ["1"],
    "B": ["8"],
    "S": ["5"],
    "Z": ["2"],
    "0": ["O"],
    "1": ["I"],
    "8": ["B"],
    "5": ["S"],
    "2": ["Z"],
}

MRZ_TD1_LENGTH = 30
MRZ_TD2_LENGTH = 36
MRZ_TD3_LENGTH = 44


def try_repair_field(field_value: str, expected_digit: str, field_name: str) -> tuple[str, bool, str]:
    if expected_digit == "<":
        return field_value, False, ""
    if validate_check_digit(field_value, expected_digit):
        return field_value, False, ""
    for idx, ch in enumerate(field_value):
        if ch in CHAR_REPAIR_MAP:
            for replacement in CHAR_REPAIR_MAP[ch]:
                candidate = field_value[:idx] + replacement + field_value[idx + 1 :]
                if validate_check_digit(candidate, expected_digit):
                    return candidate, True, f"{field_name}_REPAIRED"
    return field_value, False, ""


def try_repair_mrz(line1: str, line2: str, line3: str | None = None) -> tuple[list[str], list[str]]:
    l1 = len(line1) if line1 else 0
    l2 = len(line2) if line2 else 0
    l3 = len(line3) if line3 else 0

    if l1 >= MRZ_TD3_LENGTH and l2 >= MRZ_TD3_LENGTH:
        return _repair_td3(line1, line2)
    if l1 >= MRZ_TD1_LENGTH and l2 >= MRZ_TD1_LENGTH and line3 is not None and l3 >= MRZ_TD1_LENGTH:
        return _repair_td1(line1, line2, line3)
    if l1 >= MRZ_TD2_LENGTH and l2 >= MRZ_TD2_LENGTH:
        return _repair_td2(line1, line2)

    return [line1, line2], ["FORMAT_UNKNOWN"]


def _repair_td3(line1: str, line2: str) -> tuple[list[str], list[str]]:
    warnings: list[str] = []
    new_warnings: list[str] = []

    if len(line2) < 44:
        return [line1, line2], ["CHECK_DIGIT_FAILED"]

    repaired_line2 = list(line2)

    repaired, changed, warn = try_repair_field(line2[0:9], line2[9:10], "PASSPORT_NUMBER")
    if changed:
        for i, ch in enumerate(repaired):
            repaired_line2[i] = ch
        new_warnings.append(warn)

    repaired, changed, warn = try_repair_field(line2[13:19], line2[19:20], "DOB")
    if changed:
        for i, ch in enumerate(repaired):
            repaired_line2[13 + i] = ch
        new_warnings.append(warn)

    repaired, changed, warn = try_repair_field(line2[21:27], line2[27:28], "EXPIRY")
    if changed:
        for i, ch in enumerate(repaired):
            repaired_line2[21 + i] = ch
        new_warnings.append(warn)

    composite_input = "".join(repaired_line2[0:10]) + "".join(repaired_line2[13:20]) + "".join(repaired_line2[21:43])
    composite_cd = line2[43:44]
    computed = compute_check_digit(composite_input)
    if composite_cd != "<" and computed != composite_cd:
        new_warnings.append("FINAL_CHECK_FAILED")

    if new_warnings:
        warnings.append("MRZ_REPAIRED")
        warnings.extend(new_warnings)
        return [line1, "".join(repaired_line2)], warnings

    return [line1, line2], warnings


def _repair_td1(line1: str, line2: str, line3: str) -> tuple[list[str], list[str]]:
    warnings: list[str] = []
    new_warnings: list[str] = []

    if len(line2) < 30:
        return [line1, line2, line3], ["CHECK_DIGIT_FAILED"]

    repaired_line2 = list(line2)

    repaired, changed, warn = try_repair_field(line2[0:9], line2[9:10], "PASSPORT_NUMBER")
    if changed:
        for i, ch in enumerate(repaired):
            repaired_line2[i] = ch
        new_warnings.append(warn)

    repaired, changed, warn = try_repair_field(line2[13:19], line2[19:20], "DOB")
    if changed:
        for i, ch in enumerate(repaired):
            repaired_line2[13 + i] = ch
        new_warnings.append(warn)

    repaired, changed, warn = try_repair_field(line2[21:27], line2[27:28], "EXPIRY")
    if changed:
        for i, ch in enumerate(repaired):
            repaired_line2[21 + i] = ch
        new_warnings.append(warn)

    if new_warnings:
        warnings.append("MRZ_REPAIRED")
        warnings.extend(new_warnings)
        return [line1, "".join(repaired_line2), line3], warnings

    return [line1, line2, line3], warnings


def _repair_td2(line1: str, line2: str) -> tuple[list[str], list[str]]:
    warnings: list[str] = []
    new_warnings: list[str] = []

    if len(line2) < 36:
        return [line1, line2], ["CHECK_DIGIT_FAILED"]

    repaired_line2 = list(line2)

    repaired, changed, warn = try_repair_field(line2[0:9], line2[9:10], "PASSPORT_NUMBER")
    if changed:
        for i, ch in enumerate(repaired):
            repaired_line2[i] = ch
        new_warnings.append(warn)

    repaired, changed, warn = try_repair_field(line2[13:19], line2[19:20], "DOB")
    if changed:
        for i, ch in enumerate(repaired):
            repaired_line2[13 + i] = ch
        new_warnings.append(warn)

    repaired, changed, warn = try_repair_field(line2[21:27], line2[27:28], "EXPIRY")
    if changed:
        for i, ch in enumerate(repaired):
            repaired_line2[21 + i] = ch
        new_warnings.append(warn)

    if new_warnings:
        warnings.append("MRZ_REPAIRED")
        warnings.extend(new_warnings)
        return [line1, "".join(repaired_line2)], warnings

    return [line1, line2], warnings
