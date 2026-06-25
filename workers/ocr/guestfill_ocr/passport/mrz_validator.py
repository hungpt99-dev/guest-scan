"""MRZ check digit calculation and validation."""


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


def validate_full_mrz(line1: str, line2: str) -> dict:
    results = {
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


def validate_check_digits(line1: str, line2: str) -> dict:
    return validate_full_mrz(line1, line2)
