from dataclasses import dataclass
from uuid import NAMESPACE_URL, uuid5

GENERATED_PREFIX = "ai-narrated:"


@dataclass(frozen=True, slots=True)
class SectionTiming:
    section_id: str
    start_ms: int
    end_ms: int


def stable_id(value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"douga:narrated:{value}"))
