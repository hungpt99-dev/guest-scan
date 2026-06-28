"""Safe MRZ repair using check digit validation."""

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


def try_repair_mrz(line1: str, line2: str) -> tuple[list[str], list[str]]:
    warnings: list[str] = []
    new_warnings: list[str] = []
    if len(line2) < 44:
        return [line1, line2], ["CHECK_DIGIT_FAILED"]

    repaired_line2 = list(line2)

    passport_num = line2[0:9]
    passport_cd = line2[9:10]
    repaired, changed, warn = try_repair_field(passport_num, passport_cd, "PASSPORT_NUMBER")
    if changed:
        for i, ch in enumerate(repaired):
            repaired_line2[i] = ch
        new_warnings.append(warn)

    dob = line2[13:19]
    dob_cd = line2[19:20]
    repaired, changed, warn = try_repair_field(dob, dob_cd, "DOB")
    if changed:
        for i, ch in enumerate(repaired):
            repaired_line2[13 + i] = ch
        new_warnings.append(warn)

    expiry = line2[21:27]
    expiry_cd = line2[27:28]
    repaired, changed, warn = try_repair_field(expiry, expiry_cd, "EXPIRY")
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
