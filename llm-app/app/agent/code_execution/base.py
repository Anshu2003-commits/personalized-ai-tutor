from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class CodeRunRequest:
    code: str
    stdin: str = ""
    timeout_seconds: float = 3.0
    max_output_chars: int = 20_000


@dataclass(frozen=True)
class CodeRunResult:
    stdout: str
    stderr: str
    display_output: str
    exit_code: int | None
    timed_out: bool
    duration_ms: int
    output_truncated: bool = False
    runner_error: str | None = None


class CodeRunner(Protocol):
    def run(self, request: CodeRunRequest) -> CodeRunResult:
        """Execute code and return the same display output the student sees."""
