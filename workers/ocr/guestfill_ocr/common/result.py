"""Result type for safe error handling."""

from __future__ import annotations

from typing import Generic, TypeVar

T = TypeVar("T")


class Ok(Generic[T]):
    def __init__(self, value: T) -> None:
        self._value = value

    def is_ok(self) -> bool:
        return True

    def is_err(self) -> bool:
        return False

    def unwrap(self) -> T:
        return self._value

    def unwrap_err(self):
        raise RuntimeError("Called unwrap_err on Ok value")

    def unwrap_or(self, default: T) -> T:
        return self._value


class Err(Generic[T]):
    def __init__(self, error: T) -> None:
        self._error = error

    def is_ok(self) -> bool:
        return False

    def is_err(self) -> bool:
        return True

    def unwrap(self):
        raise RuntimeError(f"Called unwrap on Err value: {self._error}")

    def unwrap_err(self) -> T:
        return self._error

    def unwrap_or(self, default):
        return default


Result = Ok | Err
