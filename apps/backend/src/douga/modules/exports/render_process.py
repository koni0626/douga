import asyncio
import subprocess
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import IO

PROGRESS_PREFIX = "DOUGA_PROGRESS="
MAX_DIAGNOSTIC_CHARACTERS = 4_000

ProgressCallback = Callable[[int], Awaitable[None]]


class RenderProcessError(RuntimeError):
    pass


@dataclass(frozen=True)
class RenderProcessResult:
    stdout: str
    stderr: str


async def run_render_process(
    command: Sequence[str],
    *,
    cwd: Path,
    timeout_seconds: int,
    on_progress: ProgressCallback,
) -> RenderProcessResult:
    process = await asyncio.to_thread(_start_process, command, cwd)
    if process.stdout is None or process.stderr is None:
        process.kill()
        await asyncio.to_thread(process.wait)
        raise RenderProcessError("Renderer output pipes were not created")

    stdout_task = asyncio.create_task(asyncio.to_thread(process.stdout.read))
    stderr_task = asyncio.create_task(_read_stderr(process.stderr, on_progress))
    wait_task = asyncio.create_task(asyncio.to_thread(process.wait))
    try:
        async with asyncio.timeout(timeout_seconds):
            stdout_bytes, stderr, return_code = await asyncio.gather(
                stdout_task,
                stderr_task,
                wait_task,
            )
    except TimeoutError:
        if process.poll() is None:
            process.kill()
            await asyncio.to_thread(process.wait)
        await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)
        raise RenderProcessError(f"Renderer timed out after {timeout_seconds} seconds") from None
    except Exception:
        if process.poll() is None:
            process.kill()
            await asyncio.to_thread(process.wait)
        await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)
        raise

    stdout = stdout_bytes.decode(errors="replace")
    if return_code != 0:
        detail = stderr.strip() or stdout.strip() or "No diagnostic output was produced"
        raise RenderProcessError(
            f"Renderer exited with code {return_code}: {detail[-MAX_DIAGNOSTIC_CHARACTERS:]}"
        )
    return RenderProcessResult(stdout=stdout, stderr=stderr)


def _start_process(
    command: Sequence[str],
    cwd: Path,
) -> subprocess.Popen[bytes]:
    return subprocess.Popen(  # noqa: S603 - command is a validated internal argument array
        list(command),
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


async def _read_stderr(
    stream: IO[bytes],
    on_progress: ProgressCallback,
) -> str:
    diagnostic = ""
    async for line in _iter_blocking_lines(stream):
        text = line.decode(errors="replace").rstrip()
        progress = _parse_progress(text)
        if progress is not None:
            await on_progress(progress)
            continue
        if text:
            diagnostic = (diagnostic + "\n" + text)[-MAX_DIAGNOSTIC_CHARACTERS:]
    return diagnostic.lstrip()


async def _iter_blocking_lines(stream: IO[bytes]) -> AsyncIterator[bytes]:
    while line := await asyncio.to_thread(stream.readline):
        yield line


def _parse_progress(line: str) -> int | None:
    if not line.startswith(PROGRESS_PREFIX):
        return None
    try:
        value = int(line.removeprefix(PROGRESS_PREFIX))
    except ValueError:
        return None
    return value if 0 <= value <= 100 else None
