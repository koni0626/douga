import subprocess
from pathlib import Path
from unittest.mock import Mock

from douga.modules.assets.service import (
    MEDIA_PROBE_TIMEOUT_SECONDS,
    _run_ffprobe,
)
from pytest import MonkeyPatch


def test_ffprobe_uses_a_validated_argument_array(monkeypatch: MonkeyPatch) -> None:
    completed = subprocess.CompletedProcess[bytes]([], 0, b"{}", b"")
    runner = Mock(return_value=completed)
    monkeypatch.setattr("douga.modules.assets.service.subprocess.run", runner)

    result = _run_ffprobe("ffprobe", Path("audio.mp3"))

    assert result is completed
    runner.assert_called_once_with(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            "audio.mp3",
        ],
        capture_output=True,
        check=False,
        timeout=MEDIA_PROBE_TIMEOUT_SECONDS,
    )
