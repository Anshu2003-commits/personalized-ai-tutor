import unittest

from app.agent.memory.identity import (
    is_namespaced_user_id,
    memory_user_id_from_request,
    namespace_user_id,
)
from app.agent.schemas import ChatRequest


class MemoryIdentityTests(unittest.TestCase):
    def test_namespaces_provider_user_id(self):
        self.assertEqual(namespace_user_id("Clerk", "user_123"), "clerk:user_123")

    def test_skips_anonymous_user_ids(self):
        self.assertIsNone(namespace_user_id("clerk", None))
        self.assertIsNone(namespace_user_id("clerk", ""))
        self.assertIsNone(namespace_user_id("clerk", "anonymous"))

    def test_rejects_invalid_provider(self):
        with self.assertRaisesRegex(ValueError, "provider"):
            namespace_user_id("Clerk Auth", "user_123")

    def test_detects_namespaced_user_ids(self):
        self.assertTrue(is_namespaced_user_id("clerk:user_123"))
        self.assertFalse(is_namespaced_user_id("user_123"))
        self.assertFalse(is_namespaced_user_id(""))
        self.assertFalse(is_namespaced_user_id(None))
        self.assertFalse(is_namespaced_user_id("clerk:null"))
        self.assertFalse(is_namespaced_user_id("clerk:undefined"))
        self.assertFalse(is_namespaced_user_id("clerk:anonymous"))
        self.assertFalse(is_namespaced_user_id("clerk:"))

    def test_extracts_memory_user_id_from_request_only_when_namespaced(self):
        self.assertEqual(
            memory_user_id_from_request(
                ChatRequest(message="hint", sessionId="s1", user_id="clerk:user_123")
            ),
            "clerk:user_123",
        )
        self.assertIsNone(
            memory_user_id_from_request(
                ChatRequest(message="hint", sessionId="s1", user_id="spike-user")
            )
        )
        self.assertIsNone(
            memory_user_id_from_request(
                ChatRequest(message="hint", sessionId="s1", user_id="clerk:null")
            )
        )
        self.assertIsNone(
            memory_user_id_from_request(
                ChatRequest(message="hint", sessionId="s1", user_id="clerk:undefined")
            )
        )
        self.assertIsNone(
            memory_user_id_from_request(
                ChatRequest(message="hint", sessionId="s1", user_id="clerk:")
            )
        )


if __name__ == "__main__":
    unittest.main()
