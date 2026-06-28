"""MRZ check digit calculation and validation.

Supports TD1 (3x30), TD2 (2x36), and TD3 (2x44) formats.
"""

from typing import Any


def char_value(ch: str) -> int:
    if ch.isdigit():
        return int(ch)
    if "A" <= ch <= "Z":
        return ord(ch) - ord("A") + 10
    if ch == "<":
        return 0
    raise ValueError(f"Invalid MRZ character: {ch}")


def compute_check_digit(value: str) -> str:
    weights = [7, 3, 1]
    total = 0
    for index, ch in enumerate(value):
        total += char_value(ch) * weights[index % 3]
    return str(total % 10)


def validate_check_digit(value: str, expected_digit: str) -> bool:
    if expected_digit == "<":
        return True
    computed = compute_check_digit(value)
    return computed == expected_digit


def validate_full_mrz(line1: str, line2: str) -> dict[str, Any]:
    return validate_check_digits_td3(line1, line2)


def validate_check_digits(line1: str, line2: str, line3: str | None = None) -> dict[str, Any]:
    l1 = len(line1) if line1 else 0
    l2 = len(line2) if line2 else 0

    if l1 >= 44 and l2 >= 44:
        return validate_check_digits_td3(line1, line2)
    if l1 >= 30 and l2 >= 30 and isinstance(line3, str) and len(line3) >= 30:
        return validate_check_digits_td1(line1, line2, line3)
    if l1 >= 36 and l2 >= 36:
        return validate_check_digits_td2(line1, line2)
    if l1 >= 30 and l2 >= 30:
        return validate_check_digits_td1(line1, line2, line3 if isinstance(line3, str) else "")  # type: ignore[arg-type]

    return {
        "passport_number_valid": False,
        "date_of_birth_valid": False,
        "expiry_date_valid": False,
        "optional_data_valid": False,
        "final_composite_valid": False,
        "overall_valid": False,
        "errors": ["UNKNOWN_FORMAT"],
    }


def validate_check_digits_td3(line1: str, line2: str) -> dict[str, Any]:
    results: dict[str, Any] = {
        "passport_number_valid": False,
        "date_of_birth_valid": False,
        "expiry_date_valid": False,
        "optional_data_valid": False,
        "final_composite_valid": False,
        "overall_valid": False,
        "errors": [],
    }
    if len(line2) < 44:
        results["errors"].append("LINE2_TOO_SHORT")
        return results

    passport_number = line2[0:9]
    passport_cd = line2[9:10]
    dob = line2[13:19]
    dob_cd = line2[19:20]
    expiry = line2[21:27]
    expiry_cd = line2[27:28]
    optional = line2[28:42]
    optional_cd = line2[42:43]
    composite_input = line2[0:10] + line2[13:20] + line2[21:43]
    composite_cd = line2[43:44]

    results["passport_number_valid"] = validate_check_digit(passport_number, passport_cd)
    if not results["passport_number_valid"]:
        results["errors"].append("PASSPORT_NUMBER_CHECK_FAILED")

    results["date_of_birth_valid"] = validate_check_digit(dob, dob_cd)
    if not results["date_of_birth_valid"]:
        results["errors"].append("DOB_CHECK_FAILED")

    results["expiry_date_valid"] = validate_check_digit(expiry, expiry_cd)
    if not results["expiry_date_valid"]:
        results["errors"].append("EXPIRY_CHECK_FAILED")

    results["optional_data_valid"] = validate_check_digit(optional, optional_cd)
    if not results["optional_data_valid"]:
        results["errors"].append("OPTIONAL_DATA_CHECK_FAILED")

    results["final_composite_valid"] = validate_check_digit(composite_input, composite_cd)
    if not results["final_composite_valid"]:
        results["errors"].append("FINAL_COMPOSITE_CHECK_FAILED")

    results["overall_valid"] = (
        results["passport_number_valid"]
        and results["date_of_birth_valid"]
        and results["expiry_date_valid"]
        and results["final_composite_valid"]
    )

    return results


