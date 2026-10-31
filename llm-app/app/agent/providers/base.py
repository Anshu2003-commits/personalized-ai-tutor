from __future__ import annotations

from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Literal, Protocol


ProviderEventKind = Literal["token", "completed", "error"]
ProviderInput = list[dict[str, str]]


@dataclass(frozen=True)
class ProviderEvent:
    kind: ProviderEventKind
    content: str = ""


class LLMProvider(Protocol):
    def stream_response(
        self,
        *,
        model: str,
        instructions: str,
        input_items: ProviderInput,
    ) -> AsyncGenerator[ProviderEvent, None]:
        """Stream a model response as provider-neutral events."""

    async def complete(
        self,
        *,
        model: str,
        instructions: str,
        input_items: ProviderInput,
    ) -> str:
        """Return a single non-streamed provider-neutral text response."""
