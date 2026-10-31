import json
import unittest
from types import SimpleNamespace

from app.agent.memory.service import StudentMemoryService
from app.agent.memory.sqlite_memory import SQLiteStudentMemoryStore
from app.agent.schemas import QuestionContext


class FakeProvider:
    def __init__(self, *outputs: str) -> None:
        self.outputs = list(outputs)
        self.calls = []

    async def complete(self, **kwargs) -> str:
        self.calls.append(kwargs)
        if not self.outputs:
            return '{"appends":[]}'
        return self.outputs.pop(0)


def memory_settings(**overrides):
    defaults = {
        "memory_enabled": True,
        "memory_model": "memory-model",
        "memory_reflect_every_turns": 3,
        "memory_max_appends_per_reflection": 3,
        "memory_consolidate_at_bullets": 24,
        "memory_max_bullets": 30,
        "memory_max_chars": 2_000,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def make_service(provider, store, settings):
    return StudentMemoryService(
        store=store,
        provider_factory=lambda: provider,
        settings_provider=lambda: settings,
    )


class StudentMemoryServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_build_memory_block_handles_empty_populated_and_disabled(self):
        store = SQLiteStudentMemoryStore(":memory:")
        provider = FakeProvider()
        settings = memory_settings()
        service = make_service(provider, store, settings)

        self.assertEqual(service.build_memory_block("clerk:user_1"), "")

        store.append_bullet(
            "clerk:user_1",
            "Misconceptions",
            "Confuses array index with value.",
            gate="test",
        )

        block = service.build_memory_block("clerk:user_1")
        self.assertIn("Long-term student memory", block)
        self.assertIn("untrusted student-authored context", block)
        self.assertIn("point-in-time", block)
        self.assertIn("- Confuses array index with value.", block)

        settings.memory_enabled = False
        self.assertEqual(service.build_memory_block("clerk:user_1"), "")

    async def test_reflect_parses_valid_json_and_appends_memory(self):
        provider = FakeProvider(
            json.dumps(
                {
                    "appends": [
                        {
                            "section": "Misconceptions",
                            "bullet": "Confuses array index with value.",
                        }
                    ]
                }
            )
        )
        store = SQLiteStudentMemoryStore(":memory:")
        settings = memory_settings()
        service = make_service(provider, store, settings)

        appended = await service.reflect(
            "clerk:user_1",
            QuestionContext(title="Two Sum", concepts=["hash maps"]),
            "I think the index is the value.",
            "Track values and indices separately.",
        )

        self.assertEqual(appended, 1)
        self.assertIn("Confuses array index with value", store.read("clerk:user_1"))
        self.assertEqual(provider.calls[0]["model"], "memory-model")
        self.assertIn("strict JSON", provider.calls[0]["instructions"])
        self.assertIn("Two Sum", provider.calls[0]["input_items"][0]["content"])

    async def test_reflect_drops_malformed_json(self):
        provider = FakeProvider("not json")
        store = SQLiteStudentMemoryStore(":memory:")
        settings = memory_settings()
        service = make_service(provider, store, settings)

        appended = await service.reflect(
            "clerk:user_1",
            None,
            "hello",
            "hi",
        )

        self.assertEqual(appended, 0)
        self.assertEqual(store.read("clerk:user_1"), "")

    async def test_reflect_parses_json_wrapped_in_code_fence(self):
        provider = FakeProvider(
            """```json
{"appends":[{"section":"Preferences","bullet":"Likes concrete examples."}]}
```"""
        )
        store = SQLiteStudentMemoryStore(":memory:")
        settings = memory_settings()
        service = make_service(provider, store, settings)

        appended = await service.reflect(
            "clerk:user_1",
            None,
            "show example",
            "example response",
        )

        self.assertEqual(appended, 1)
        self.assertIn("Likes concrete examples.", store.read("clerk:user_1"))

    async def test_reflect_parses_json_with_surrounding_prose(self):
        provider = FakeProvider(
            'Here is the update:\n{"appends":[{"section":"Progress","bullet":"Understood arrays."}]}'
        )
        store = SQLiteStudentMemoryStore(":memory:")
        settings = memory_settings()
        service = make_service(provider, store, settings)

        appended = await service.reflect(
            "clerk:user_1",
            None,
            "I get arrays now",
            "nice",
        )

        self.assertEqual(appended, 1)
        self.assertIn("Understood arrays.", store.read("clerk:user_1"))

    async def test_reflect_enforces_section_whitelist_append_cap_and_bullet_cap(self):
        long_bullet = "x" * 300
        provider = FakeProvider(
            json.dumps(
                {
                    "appends": [
                        {"section": "Progress", "bullet": long_bullet},
                        {"section": "Unknown", "bullet": "Should be ignored."},
                        {"section": "Preferences", "bullet": "Likes diagrams."},
                        {"section": "Misconceptions", "bullet": "Capped out."},
                    ]
                }
            )
        )
        store = SQLiteStudentMemoryStore(":memory:")
        settings = memory_settings(memory_max_appends_per_reflection=2)
        service = make_service(provider, store, settings)

        appended = await service.reflect(
            "clerk:user_1",
            None,
            "show me visually",
            "diagram explanation",
        )

        content = store.read("clerk:user_1")
        self.assertEqual(appended, 2)
        self.assertIn("- " + ("x" * 240), content)
        self.assertNotIn("x" * 241, content)
        self.assertIn("- Likes diagrams.", content)
        self.assertNotIn("Should be ignored.", content)
        self.assertNotIn("Capped out.", content)

    async def test_reflect_and_consolidate_throttles_reflection_per_history_key(self):
        provider = FakeProvider(
            json.dumps(
                {
                    "appends": [
                        {"section": "Progress", "bullet": "Solved array traversal."}
                    ]
                }
            )
        )
        store = SQLiteStudentMemoryStore(":memory:")
        settings = memory_settings(
            memory_reflect_every_turns=2,
            memory_consolidate_at_bullets=99,
        )
        service = make_service(provider, store, settings)

        await service.reflect_and_consolidate(
            "clerk:user_1",
            "dsa:s1",
            None,
            "first turn",
            "first answer",
        )
        self.assertEqual(provider.calls, [])
        self.assertEqual(store.read("clerk:user_1"), "")

        await service.reflect_and_consolidate(
            "clerk:user_1",
            "dsa:s1",
            None,
            "second turn",
            "second answer",
        )
        self.assertEqual(len(provider.calls), 1)
        self.assertIn("Solved array traversal", store.read("clerk:user_1"))

        await service.reflect_and_consolidate(
            "clerk:user_1",
            "dsa:s1",
            None,
            "third turn",
            "third answer",
        )
        self.assertEqual(len(provider.calls), 1)

    async def test_maybe_consolidate_only_triggers_at_bullet_threshold(self):
        provider = FakeProvider(
            "\n\n".join(
                [
                    "## Misconceptions\n- Merged misconception.",
                    "## Preferences",
                    "## Progress\n- Consolidated progress.",
                ]
            )
        )
        store = SQLiteStudentMemoryStore(":memory:")
        settings = memory_settings(memory_consolidate_at_bullets=3)
        service = make_service(provider, store, settings)

        store.append_bullet("clerk:user_1", "Progress", "Old 1.", gate="test")
        store.append_bullet("clerk:user_1", "Progress", "Old 2.", gate="test")
        self.assertFalse(await service.maybe_consolidate("clerk:user_1"))
        self.assertEqual(provider.calls, [])

        store.append_bullet("clerk:user_1", "Misconceptions", "Old 3.", gate="test")
        self.assertTrue(await service.maybe_consolidate("clerk:user_1"))

        content = store.read("clerk:user_1")
        self.assertIn("- Merged misconception.", content)
        self.assertIn("- Consolidated progress.", content)
        self.assertNotIn("Old 1.", content)
        self.assertEqual(len(provider.calls), 1)
        self.assertIn("Target: aim for under 2 bullets", provider.calls[0]["instructions"])

        self.assertFalse(await service.maybe_consolidate("clerk:user_1"))
        self.assertEqual(len(provider.calls), 1)

    async def test_maybe_consolidate_skips_until_bullet_count_changes(self):
        provider = FakeProvider(
            "\n\n".join(
                [
                    "## Misconceptions\n- Merged 1.\n- Merged 2.",
                    "## Preferences",
                    "## Progress\n- Merged 3.",
                ]
            ),
            "\n\n".join(
                [
                    "## Misconceptions\n- Merged 1.",
                    "## Preferences\n- Merged preference.",
                    "## Progress\n- Merged 3.\n- Merged 4.",
                ]
            ),
        )
        store = SQLiteStudentMemoryStore(":memory:")
        settings = memory_settings(memory_consolidate_at_bullets=3)
        service = make_service(provider, store, settings)

        store.append_bullet("clerk:user_1", "Progress", "Old 1.", gate="test")
        store.append_bullet("clerk:user_1", "Progress", "Old 2.", gate="test")
        store.append_bullet("clerk:user_1", "Progress", "Old 3.", gate="test")

        self.assertTrue(await service.maybe_consolidate("clerk:user_1"))
        self.assertEqual(len(provider.calls), 1)

        self.assertFalse(await service.maybe_consolidate("clerk:user_1"))
        self.assertEqual(len(provider.calls), 1)

        store.append_bullet("clerk:user_1", "Progress", "Old 4.", gate="test")

        self.assertTrue(await service.maybe_consolidate("clerk:user_1"))
        self.assertEqual(len(provider.calls), 2)


if __name__ == "__main__":
    unittest.main()
