from unittest.mock import MagicMock

import pytest
from douga.integrations.openai_responses import FakeAssistantProvider
from douga.modules.assistant.orchestrator import AssistantOrchestrator


@pytest.mark.parametrize(
    ("prompt", "included", "excluded"),
    [
        ("プロットを一緒に考えて", "save_plot", "delete_clip"),
        ("テロップを追加して", "add_caption_clip", "export_video"),
        ("画像を生成して配置して", "generate_image", "export_video"),
        ("カメラにゆっくり動きをつけて", "apply_camera_effect", "export_video"),
        ("5秒のプレビューを作って", "render_preview", "export_video"),
        ("MP4を書き出して", "export_video", "generate_image"),
        ("採用した絵コンテからドラフトを作って", "validate_timeline", "export_video"),
        ("会社紹介動画作って", "add_caption_clip", "export_video"),
        ("Build a draft from the script", "add_text_clip", "export_video"),
        ("Edit the visible image", "edit_visible_image", "export_video"),
        ("アップロードした画像を青空に編集して", "edit_image_asset", "export_video"),
        ("画面に表示中の画像を編集して", "edit_visible_image", "export_video"),
    ],
)
def test_tool_catalog_is_routed_to_the_current_intent(
    prompt: str, included: str, excluded: str
) -> None:
    orchestrator = AssistantOrchestrator(MagicMock(), FakeAssistantProvider())
    names = orchestrator._tool_names_for(prompt)
    assert included in names
    assert excluded not in names


def test_attached_image_exposes_edit_tool_without_prompt_keyword_matching() -> None:
    orchestrator = AssistantOrchestrator(MagicMock(), FakeAssistantProvider())

    names = orchestrator._available_tool_names(
        "左右を自然な構図に調整してください",
        ("00000000-0000-0000-0000-000000000001",),
    )

    assert "edit_image_asset" in names
    assert "generate_image" not in names
