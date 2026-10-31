import json
import unittest

from app.agent.events import sse_event


class SseEventTests(unittest.TestCase):
    def test_serializes_compact_sse_event(self):
        event = sse_event({"type": "token", "content": "hello"})

        self.assertEqual(event, 'data: {"type":"token","content":"hello"}\n\n')
        payload = event.removeprefix("data: ").strip()
        self.assertEqual(json.loads(payload), {"type": "token", "content": "hello"})


if __name__ == "__main__":
    unittest.main()
