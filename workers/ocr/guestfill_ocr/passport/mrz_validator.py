"""MRZ check digit calculation and validation.

Supports TD1 (3x30), TD2 (2x36), and TD3 (2x44) formats.
"""

from dataclasses import dataclass
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


# --- Data-driven format layout definitions ---


@dataclass(frozen=True)
class _FieldDef:
    name: str
    line_idx: int
    start: int
    length: int
    cd_line_idx: int
    cd_start: int


@dataclass(frozen=True)
class _FormatLayout:
    min_line2_length: int
    fields: tuple[_FieldDef, ...]
    composite_parts: tuple[tuple[int, int, int], ...]
    composite_cd_line_idx: int
    composite_cd_start: int
    td1_optional: bool = False
    composite_is_passport_only: bool = False


TD3_LAYOUT = _FormatLayout(
    min_line2_length=44,
    fields=(
        _FieldDef("passport_number", 1, 0, 9, 1, 9),
        _FieldDef("date_of_birth", 1, 13, 6, 1, 19),
        _FieldDef("expiry_date", 1, 21, 6, 1, 27),
        _FieldDef("optional_data", 1, 28, 14, 1, 42),
    ),
    composite_parts=((1, 0, 10), (1, 13, 7), (1, 21, 22)),
    composite_cd_line_idx=1,
    composite_cd_start=43,
)

TD2_LAYOUT = _FormatLayout(
    min_line2_length=36,
    fields=(
        _FieldDef("passport_number", 1, 0, 9, 1, 9),
        _FieldDef("date_of_birth", 1, 13, 6, 1, 19),
        _FieldDef("expiry_date", 1, 21, 6, 1, 27),
        _FieldDef("optional_data", 1, 28, 7, 1, 35),
    ),
    composite_parts=((1, 0, 10), (1, 13, 7), (1, 21, 7)),
    composite_cd_line_idx=1,
    composite_cd_start=43,
    composite_is_passport_only=True,
)

TD1_LAYOUT = _FormatLayout(
    min_line2_length=30,
    fields=(
        _FieldDef("passport_number", 1, 0, 9, 1, 9),
        _FieldDef("date_of_birth", 1, 13, 6, 1, 19),
        _FieldDef("expiry_date", 1, 21, 6, 1, 27),
        _FieldDef("optional_data", 1, 28, 2, 2, 29),
    ),
    composite_parts=((1, 0, 10), (1, 13, 7), (1, 21, 7)),
    composite_cd_line_idx=1,
    composite_cd_start=29,
    td1_optional=True,
)


def _build_result() -> dict[str, Any]:
    return {
        "passport_number_valid": False,
        "date_of_birth_valid": False,
        "expiry_date_valid": False,
        "optional_data_valid": False,
        "final_composite_valid": False,
        "overall_valid": False,
        "errors": [],
    }


def _check_field(field_def: _FieldDef, lines: dict[int, str], td1_optional: bool) -> tuple[bool, str]:
    value = lines[field_def.line_idx][field_def.start : field_def.start + field_def.length]
    cd = lines[field_def.cd_line_idx][field_def.cd_start : field_def.cd_start + 1]

    if td1_optional and field_def.name == "optional_data":
        value = (lines[1][28:30] + lines[2][0:30]).replace("<", "")

    is_valid = validate_check_digit(value, cd)
    if not is_valid:
        return False, f"{field_def.name.upper()}_CHECK_FAILED"
    return True, ""


def _check_composite(layout: _FormatLayout, lines: dict[int, str]) -> tuple[bool, str]:
    composite_input = ""
    for line_idx, start, length in layout.composite_parts:
        composite_input += lines[line_idx][start : start + length]

    cd = lines[layout.composite_cd_line_idx][layout.composite_cd_start : layout.composite_cd_start + 1]

    if not cd or cd == "<":
        return True, ""
    if validate_check_digit(composite_input, cd):
        return True, ""
    return False, "FINAL_COMPOSITE_CHECK_FAILED"


def _validate_format(lines: dict[int, str], layout: _FormatLayout) -> dict[str, Any]:
    result = _build_result()

    line2 = lines.get(1, "")
    if len(line2) < layout.min_line2_length:
        result["errors"].append("LINE2_TOO_SHORT")
        return result

    all_valid = True
    for field_def in layout.fields:
        is_valid, error = _check_field(field_def, lines, layout.td1_optional)
        key = f"{field_def.name}_valid"
        result[key] = is_valid
        if error:
            all_valid = False
            result["errors"].append(error)

    if layout.composite_is_passport_only:
        composite_valid = result["passport_number_valid"]
        result["final_composite_valid"] = composite_valid
    else:
        composite_valid, error = _check_composite(layout, lines)
        result["final_composite_valid"] = composite_valid
        if error:
            all_valid = False
            result["errors"].append(error)

    result["overall_valid"] = all_valid and composite_valid
    return result


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

    return _build_result() | {"errors": ["UNKNOWN_FORMAT"]}


def validate_check_digits_td3(line1: str, line2: str) -> dict[str, Any]:
    lines = {0: line1, 1: line2}
    return _validate_format(lines, TD3_LAYOUT)


def validate_check_digits_td1(line1: str, line2: str, line3: str) -> dict[str, Any]:
    lines = {0: line1, 1: line2, 2: line3}
    return _validate_format(lines, TD1_LAYOUT)


def validate_check_digits_td2(line1: str, line2: str) -> dict[str, Any]:
    lines = {0: line1, 1: line2}
    return _validate_format(lines, TD2_LAYOUT)
