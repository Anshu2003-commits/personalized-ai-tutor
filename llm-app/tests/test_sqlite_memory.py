import tempfile
import unittest
from pathlib import Path

from app.agent.memory.sqlite_memory import (
    DEFAULT_MEMORY_CONTENT,
    SQLiteStudentMemoryStore,
)


class SQLiteStudentMemoryStoreTests(unittest.TestCase):
    def test_read_missing_memory_returns_empty_string(self):
        store = SQLiteStudentMemoryStore(":memory:")

        self.assertEqual(store.read("clerk:user_1"), "")

    def test_read_skips_missing_or_untrusted_user_id(self):
        store = SQLiteStudentMemoryStore(":memory:")

        self.assertEqual(store.read(None), "")
        self.assertEqual(store.read(""), "")
        self.assertEqual(store.read("spike-user"), "")

    def test_rejects_empty_or_unnamespaced_user_id_on_write(self):
        store = SQLiteStudentMemoryStore(":memory:")

        with self.assertRaisesRegex(ValueError, "namespaced"):
            store.write("", DEFAULT_MEMORY_CONTENT)
        with self.assertRaisesRegex(ValueError, "namespaced"):
            store.append_bullet(
                "spike-user",
                "Progress",
                "Solved array traversal.",
                gate="test",
            )

    def test_appends_bullet_under_fixed_section(self):
        store = SQLiteStudentMemoryStore(":memory:")

        result = store.append_bullet(
            "clerk:user_1",
            "Misconceptions",
            "Confuses array index with value.",
            gate="wrong_answer",
        )

        self.assertEqual(result.user_id, "clerk:user_1")
        self.assertIn("## Misconceptions", result.content)
        self.assertIn("- Confuses array index with value.", result.content)
        self.assertIn("## Preferences", result.content)
        self.assertIn("## Progress", result.content)
        self.assertEqual(store.read("clerk:user_1"), result.content)

    def test_write_normalizes_to_fixed_sections(self):
        store = SQLiteStudentMemoryStore(":memory:")

        result = store.write(
            "clerk:user_1",
            """
            random unsectioned note

            ## Preferences
            likes short hints
            """,
        )

        self.assertEqual(
            result.content,
            "\n\n".join(
                [
                    "## Misconceptions",
                    "## Preferences\n- likes short hints",
                    "## Progress\n- random unsectioned note",
                ]
            ),
        )

    def test_persists_memory_across_store_instances(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "memory.sqlite3")
            first = SQLiteStudentMemoryStore(path)
            first.append_bullet(
                "clerk:user_1",
                "Progress",
                "Understood brute force tradeoffs.",
                gate="test",
            )

            second = SQLiteStudentMemoryStore(path)

            self.assertIn("Understood brute force tradeoffs", second.read("clerk:user_1"))

    def test_memory_users_are_isolated(self):
        store = SQLiteStudentMemoryStore(":memory:")

        store.append_bullet("clerk:user_1", "Progress", "Solved arrays.", gate="test")
        store.append_bullet("clerk:user_2", "Progress", "Solved maps.", gate="test")

        self.assertIn("Solved arrays.", store.read("clerk:user_1"))
        self.assertNotIn("Solved maps.", store.read("clerk:user_1"))
        self.assertIn("Solved maps.", store.read("clerk:user_2"))

    def test_compact_rewrites_and_caps_memory(self):
        store = SQLiteStudentMemoryStore(":memory:", max_bullets=3)
        store.write(
            "clerk:user_1",
            """
            ## Misconceptions
            - old 1
            - old 2
            - new 1
            - new 2
            """,
        )

        result = store.compact(
            "clerk:user_1",
            """
            ## Misconceptions
            - stale
            - useful misconception
            ## Preferences
            - likes examples
            ## Progress
            - solved two sum
            - solved valid parentheses
            """,
        )

        self.assertNotIn("- stale", result.content)
        self.assertIn("- useful misconception", result.content)
        self.assertIn("- likes examples", result.content)
        self.assertIn("- solved valid parentheses", result.content)

    def test_clear_deletes_memory(self):
        store = SQLiteStudentMemoryStore(":memory:")
        store.append_bullet("clerk:user_1", "Progress", "Solved arrays.", gate="test")

        store.clear("clerk:user_1")

        self.assertEqual(store.read("clerk:user_1"), "")

    def test_logs_reads_and_writes(self):
        store = SQLiteStudentMemoryStore(":memory:")

        with self.assertLogs("app.agent.memory.sqlite_memory", level="INFO") as logs:
            store.append_bullet(
                "clerk:user_1",
                "Progress",
                "Solved arrays.",
                gate="test_gate",
            )
            store.read("clerk:user_1")

        output = "\n".join(logs.output)
        self.assertIn("student_memory.write user_id=clerk:user_1 gate=test_gate", output)
        self.assertIn("length=", output)
        self.assertIn("student_memory.read user_id=clerk:user_1", output)
        self.assertNotIn("Solved arrays.", output)


if __name__ == "__main__":
    unittest.main()
