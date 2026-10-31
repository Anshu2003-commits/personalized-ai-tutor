import unittest

from app.agent.history import InMemoryConversationHistory, history_key
from app.agent.schemas import ChatMessage


class ConversationHistoryTests(unittest.TestCase):
    def test_history_key_prefers_thread_id(self):
        self.assertEqual(history_key("dsa", "s1", "thread-1"), "thread-1")
        self.assertEqual(history_key("dsa", "s1", None), "dsa:s1")

    def test_appends_turns_and_trims_to_latest_messages(self):
        store = InMemoryConversationHistory(max_messages=4)

        store.append_turn("k", "u1", "a1")
        store.append_turn("k", "u2", "a2")
        store.append_turn("k", "u3", "a3")

        self.assertEqual(
            store.load("k"),
            [
                ChatMessage(role="user", content="u2"),
                ChatMessage(role="assistant", content="a2"),
                ChatMessage(role="user", content="u3"),
                ChatMessage(role="assistant", content="a3"),
            ],
        )

    def test_ignores_empty_turns(self):
        store = InMemoryConversationHistory()

        store.append_turn("k", "hello", "")

        self.assertEqual(store.load("k"), [])


if __name__ == "__main__":
    unittest.main()
