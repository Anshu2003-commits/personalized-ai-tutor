import asyncio
import unittest
from types import SimpleNamespace

from app.agent.engine import TutorAgentEngine
from app.agent.history import InMemoryConversationHistory
from app.agent.providers.base import ProviderEvent
from app.agent.schemas import AgentContext, ChatMessage, ChatRequest, QuestionContext
from app.agent.tools.base import ToolContext, ToolResult, ToolSpec
from app.agent.tools.registry import ToolRegistry


class FakeProvider:
    def __init__(self, events):
        self.events = events
        self.calls = []

    async def stream_response(self, **kwargs):
        self.calls.append(kwargs)
        for event in self.events:
            yield event


class ModuleTool:
    spec = ToolSpec(
        name="module_name",
        description="Return the active module.",
        input_schema={"type": "object", "properties": {}},
    )

    async def run(self, args, context: ToolContext):
        return ToolResult.success(context.agent_context.module)


class FakeMemoryService:
    def __init__(self, block):
        self.block = block
        self.reads = []
        self.writes = []

    def build_memory_block(self, user_id):
        self.reads.append(user_id)
        return self.block

    async def reflect_and_consolidate(
        self,
        user_id,
        history_key,
        question_ctx,
        user_msg,
        assistant_text,
    ):
        self.writes.append(
            {
                "user_id": user_id,
                "history_key": history_key,
                "question_ctx": question_ctx,
                "user_msg": user_msg,
                "assistant_text": assistant_text,
            }
        )


