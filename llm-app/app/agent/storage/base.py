from __future__ import annotations

from typing import Protocol

from app.agent.schemas import ChatMessage


class ConversationHistoryStore(Protocol):
    def load(self, key: str) -> list[ChatMessage]:
        """Load recent messages for a tutor conversation key."""

    def replace(self, key: str, messages: list[ChatMessage]) -> None:
        """Replace the stored history for a conversation key."""

    def append_turn(self, key: str, user_content: str, assistant_content: str) -> None:
        """Append one completed user/assistant turn."""

    def clear(self, key: str) -> None:
        """Delete the stored history for a conversation key."""


def clean_and_trim_messages(
    messages: list[ChatMessage],
    max_messages: int,
) -> list[ChatMessage]:
    clean = [m for m in messages if m.content.strip()]
    return clean[-max_messages:]
