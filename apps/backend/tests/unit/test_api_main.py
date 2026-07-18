from pathlib import Path
from unittest.mock import Mock

from douga import api_main
from pytest import MonkeyPatch


def test_run_watches_only_backend_source_directory(monkeypatch: MonkeyPatch) -> None:
    runner = Mock()
    monkeypatch.setattr("douga.api_main.uvicorn.run", runner)

    api_main.run()

    runner.assert_called_once_with(
        "douga.api_main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=[str(Path(api_main.__file__).resolve().parent)],
    )
