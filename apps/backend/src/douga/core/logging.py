import json
import logging
import re
from datetime import UTC, datetime
from typing import Any

_SENSITIVE_LOG_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_-]{8,}"),
    re.compile(r"(?i)(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+"),
    re.compile(r"(?i)((?:cookie|set-cookie|api[_-]?key)\s*[:=]\s*)[^\s,;]+"),
    re.compile(r"(?i)([?&](?:x-amz-signature|x-amz-credential|token|signature)=)[^&\s]+"),
)


def _redact_sensitive_log_value(value: str) -> str:
    redacted = _SENSITIVE_LOG_PATTERNS[0].sub("[REDACTED]", value)
    for pattern in _SENSITIVE_LOG_PATTERNS[1:]:
        redacted = pattern.sub(r"\1[REDACTED]", redacted)
    return redacted


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": _redact_sensitive_log_value(record.getMessage()),
        }
        for key in (
            "request_id",
            "run_id",
            "thread_id",
            "tool_call_id",
            "job_id",
            "provider",
            "model",
            "method",
            "path",
            "status_code",
            "duration_ms",
        ):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info is not None:
            exception_type = record.exc_info[0]
            payload["exception"] = {
                "type": exception_type.__name__ if exception_type is not None else "Exception",
                "message": _redact_sensitive_log_value(str(record.exc_info[1]))[:2_000],
                "traceback": _redact_sensitive_log_value(self.formatException(record.exc_info))[
                    :8_000
                ],
            }
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
