import tempfile
import unittest
from pathlib import Path

from app.agent.schemas import ChatMessage
from app.agent.storage.sqlite_history import SQLiteConversationHistory


class SQLiteConversationHistoryTests(unittest.TestCase):
    def test_persists_messages_across_store_instances(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = str(Path(tmp) / "history.sqlite3")
            first = SQLiteConversationHistory(path, max_messages=6)
            first.append_turn("dsa:s1", "What is brute force?", "Try all pairs.")

            second = SQLiteConversationHistory(path, max_messages=6)

            self.assertEqual(
                second.load("dsa:s1"),
                [
                    ChatMessage(role="user", content="What is brute force?"),
                    ChatMessage(role="assistant", content="Try all pairs."),
                ],
            )

    def test_trims_to_latest_messages(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = SQLiteConversationHistory(
                str(Path(tmp) / "history.sqlite3"),
                max_messages=4,
            )

            store.append_turn("dsa:s1", "u1", "a1")
            store.append_turn("dsa:s1", "u2", "a2")
            store.append_turn("dsa:s1", "u3", "a3")

            self.assertEqual(
                store.load("dsa:s1"),
                [
                    ChatMessage(role="user", content="u2"),
                    ChatMessage(role="assistant", content="a2"),
                    ChatMessage(role="user", content="u3"),
                    ChatMessage(role="assistant", content="a3"),
                ],
            )

    def test_sessions_are_isolated(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = SQLiteConversationHistory(str(Path(tmp) / "history.sqlite3"))

            store.append_turn("dsa:s1", "u1", "a1")
            store.append_turn("dsa:s2", "u2", "a2")

            self.assertEqual(
                store.load("dsa:s1"),
                [
                    ChatMessage(role="user", content="u1"),
                    ChatMessage(role="assistant", content="a1"),
                ],
            )
            self.assertEqual(
                store.load("dsa:s2"),
                [
                    ChatMessage(role="user", content="u2"),
                    ChatMessage(role="assistant", content="a2"),
                ],
            )

    def test_replace_and_clear(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = SQLiteConversationHistory(str(Path(tmp) / "history.sqlite3"))
            store.append_turn("dsa:s1", "old", "old answer")

            store.replace(
                "dsa:s1",
                [
                    ChatMessage(role="user", content="new"),
                    ChatMessage(role="assistant", content="new answer"),
                ],
            )

            self.assertEqual(
                store.load("dsa:s1"),
                [
                    ChatMessage(role="user", content="new"),
                    ChatMessage(role="assistant", content="new answer"),
                ],
            )

            store.clear("dsa:s1")

            self.assertEqual(store.load("dsa:s1"), [])

    def test_ignores_empty_turns(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = SQLiteConversationHistory(str(Path(tmp) / "history.sqlite3"))

            store.append_turn("dsa:s1", "hello", "")

            self.assertEqual(store.load("dsa:s1"), [])


if __name__ == "__main__":
    unittest.main()
