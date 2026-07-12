import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol

from openai import AsyncOpenAI

from douga.core.config import Settings, get_settings


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
        self.client = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value())
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
                store=False,
                tools=provider_tools,
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
            store=False,
            tools=provider_tools,
        )
        return self._result(response)

    @staticmethod
    def _result(response: Any) -> AssistantProviderResult:
        usage = response.usage
        output_items = tuple(item.model_dump(mode="json") for item in response.output)
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
        if any(item.get("type") == "function_call_output" for item in continuation):
            content = "構造化した案を保存しました。カードから内容を確認し、採用できます。"
            if on_delta is not None:
                await on_delta(content)
            return AssistantProviderResult(content=content, response_id="fake-response-final")
        requested = any(word in prompt for word in ("保存", "作って", "作成"))
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
