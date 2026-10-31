import unittest
from types import SimpleNamespace

from app.agent.providers.base import ProviderEvent
from app.agent.providers.openai_provider import OpenAIProvider


class FakeOpenAIStream:
    def __init__(self, events):
        self._events = events

    def __aiter__(self):
        self._iter = iter(self._events)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


class FakeResponses:
    def __init__(self, events=None, completion_text=""):
        self._events = events or []
        self._completion_text = completion_text
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if kwargs.get("stream") is False:
            return SimpleNamespace(output_text=self._completion_text)
        return FakeOpenAIStream(self._events)


class FakeOpenAIClient:
    def __init__(self, events=None, completion_text=""):
        self.responses = FakeResponses(events, completion_text)


class OpenAIProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_maps_openai_stream_events_to_provider_events(self):
        client = FakeOpenAIClient(
            [
                SimpleNamespace(type="response.output_text.delta", delta="hello"),
                SimpleNamespace(type="response.completed"),
            ]
        )
        provider = OpenAIProvider(client_provider=lambda: client)

        events = [
            event
            async for event in provider.stream_response(
                model="test-model",
                instructions="teach",
                input_items=[{"role": "user", "content": "hi"}],
            )
        ]

        self.assertEqual(
            events,
            [
                ProviderEvent(kind="token", content="hello"),
                ProviderEvent(kind="completed"),
            ],
        )
        self.assertEqual(
            client.responses.calls[0],
            {
                "model": "test-model",
                "instructions": "teach",
                "input": [{"role": "user", "content": "hi"}],
                "stream": True,
            },
        )

    async def test_maps_openai_error_event(self):
        client = FakeOpenAIClient(
            [SimpleNamespace(type="error", message="provider failed")]
        )
        provider = OpenAIProvider(client_provider=lambda: client)

        events = [
            event
            async for event in provider.stream_response(
                model="test-model",
                instructions="teach",
                input_items=[{"role": "user", "content": "hi"}],
            )
        ]

        self.assertEqual(events, [ProviderEvent(kind="error", content="provider failed")])

    async def test_complete_returns_output_text(self):
        client = FakeOpenAIClient(completion_text='{"appends":[]}')
        provider = OpenAIProvider(client_provider=lambda: client)

        output = await provider.complete(
            model="test-model",
            instructions="reflect",
            input_items=[{"role": "user", "content": "hi"}],
        )

        self.assertEqual(output, '{"appends":[]}')
        self.assertEqual(
            client.responses.calls[0],
            {
                "model": "test-model",
                "instructions": "reflect",
                "input": [{"role": "user", "content": "hi"}],
                "stream": False,
            },
        )


if __name__ == "__main__":
    unittest.main()
