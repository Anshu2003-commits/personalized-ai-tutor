from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from app.agent.code_execution.base import CodeRunRequest, CodeRunResult


_READ_CHUNK_SIZE = 4096
_TRUNCATION_NOTICE = "\n[output truncated]"


@dataclass(frozen=True)
class _CapturedChunk:
    sequence: int
    stream: str
    data: bytes


class LocalPythonRunner:
    """Runs Python code in a local subprocess.

    This is a development foundation, not a production sandbox. Production code
    execution should use container isolation around this same request/result
    contract.
    """

    def __init__(self, python_executable: str | None = None) -> None:
        self._python_executable = python_executable or sys.executable

    def run(self, request: CodeRunRequest) -> CodeRunResult:
        _validate_request(request)
        started_at = time.monotonic()

        with tempfile.TemporaryDirectory(prefix="onlearn-code-") as workdir:
            script_path = Path(workdir) / "main.py"
            script_path.write_text(request.code, encoding="utf-8")

            try:
                process = subprocess.Popen(
                    [
                        self._python_executable,
                        "-I",
                        "-B",
                        "-u",
                        "-X",
                        "utf8",
                        str(script_path),
                    ],
                    cwd=workdir,
                    env=_execution_env(workdir),
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
            except OSError as exc:
                duration_ms = _duration_ms(started_at)
                error = f"Failed to start Python runner: {exc}"
                return CodeRunResult(
                    stdout="",
                    stderr=error,
                    display_output=error,
                    exit_code=None,
                    timed_out=False,
                    duration_ms=duration_ms,
                    runner_error=error,
                )

            chunks = _capture_process_output(process)
            _write_stdin(process, request.stdin)

            timed_out = False
            try:
                exit_code = process.wait(timeout=request.timeout_seconds)
            except subprocess.TimeoutExpired:
                timed_out = True
                process.kill()
                exit_code = process.wait()

            for thread in chunks.threads:
                thread.join(timeout=1)

            if timed_out:
                _append_timeout_message(chunks, request.timeout_seconds)

        stdout = _decode_chunks(chunks.items, "stdout")
        stderr = _decode_chunks(chunks.items, "stderr")
        display_output = _decode_display_output(chunks.items)

        stdout, stdout_truncated = _truncate(stdout, request.max_output_chars)
        stderr, stderr_truncated = _truncate(stderr, request.max_output_chars)
        display_output, display_truncated = _truncate(
            display_output,
            request.max_output_chars,
        )

        return CodeRunResult(
            stdout=stdout,
            stderr=stderr,
            display_output=display_output,
            exit_code=exit_code,
            timed_out=timed_out,
            duration_ms=_duration_ms(started_at),
            output_truncated=stdout_truncated or stderr_truncated or display_truncated,
        )


class _CaptureState:
    def __init__(self) -> None:
        self.items: list[_CapturedChunk] = []
        self.threads: list[threading.Thread] = []
        self._lock = threading.Lock()
        self._sequence = 0

    def append(self, stream: str, data: bytes) -> None:
        with self._lock:
            self.items.append(
                _CapturedChunk(sequence=self._sequence, stream=stream, data=data)
            )
            self._sequence += 1


def _validate_request(request: CodeRunRequest) -> None:
    if request.timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be greater than 0")
    if request.max_output_chars <= 0:
        raise ValueError("max_output_chars must be greater than 0")


def _execution_env(workdir: str) -> dict[str, str]:
    path = os.environ.get("PATH", "")
    return {
        "PATH": path,
        "HOME": workdir,
    }


def _capture_process_output(process: subprocess.Popen[bytes]) -> _CaptureState:
    state = _CaptureState()

    for stream_name, pipe in (("stdout", process.stdout), ("stderr", process.stderr)):
        if pipe is None:
            continue
        thread = threading.Thread(
            target=_read_pipe,
            args=(stream_name, pipe, state),
            daemon=True,
        )
        thread.start()
        state.threads.append(thread)

    return state


def _read_pipe(stream_name: str, pipe, state: _CaptureState) -> None:
    try:
        while True:
            chunk = pipe.read(_READ_CHUNK_SIZE)
            if not chunk:
                return
            state.append(stream_name, chunk)
    finally:
        pipe.close()


def _write_stdin(process: subprocess.Popen[bytes], stdin: str) -> None:
    if process.stdin is None:
        return

    try:
        if stdin:
            process.stdin.write(stdin.encode("utf-8"))
            process.stdin.flush()
    except BrokenPipeError:
        pass
    finally:
        process.stdin.close()


def _append_timeout_message(state: _CaptureState, timeout_seconds: float) -> None:
    message = f"\nExecution timed out after {timeout_seconds:g} seconds.\n"
    state.append("stderr", message.encode("utf-8"))


def _decode_chunks(chunks: list[_CapturedChunk], stream: str) -> str:
    data = b"".join(chunk.data for chunk in chunks if chunk.stream == stream)
    return data.decode("utf-8", errors="replace")


def _decode_display_output(chunks: list[_CapturedChunk]) -> str:
    ordered = sorted(chunks, key=lambda chunk: chunk.sequence)
    data = b"".join(chunk.data for chunk in ordered)
    return data.decode("utf-8", errors="replace")


def _truncate(value: str, max_chars: int) -> tuple[str, bool]:
    if len(value) <= max_chars:
        return value, False

    if max_chars <= len(_TRUNCATION_NOTICE):
        return value[:max_chars], True

    return value[: max_chars - len(_TRUNCATION_NOTICE)] + _TRUNCATION_NOTICE, True


def _duration_ms(started_at: float) -> int:
    return int((time.monotonic() - started_at) * 1000)
