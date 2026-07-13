import json
import logging
import sys

from douga.core.logging import JsonFormatter


def test_json_formatter_preserves_exception_and_redacts_secrets() -> None:
    try:
        raise RuntimeError(
            "provider rejected api_key=sk-project-secret123 and "
            "Authorization: Bearer eyJ-secret-value"
        )
    except RuntimeError:
        record = logging.LogRecord(
            name="douga.test",
            level=logging.ERROR,
            pathname=__file__,
            lineno=10,
            msg="assistant provider failed",
            args=(),
            exc_info=sys.exc_info(),
        )

    payload = json.loads(JsonFormatter().format(record))

    assert payload["exception"]["type"] == "RuntimeError"
    assert "[REDACTED]" in payload["exception"]["message"]
    assert "sk-project-secret123" not in payload["exception"]["traceback"]
    assert "eyJ-secret-value" not in payload["exception"]["traceback"]
