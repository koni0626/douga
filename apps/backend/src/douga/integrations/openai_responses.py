import json
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol

from openai import AsyncOpenAI
from openai.types.responses import ResponseIncludable

from douga.core.config import Settings, get_settings

REASONING_CONTEXT_INCLUDE: list[ResponseIncludable] = ["reasoning.encrypted_content"]


@dataclass(frozen=True, slots=True)
class AssistantProviderMessage:
    role: str
    content: str


@dataclass(frozen=True, slots=True)
class AssistantProviderResult:
    content: str
    response_id: str | None = None
    usage: dict[str, int] | None = None
    tool_calls: tuple[AssistantProviderToolCall, ...] = ()
    output_items: tuple[dict[str, Any], ...] = ()


@dataclass(frozen=True, slots=True)
class AssistantProviderTool:
    name: str
    description: str
    parameters: dict[str, Any]


@dataclass(frozen=True, slots=True)
class AssistantProviderToolCall:
    call_id: str
    name: str
    arguments: dict[str, Any]


class AssistantProvider(Protocol):
    async def respond(
        self,
        messages: list[AssistantProviderMessage],
        *,
        instructions: str,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
        tools: tuple[AssistantProviderTool, ...] = (),
        continuation: tuple[dict[str, Any], ...] = (),
    ) -> AssistantProviderResult: ...


class OpenAIResponsesProvider:
    def __init__(self, settings: Settings) -> None:
        if settings.openai_api_key is None:
            raise RuntimeError("OPENAI_API_KEY is required for the OpenAI assistant provider")
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key.get_secret_value(),
            max_retries=settings.openai_max_retries,
            timeout=settings.openai_timeout_seconds,
        )
        self.model = settings.openai_assistant_model

    async def respond(
        self,
        messages: list[AssistantProviderMessage],
        *,
        instructions: str,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
        tools: tuple[AssistantProviderTool, ...] = (),
        continuation: tuple[dict[str, Any], ...] = (),
    ) -> AssistantProviderResult:
        input_items: Any = [
            {"role": item.role, "content": item.content} for item in messages
        ] + list(continuation)
        provider_tools: Any = [
            {
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
                "strict": True,
            }
            for tool in tools
        ]
        if on_delta is not None:
            async with self.client.responses.stream(
                model=self.model,
                instructions=instructions,
                input=input_items,
                include=REASONING_CONTEXT_INCLUDE,
                store=False,
                tools=provider_tools,
                parallel_tool_calls=False,
            ) as stream:
                async for event in stream:
                    if event.type == "response.output_text.delta":
                        await on_delta(event.delta)
                streamed_response = await stream.get_final_response()
            return self._result(streamed_response)

        response = await self.client.responses.create(
            model=self.model,
            instructions=instructions,
            input=input_items,
            include=REASONING_CONTEXT_INCLUDE,
            store=False,
            tools=provider_tools,
            parallel_tool_calls=False,
        )
        return self._result(response)

    @staticmethod
    def _result(response: Any) -> AssistantProviderResult:
        usage = response.usage
        output_items = tuple(
            OpenAIResponsesProvider._continuation_item(item) for item in response.output
        )
        tool_calls = tuple(
            AssistantProviderToolCall(
                call_id=item.call_id,
                name=item.name,
                arguments=json.loads(item.arguments),
            )
            for item in response.output
            if item.type == "function_call"
        )
        return AssistantProviderResult(
            content=response.output_text,
            response_id=response.id,
            usage={
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
                "total_tokens": usage.total_tokens,
            }
            if usage
            else None,
            tool_calls=tool_calls,
            output_items=output_items,
        )

    @staticmethod
    def _continuation_item(item: Any) -> dict[str, Any]:
        """Serialize an output item into a valid Responses API input item."""
        sdk_output_only_fields = set(getattr(item, "__api_exclude__", set()))
        payload: dict[str, Any] = item.model_dump(
            mode="json",
            exclude_none=True,
            exclude=sdk_output_only_fields,
        )
        # `status` describes an item returned by the API. The Responses API rejects
        # that output-only field when the item is supplied again as conversation input.
        for field in sdk_output_only_fields | {"status"}:
            payload.pop(field, None)
        return payload


