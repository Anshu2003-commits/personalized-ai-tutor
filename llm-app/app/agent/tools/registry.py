from __future__ import annotations

import re
from collections import OrderedDict

from app.agent.tools.base import JsonObject, ToolContext, ToolResult, ToolSpec, TutorTool
from app.agent.tools.validation import (
    ToolValidationError,
    validate_tool_args,
    validate_tool_schema,
)


_TOOL_NAME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]{0,63}$")


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: OrderedDict[str, TutorTool] = OrderedDict()

    def register(self, tool: TutorTool) -> None:
        spec = tool.spec
        if not _TOOL_NAME_RE.match(spec.name):
            raise ValueError(f"invalid tool name: {spec.name}")
        if spec.name in self._tools:
            raise ValueError(f"duplicate tool name: {spec.name}")
        validate_tool_schema(spec.input_schema)
        self._tools[spec.name] = tool

    def get(self, name: str) -> TutorTool | None:
        return self._tools.get(name)

    def list_specs(self) -> list[ToolSpec]:
        return [tool.spec for tool in self._tools.values()]

    async def execute(
        self,
        name: str,
        args: JsonObject,
        context: ToolContext,
    ) -> ToolResult:
        tool = self.get(name)
        if tool is None:
            return ToolResult.failure(
                f"Unknown tool: {name}",
                error_code="tool_not_found",
            )

        try:
            validate_tool_args(tool.spec.input_schema, args)
        except ToolValidationError as exc:
            return ToolResult.failure(str(exc), error_code="tool_validation_error")

        try:
            return await tool.run(args, context)
        except Exception as exc:
            return ToolResult.failure(
                f"{tool.spec.name} failed: {exc}",
                error_code="tool_execution_error",
            )


def create_default_tool_registry() -> ToolRegistry:
    return ToolRegistry()
