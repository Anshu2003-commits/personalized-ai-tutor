import unittest

from app.agent.schemas import AgentContext, ChatRequest
from app.agent.tools.base import ToolContext, ToolResult, ToolSpec
from app.agent.tools.registry import ToolRegistry


class EchoTool:
    spec = ToolSpec(
        name="echo",
        description="Echo a short text value.",
        input_schema={
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "times": {"type": "integer"},
            },
            "required": ["text"],
            "additionalProperties": False,
        },
    )

    async def run(self, args, context: ToolContext):
        times = args.get("times", 1)
        return ToolResult.success(
            {
                "text": args["text"] * times,
                "module": context.agent_context.module,
            }
        )


class FailingTool:
    spec = ToolSpec(
        name="fail_tool",
        description="Fails for tests.",
        input_schema={"type": "object", "properties": {}},
    )

    async def run(self, args, context: ToolContext):
        raise RuntimeError("boom")


class ToolRegistryTests(unittest.IsolatedAsyncioTestCase):
    def test_registers_and_lists_specs(self):
        registry = ToolRegistry()

        registry.register(EchoTool())

        self.assertEqual([spec.name for spec in registry.list_specs()], ["echo"])

    def test_rejects_duplicate_tool_names(self):
        registry = ToolRegistry()
        registry.register(EchoTool())

        with self.assertRaisesRegex(ValueError, "duplicate tool name"):
            registry.register(EchoTool())

    def test_rejects_invalid_tool_names(self):
        class BadTool(EchoTool):
            spec = ToolSpec(name="bad-name", description="bad")

        registry = ToolRegistry()

        with self.assertRaisesRegex(ValueError, "invalid tool name"):
            registry.register(BadTool())

    def test_rejects_invalid_tool_schema(self):
        class BadTool(EchoTool):
            spec = ToolSpec(
                name="bad_tool",
                description="bad",
                input_schema={
                    "type": "object",
                    "properties": {},
                    "required": ["missing"],
                },
            )

        registry = ToolRegistry()

        with self.assertRaisesRegex(ValueError, "required argument has no schema"):
            registry.register(BadTool())

    async def test_executes_registered_tool_with_context(self):
        registry = ToolRegistry()
        registry.register(EchoTool())

        result = await registry.execute(
            "echo",
            {"text": "ha", "times": 2},
            ToolContext(
                request=ChatRequest(message="hello", sessionId="s1"),
                agent_context=AgentContext(module="dsa", session_id="s1"),
            ),
        )

        self.assertTrue(result.ok)
        self.assertEqual(result.output, {"text": "haha", "module": "dsa"})

    async def test_returns_structured_error_for_unknown_tool(self):
        result = await ToolRegistry().execute(
            "missing",
            {},
            ToolContext(
                request=ChatRequest(message="hello", sessionId="s1"),
                agent_context=AgentContext(module="dsa", session_id="s1"),
            ),
        )

        self.assertFalse(result.ok)
        self.assertEqual(result.error_code, "tool_not_found")

    async def test_returns_structured_error_for_bad_args(self):
        registry = ToolRegistry()
        registry.register(EchoTool())

        result = await registry.execute(
            "echo",
            {"text": "ha", "extra": True},
            ToolContext(
                request=ChatRequest(message="hello", sessionId="s1"),
                agent_context=AgentContext(module="dsa", session_id="s1"),
            ),
        )

        self.assertFalse(result.ok)
        self.assertEqual(result.error_code, "tool_validation_error")
        self.assertEqual(result.error, "unexpected argument: extra")

    async def test_returns_structured_error_when_tool_raises(self):
        registry = ToolRegistry()
        registry.register(FailingTool())

        result = await registry.execute(
            "fail_tool",
            {},
            ToolContext(
                request=ChatRequest(message="hello", sessionId="s1"),
                agent_context=AgentContext(module="dsa", session_id="s1"),
            ),
        )

        self.assertFalse(result.ok)
        self.assertEqual(result.error_code, "tool_execution_error")


if __name__ == "__main__":
    unittest.main()
