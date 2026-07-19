import asyncio
import sys
from pathlib import Path

import pytest
from douga.modules.exports.render_process import RenderProcessError, run_render_process


async def test_render_process_reports_progress_and_returns_stdout() -> None:
    progress_values: list[int] = []

    async def record_progress(progress: int) -> None:
        progress_values.append(progress)

    result = await run_render_process(
        [
            sys.executable,
            "-c",
            (
                "import sys; "
                "print('DOUGA_PROGRESS=10', file=sys.stderr); "
                "print('DOUGA_PROGRESS=55', file=sys.stderr); "
                "print('{\"duration_ms\": 1000}')"
            ),
        ],
        cwd=Path.cwd(),
        timeout_seconds=5,
        on_progress=record_progress,
    )

    assert progress_values == [10, 55]
    assert result.stdout.strip() == '{"duration_ms": 1000}'
    assert result.stderr == ""


async def test_render_process_does_not_require_asyncio_subprocess_support(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def unsupported_asyncio_subprocess(*args: object, **kwargs: object) -> None:
        raise NotImplementedError

    monkeypatch.setattr(asyncio, "create_subprocess_exec", unsupported_asyncio_subprocess)

    async def ignore_progress(_: int) -> None:
        return None

    result = await run_render_process(
        [sys.executable, "-c", "print('ok')"],
        cwd=Path.cwd(),
        timeout_seconds=5,
        on_progress=ignore_progress,
    )

    assert result.stdout.strip() == "ok"


async def test_render_process_failure_keeps_exit_code_and_available_output() -> None:
    async def ignore_progress(_: int) -> None:
        return None

    with pytest.raises(RenderProcessError) as caught:
        await run_render_process(
            [
                sys.executable,
                "-c",
                "import sys; print('renderer context'); sys.exit(7)",
            ],
            cwd=Path.cwd(),
            timeout_seconds=5,
            on_progress=ignore_progress,
        )

    assert "exited with code 7" in str(caught.value)
    assert "renderer context" in str(caught.value)
