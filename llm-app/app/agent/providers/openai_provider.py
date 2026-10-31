from __future__ import annotations

from collections.abc import AsyncGenerator, Callable
from functools import lru_cache
from typing import Any

from app.agent.openai_client import get_openai_client
from app.agent.providers.base import LLMProvider, ProviderEvent, ProviderInput


class OpenAIProvider:
    """OpenAI Responses API adapter.

    The rest of the tutor engine should not know OpenAI stream event names.
    This adapter maps them to the provider-neutral event contract.
    """

    def __init__(self, client_provider: Callable[[], Any] = get_openai_client) -> None:
        self._client_provider = client_provider

    async def stream_response(
        self,
        *,
        model: str,
        instructions: str,
        input_items: ProviderInput,
    ) -> AsyncGenerator[ProviderEvent, None]:
        client = self._client_provider()
        stream = await client.responses.create(
            model=model,
            instructions=instructions,
            input=input_items,
            stream=True,
        )

        async for event in stream:
            event_type = getattr(event, "type", "")

            if event_type == "response.output_text.delta":
                delta = getattr(event, "delta", "")
                if delta:
                    yield ProviderEvent(kind="token", content=delta)
            elif event_type == "response.completed":
                yield ProviderEvent(kind="completed")
                return
            elif event_type == "error":
                message = getattr(event, "message", "OpenAI stream error.")
                yield ProviderEvent(kind="error", content=message)
                return

    async def complete(
        self,
        *,
        model: str,
        instructions: str,
        input_items: ProviderInput,
    ) -> str:
        client = self._client_provider()
        response = await client.responses.create(
            model=model,
            instructions=instructions,
            input=input_items,
            stream=False,
        )
        return getattr(response, "output_text", "") or ""


@lru_cache(maxsize=1)
def get_llm_provider() -> LLMProvider:
    return OpenAIProvider()