class FakeAssistantProvider:
    async def respond(
        self,
        messages: list[AssistantProviderMessage],
        *,
        instructions: str,
        on_delta: Callable[[str], Awaitable[None]] | None = None,
        tools: tuple[AssistantProviderTool, ...] = (),
        continuation: tuple[dict[str, Any], ...] = (),
    ) -> AssistantProviderResult:
        del instructions, tools
        prompt = messages[-1].content if messages else ""
        arguments: dict[str, Any]
        function_outputs = [
            item for item in continuation if item.get("type") == "function_call_output"
        ]
        called_tools = {
            str(item.get("name")) for item in continuation if item.get("type") == "function_call"
        }
        place_generated = any(
            term in prompt.casefold() for term in ("配置", "タイムライン", "place")
        )
        if (
            function_outputs
            and place_generated
            and "generate_image" in called_tools
            and "add_asset_to_timeline" not in called_tools
        ):
            try:
                generated = json.loads(str(function_outputs[-1].get("output", "{}")))["generation"]
                asset_id = str(generated["asset_id"])
            except KeyError, TypeError, ValueError, json.JSONDecodeError:
                asset_id = ""
            if asset_id:
                arguments = {
                    "asset_id": asset_id,
                    "name": "AI generated image",
                    "x": 0,
                    "y": 0,
                    "width": 1920,
                    "height": 1080,
                    "rotation": 0,
                    "opacity": 1,
                    "start_ms": 0,
                    "end_ms": 5000,
                }
                output_item = {
                    "type": "function_call",
                    "call_id": "fake-place-generated-image",
                    "name": "add_asset_to_timeline",
                    "arguments": json.dumps(arguments, ensure_ascii=False),
                }
                return AssistantProviderResult(
                    content="",
                    response_id="fake-response-place-image",
                    tool_calls=(
                        AssistantProviderToolCall(
                            call_id="fake-place-generated-image",
                            name="add_asset_to_timeline",
                            arguments=arguments,
                        ),
                    ),
                    output_items=(output_item,),
                )
        if function_outputs:
            failed = any(
                '"error"' in str(item.get("output", ""))
                for item in continuation
                if item.get("type") == "function_call_output"
            )
            content = (
                "操作を完了できませんでした。最新の状態を確認して、もう一度指示してください。"
                if failed
                else "操作を完了しました。画面に反映された内容を確認できます。"
            )
            if on_delta is not None:
                await on_delta(content)
            return AssistantProviderResult(content=content, response_id="fake-response-final")
        if "映画紹介" in prompt and ("3案" in prompt or "three" in prompt.casefold()):
            content = (
                "1. ストーリー重視：主人公の変化を軸に紹介します。\n"
                "2. 世界観重視：印象的な舞台と映像美を軸に紹介します。\n"
                "3. テーマ重視：作品が投げかける問いを軸に紹介します。"
            )
            if on_delta is not None:
                await on_delta(content)
            return AssistantProviderResult(content=content, response_id="fake-response-movie")
        requested = any(
            word in prompt.casefold()
            for word in (
                "保存",
                "作って",
                "作成",
                "追加",
                "生成",
                "書き出",
                "add",
                "create",
                "save",
            )
        )
        if requested and (
            "書き出" in prompt or "export" in prompt.casefold() or "mp4" in prompt.casefold()
        ):
            arguments = {}
            output_item = {
                "type": "function_call",
                "call_id": "fake-export-video",
                "name": "export_video",
                "arguments": "{}",
            }
            return AssistantProviderResult(
                content="",
                response_id="fake-response-tool",
                tool_calls=(
                    AssistantProviderToolCall(
                        call_id="fake-export-video", name="export_video", arguments=arguments
                    ),
                ),
                output_items=(output_item,),
            )
        if requested and ("プレビュー" in prompt or "preview" in prompt.casefold()):
            arguments = {"start_ms": 0, "end_ms": 5_000}
            output_item = {
                "type": "function_call",
                "call_id": "fake-render-preview",
                "name": "render_preview",
                "arguments": json.dumps(arguments),
            }
            return AssistantProviderResult(
                content="",
                response_id="fake-response-tool",
                tool_calls=(
                    AssistantProviderToolCall(
                        call_id="fake-render-preview",
                        name="render_preview",
                        arguments=arguments,
                    ),
                ),
                output_items=(output_item,),
            )
        if requested and ("画像" in prompt or "image" in prompt.casefold()):
            high_quality = "高品質" in prompt or "high quality" in prompt.casefold()
            arguments = {
                "prompt": prompt[:4000],
                "quality": "high" if high_quality else "low",
                "size": "1536x1024",
            }
            output_item = {
                "type": "function_call",
                "call_id": "fake-generate-image",
                "name": "generate_image",
                "arguments": json.dumps(arguments, ensure_ascii=False),
            }
            return AssistantProviderResult(
                content="",
                response_id="fake-response-tool",
                tool_calls=(
                    AssistantProviderToolCall(
                        call_id="fake-generate-image",
                        name="generate_image",
                        arguments=arguments,
                    ),
                ),
                output_items=(output_item,),
            )
        if requested and ("テキスト" in prompt or "text" in prompt.casefold()):
            match = re.search(r"[「\"]([^」\"]+)[」\"]", prompt)
            text = match.group(1) if match else "AIで追加したテキスト"
            arguments = {
                "name": text[:200],
                "x": 120,
                "y": 120,
                "width": 960,
                "height": 180,
                "rotation": 0,
                "opacity": 1,
                "start_ms": 0,
                "end_ms": 5000,
                "text": text,
                "font_size": 64,
                "color": "#ffffff",
            }
            output_item = {
                "type": "function_call",
                "call_id": "fake-add-text",
                "name": "add_text_clip",
                "arguments": json.dumps(arguments, ensure_ascii=False),
            }
            return AssistantProviderResult(
                content="",
                response_id="fake-response-tool",
                tool_calls=(
                    AssistantProviderToolCall(
                        call_id="fake-add-text", name="add_text_clip", arguments=arguments
                    ),
                ),
                output_items=(output_item,),
            )
        if requested and "プロット" in prompt:
            arguments = {
                "content": {
                    "title": "伝わる動画のプロット",
                    "logline": "課題を示し、変化と結果を短時間で伝える構成",
                    "sections": [
                        {
                            "id": "opening",
                            "title": "問題提起",
                            "summary": "視聴者が抱える課題を提示する",
                            "purpose": "自分ごととして興味を持ってもらう",
                            "duration_ms": 6000,
                        },
                        {
                            "id": "solution",
                            "title": "解決と変化",
                            "summary": "解決策と得られる変化を見せる",
                            "purpose": "中心メッセージを理解してもらう",
                            "duration_ms": 12000,
                        },
                    ],
                }
            }
            output_item = {
                "type": "function_call",
                "call_id": "fake-save-plot",
                "name": "save_plot",
                "arguments": json.dumps(arguments, ensure_ascii=False),
            }
            return AssistantProviderResult(
                content="",
                response_id="fake-response-tool",
                tool_calls=(
                    AssistantProviderToolCall(
                        call_id="fake-save-plot", name="save_plot", arguments=arguments
                    ),
                ),
                output_items=(output_item,),
            )
        if "プロット" in prompt:
            content = (
                "もちろんです。まず、動画の目的、想定する視聴者、希望する長さ、"
                "雰囲気を教えてください。決まっていない項目は一緒に整理できます。"
            )
        else:
            content = (
                "ご相談内容を確認しました。現在は会話基盤の段階です。"
                "目的やイメージを詳しく教えていただければ、構成を一緒に整理します。"
            )
        if on_delta is not None:
            for offset in range(0, len(content), 40):
                await on_delta(content[offset : offset + 40])
        return AssistantProviderResult(content=content, response_id="fake-response")


def build_assistant_provider(settings: Settings | None = None) -> AssistantProvider:
    resolved = settings or get_settings()
    use_openai = resolved.assistant_provider == "openai" or (
        resolved.assistant_provider == "auto" and resolved.openai_api_key is not None
    )
    return OpenAIResponsesProvider(resolved) if use_openai else FakeAssistantProvider()
