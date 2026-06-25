"""Time-related utility functions."""

import time
from datetime import datetime


def now_iso() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def timestamp_ms() -> int:
    return int(time.time() * 1000)


class Timer:
    def __init__(self):
        self._start: float | None = None

    def start(self) -> None:
        self._start = time.perf_counter()

    def stop(self) -> int:
        if self._start is None:
            return 0
        elapsed = int((time.perf_counter() - self._start) * 1000)
        self._start = None
        return elapsed