def validate_check_digits_td1(line1: str, line2: str, line3: str) -> dict[str, Any]:
    results: dict[str, Any] = {
        "passport_number_valid": False,
        "date_of_birth_valid": False,
        "expiry_date_valid": False,
        "optional_data_valid": False,
        "final_composite_valid": False,
        "overall_valid": False,
        "errors": [],
    }
    if len(line2) < 30:
        results["errors"].append("LINE2_TOO_SHORT")
        return results

    passport_number = line2[0:9]
    passport_cd = line2[9:10]
    dob = line2[13:19]
    dob_cd = line2[19:20]
    expiry = line2[21:27]
    expiry_cd = line2[27:28]
    optional = (line2[28:30] + line3[0:30]).replace("<", "")
    optional_cd = None

    results["passport_number_valid"] = validate_check_digit(passport_number, passport_cd)
    if not results["passport_number_valid"]:
        results["errors"].append("PASSPORT_NUMBER_CHECK_FAILED")

    results["date_of_birth_valid"] = validate_check_digit(dob, dob_cd)
    if not results["date_of_birth_valid"]:
        results["errors"].append("DOB_CHECK_FAILED")

    results["expiry_date_valid"] = validate_check_digit(expiry, expiry_cd)
    if not results["expiry_date_valid"]:
        results["errors"].append("EXPIRY_CHECK_FAILED")

    results["optional_data_valid"] = optional_cd is None or validate_check_digit(optional, optional_cd)
    if optional_cd is not None and not results["optional_data_valid"]:
        results["errors"].append("OPTIONAL_DATA_CHECK_FAILED")

    composite_input = line2[0:10] + line2[13:20] + line2[21:28]
    if len(line2) >= 30:
        composite_candidate = line2[29:30]
        if composite_candidate and composite_candidate != "<":
            results["final_composite_valid"] = validate_check_digit(composite_input, composite_candidate)
        else:
            results["final_composite_valid"] = True
    if not results["final_composite_valid"]:
        results["errors"].append("FINAL_COMPOSITE_CHECK_FAILED")

    results["overall_valid"] = (
        results["passport_number_valid"]
        and results["date_of_birth_valid"]
        and results["expiry_date_valid"]
        and results["final_composite_valid"]
    )

    return results


def validate_check_digits_td2(line1: str, line2: str) -> dict[str, Any]:
    results: dict[str, Any] = {
        "passport_number_valid": False,
        "date_of_birth_valid": False,
        "expiry_date_valid": False,
        "optional_data_valid": False,
        "final_composite_valid": False,
        "overall_valid": False,
        "errors": [],
    }
    if len(line2) < 36:
        results["errors"].append("LINE2_TOO_SHORT")
        return results

    passport_number = line2[0:9]
    passport_cd = line2[9:10]
    dob = line2[13:19]
    dob_cd = line2[19:20]
    expiry = line2[21:27]
    expiry_cd = line2[27:28]
    optional = line2[28:35]
    optional_cd = line2[35:36]

    results["passport_number_valid"] = validate_check_digit(passport_number, passport_cd)
    if not results["passport_number_valid"]:
        results["errors"].append("PASSPORT_NUMBER_CHECK_FAILED")

    results["date_of_birth_valid"] = validate_check_digit(dob, dob_cd)
    if not results["date_of_birth_valid"]:
        results["errors"].append("DOB_CHECK_FAILED")

    results["expiry_date_valid"] = validate_check_digit(expiry, expiry_cd)
    if not results["expiry_date_valid"]:
        results["errors"].append("EXPIRY_CHECK_FAILED")

    results["optional_data_valid"] = validate_check_digit(optional, optional_cd)
    if not results["optional_data_valid"]:
        results["errors"].append("OPTIONAL_DATA_CHECK_FAILED")

    results["final_composite_valid"] = results["passport_number_valid"] or not any(
        e.startswith("PASSPORT") for e in results["errors"]
    )

    results["overall_valid"] = (
        results["passport_number_valid"]
        and results["date_of_birth_valid"]
        and results["expiry_date_valid"]
        and results["final_composite_valid"]
    )

    return results
