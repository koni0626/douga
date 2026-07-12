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


class AssistantProvider(Protocol):
    async def respond(
        self,
        messages: list[AssistantProviderMessage],
        *,
        instructions: str,
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
    ) -> AssistantProviderResult:
        input_items: Any = [{"role": item.role, "content": item.content} for item in messages]
        response = await self.client.responses.create(
            model=self.model,
            instructions=instructions,
            input=input_items,
            store=False,
        )
        usage = response.usage
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
        )


class FakeAssistantProvider:
    async def respond(
        self,
        messages: list[AssistantProviderMessage],
        *,
        instructions: str,
    ) -> AssistantProviderResult:
        del instructions
        prompt = messages[-1].content if messages else ""
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
        return AssistantProviderResult(content=content, response_id="fake-response")


def build_assistant_provider(settings: Settings | None = None) -> AssistantProvider:
    resolved = settings or get_settings()
    use_openai = resolved.assistant_provider == "openai" or (
        resolved.assistant_provider == "auto" and resolved.openai_api_key is not None
    )
    return OpenAIResponsesProvider(resolved) if use_openai else FakeAssistantProvider()
