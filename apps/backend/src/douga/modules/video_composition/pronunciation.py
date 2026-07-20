from __future__ import annotations

import re

from douga.modules.video_composition.schemas import PronunciationEntry


def apply_pronunciation_dictionary(
    text: str,
    entries: list[PronunciationEntry],
    *,
    locale: str,
) -> str:
    """Apply locale-aware replacements in longest-surface-first order."""
    resolved = text
    applicable = sorted(
        (entry for entry in entries if entry.locale in (None, locale)),
        key=lambda entry: len(entry.surface),
        reverse=True,
    )
    for entry in applicable:
        if _uses_word_boundaries(entry.surface):
            pattern = re.compile(rf"(?<!\w){re.escape(entry.surface)}(?!\w)", re.IGNORECASE)
            resolved = pattern.sub(entry.reading, resolved)
        else:
            resolved = resolved.replace(entry.surface, entry.reading)
    return resolved


def _uses_word_boundaries(surface: str) -> bool:
    return all(
        character.isascii() and (character.isalnum() or character == "_")
        for character in surface
    )
