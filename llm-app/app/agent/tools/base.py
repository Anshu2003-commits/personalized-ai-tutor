from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from app.agent.schemas import AgentContext, ChatRequest


JsonObject = dict[str, Any]


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    input_schema: JsonObject = field(default_factory=lambda: {"type": "object"})
    read_only: bool = True


@dataclass(frozen=True)
class ToolContext:
    request: ChatRequest
    agent_context: AgentContext


@dataclass(frozen=True)
class ToolResult:
    ok: bool
    output: Any = None
    error: str | None = None
    error_code: str | None = None

    @classmethod
    def success(cls, output: Any) -> "ToolResult":
        return cls(ok=True, output=output)

    @classmethod
    def failure(cls, error: str, error_code: str = "tool_error") -> "ToolResult":
        return cls(ok=False, error=error, error_code=error_code)


class TutorTool(Protocol):
    spec: ToolSpec

    async def run(self, args: JsonObject, context: ToolContext) -> ToolResult:
        """Run the tool with validated JSON arguments."""