class EngineTests(unittest.IsolatedAsyncioTestCase):
    async def test_streams_tokens_and_records_completed_turn(self):
        events = [
            ProviderEvent(kind="token", content="Use "),
            ProviderEvent(kind="token", content="a hash map."),
            ProviderEvent(kind="completed"),
        ]
        provider = FakeProvider(events)
        history = InMemoryConversationHistory()
        engine = TutorAgentEngine(
            provider_factory=lambda: provider,
            settings_provider=lambda: SimpleNamespace(model="test-model"),
            history_store=history,
        )
        request = ChatRequest(message="Give me a hint", sessionId="s1", module="dsa")
        context = AgentContext(
            module="dsa",
            session_id="s1",
            question=QuestionContext(question_id="q1", title="Two Sum"),
        )

        payloads = [p async for p in engine.stream_payloads(request, context)]

        self.assertEqual(payloads[0], {"type": "thinking", "content": "Reading the question..."})
        self.assertEqual(payloads[1], {"type": "token", "content": "Use "})
        self.assertEqual(payloads[2], {"type": "token", "content": "a hash map."})
        self.assertEqual(payloads[3]["type"], "done")
        self.assertEqual(
            history.load("dsa:s1"),
            [
                ChatMessage(role="user", content="Give me a hint"),
                ChatMessage(role="assistant", content="Use a hash map."),
            ],
        )

        call = provider.calls[0]
        self.assertEqual(call["model"], "test-model")
        self.assertIn("Two Sum", call["instructions"])
        self.assertEqual(
            call["input_items"],
            [{"role": "user", "content": "Give me a hint"}],
        )

    async def test_includes_current_editor_snapshot_in_user_turn(self):
        engine = TutorAgentEngine(
            provider_factory=lambda: FakeProvider([]),
            settings_provider=lambda: SimpleNamespace(model="test-model"),
            history_store=InMemoryConversationHistory(),
        )
        request = ChatRequest(
            message="What is wrong with my code?",
            sessionId="s1",
            module="dsa",
            current_code="def solve(nums):\n    return nums[0]\n",
            current_language="python",
            current_starter_code="def solve(nums):\n    pass\n",
        )

        items = engine.build_model_input(
            request,
            [],
            editor_snapshot_max_chars=500,
        )

        content = items[-1]["content"]
        self.assertIn("What is wrong with my code?", content)
        self.assertIn("Current editor snapshot:", content)
        self.assertIn("Language: python", content)
        self.assertIn("Starter code provided: yes", content)
        self.assertIn("System-provided starter code begins:", content)
        self.assertIn("def solve(nums):\n    pass", content)
        self.assertIn("Current editor code begins:", content)
        self.assertIn("def solve(nums):", content)
        self.assertIn("Do not assume every line was written by the student", content)

    async def test_omits_empty_editor_snapshot(self):
        engine = TutorAgentEngine(
            provider_factory=lambda: FakeProvider([]),
            settings_provider=lambda: SimpleNamespace(model="test-model"),
            history_store=InMemoryConversationHistory(),
        )
        request = ChatRequest(
            message="Give me a hint",
            sessionId="s1",
            module="dsa",
            current_code="   \n",
            current_language="python",
        )

        items = engine.build_model_input(
            request,
            [],
            editor_snapshot_max_chars=500,
        )

        self.assertEqual(items, [{"role": "user", "content": "Give me a hint"}])

    async def test_truncates_current_editor_snapshot(self):
        engine = TutorAgentEngine(
            provider_factory=lambda: FakeProvider([]),
            settings_provider=lambda: SimpleNamespace(model="test-model"),
            history_store=InMemoryConversationHistory(),
        )
        request = ChatRequest(
            message="Check this",
            sessionId="s1",
            module="dsa",
            current_code="abcdef",
            current_language="python",
        )

        items = engine.build_model_input(
            request,
            [],
            editor_snapshot_max_chars=3,
        )

        content = items[-1]["content"]
        self.assertIn("- Current code truncated: yes", content)
        self.assertIn("abc", content)
        self.assertNotIn("abcdef", content)
        self.assertIn("3 characters omitted", content)

    async def test_injects_memory_and_schedules_background_reflection(self):
        events = [
            ProviderEvent(kind="token", content="Use a set."),
            ProviderEvent(kind="completed"),
        ]
        provider = FakeProvider(events)
        history = InMemoryConversationHistory()
        memory = FakeMemoryService("Long-term student memory:\n- Likes examples.")
        engine = TutorAgentEngine(
            provider_factory=lambda: provider,
            settings_provider=lambda: SimpleNamespace(
                model="test-model",
                memory_enabled=True,
            ),
            history_store=history,
            memory_service=memory,
        )
        request = ChatRequest(
            message="Give me a hint",
            sessionId="s1",
            module="dsa",
            user_id="clerk:user_1",
        )
        context = AgentContext(
            module="dsa",
            session_id="s1",
            question=QuestionContext(question_id="q1", title="Contains Duplicate"),
        )

        _ = [p async for p in engine.stream_payloads(request, context)]
        await asyncio.sleep(0)

        self.assertEqual(memory.reads, ["clerk:user_1"])
        self.assertIn("Likes examples", provider.calls[0]["instructions"])
        self.assertEqual(len(memory.writes), 1)
        self.assertEqual(memory.writes[0]["user_id"], "clerk:user_1")
        self.assertEqual(memory.writes[0]["history_key"], "dsa:s1")
        self.assertEqual(memory.writes[0]["user_msg"], "Give me a hint")
        self.assertEqual(memory.writes[0]["assistant_text"], "Use a set.")

    async def test_uses_request_messages_without_recording_duplicate_history(self):
        events = [
            ProviderEvent(kind="token", content="Good question."),
            ProviderEvent(kind="completed"),
        ]
        provider = FakeProvider(events)
        history = InMemoryConversationHistory()
        history.append_turn("dsa:s1", "old", "old answer")
        engine = TutorAgentEngine(
            provider_factory=lambda: provider,
            settings_provider=lambda: SimpleNamespace(model="test-model"),
            history_store=history,
        )
        request = ChatRequest(
            message="What next?",
            sessionId="s1",
            module="dsa",
            messages=[ChatMessage(role="user", content="fresh context")],
        )
        context = engine.build_context(request)

        _ = [p async for p in engine.stream_payloads(request, context)]

        call = provider.calls[0]
        self.assertEqual(
            call["input_items"],
            [
                {"role": "user", "content": "fresh context"},
                {"role": "user", "content": "What next?"},
            ],
        )
        self.assertEqual(
            history.load("dsa:s1"),
            [
                ChatMessage(role="user", content="old"),
                ChatMessage(role="assistant", content="old answer"),
            ],
        )

    async def test_engine_delegates_tool_execution_to_registry(self):
        registry = ToolRegistry()
        registry.register(ModuleTool())
        engine = TutorAgentEngine(
            provider_factory=lambda: FakeProvider([]),
            settings_provider=lambda: SimpleNamespace(model="test-model"),
            history_store=InMemoryConversationHistory(),
            tool_registry=registry,
        )

        result = await engine.execute_tool(
            "module_name",
            {},
            ChatRequest(message="hello", sessionId="s1", module="ds"),
            AgentContext(module="ds", session_id="s1"),
        )

        self.assertEqual([spec.name for spec in engine.available_tool_specs()], ["module_name"])
        self.assertTrue(result.ok)
        self.assertEqual(result.output, "ds")


if __name__ == "__main__":
    unittest.main()
