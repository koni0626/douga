from douga.modules.video_composition.pronunciation import apply_pronunciation_dictionary
from douga.modules.video_composition.schemas import PronunciationEntry


def test_uses_display_text_when_speech_text_is_omitted() -> None:
    assert apply_pronunciation_dictionary("辛い料理", [], locale="ja") == "辛い料理"


def test_applies_longest_matching_locale_entry_first() -> None:
    entries = [
        PronunciationEntry(surface="辛い", reading="カライ", locale="ja"),
        PronunciationEntry(surface="辛い料理", reading="カライリョウリ", locale="ja"),
        PronunciationEntry(surface="辛い料理", reading="spicy dish", locale="en"),
    ]

    assert (
        apply_pronunciation_dictionary("辛い料理です", entries, locale="ja")
        == "カライリョウリです"
    )


def test_english_entries_only_replace_complete_words() -> None:
    entries = [PronunciationEntry(surface="read", reading="reed", locale="en")]

    assert apply_pronunciation_dictionary("read readable", entries, locale="en") == (
        "reed readable"
    )
