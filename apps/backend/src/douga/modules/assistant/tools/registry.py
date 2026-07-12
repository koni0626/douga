from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from jsonschema import Draft202012Validator
from sqlalchemy.ext.asyncio import AsyncSession

from douga.core.errors import ApplicationError
from douga.integrations.openai_responses import AssistantProviderTool


@dataclass(frozen=True, slots=True)
class ToolContext:
    session: AsyncSession
    run_id: UUID
    project_id: UUID
    user_id: UUID
    emit_progress: Callable[[dict[str, Any]], Awaitable[None]] | None = None


@dataclass(frozen=True, slots=True)
class ToolExecutionResult:
    data: dict[str, Any]
    artifact: dict[str, Any] | None = None
    revision_number: int | None = None


ToolHandler = Callable[[ToolContext, dict[str, Any]], Awaitable[ToolExecutionResult]]
ApprovalPolicy = Callable[[dict[str, Any]], bool]


@dataclass(frozen=True, slots=True)
class ToolDefinition:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: ToolHandler
    approval_required: bool = False
    approval_policy: ApprovalPolicy | None = None

    def requires_approval(self, arguments: dict[str, Any]) -> bool:
        return self.approval_required or bool(
            self.approval_policy and self.approval_policy(arguments)
        )


class ToolRegistry:
    def __init__(self, definitions: tuple[ToolDefinition, ...]) -> None:
        self._definitions = {definition.name: definition for definition in definitions}

    def provider_tools(self) -> tuple[AssistantProviderTool, ...]:
        return tuple(
            AssistantProviderTool(
                name=item.name,
                description=item.description,
                parameters=item.parameters,
            )
            for item in self._definitions.values()
        )

    def definition(self, name: str) -> ToolDefinition:
        definition = self._definitions.get(name)
        if definition is None:
            raise ApplicationError("ASSISTANT_TOOL_NOT_FOUND", "errors.assistantToolNotFound", 422)
        return definition

    async def execute(
        self, name: str, context: ToolContext, arguments: dict[str, Any]
    ) -> ToolExecutionResult:
        definition = self.definition(name)
        errors = sorted(
            Draft202012Validator(definition.parameters).iter_errors(arguments),
            key=lambda error: list(error.path),
        )
        if errors:
            raise ApplicationError(
                "ASSISTANT_TOOL_ARGUMENTS_INVALID",
                "errors.assistantToolArgumentsInvalid",
                422,
            )
        return await definition.handler(context, arguments)
