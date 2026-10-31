from __future__ import annotations

from functools import lru_cache
from threading import Lock

from app.agent.config import get_settings
from app.agent.schemas import ChatMessage
from app.agent.storage.base import ConversationHistoryStore, clean_and_trim_messages
from app.agent.storage.sqlite_history import SQLiteConversationHistory


class InMemoryConversationHistory:
    """Small replaceable history store for the first Python tutor foundation.

    This is intentionally process-local. It gives the agent a clean interface for
    prior chat history now, while keeping the persistence decision separate.
    """

    def __init__(self, max_messages: int = 12) -> None:
        if max_messages < 2:
            raise ValueError("max_messages must be at least 2")
        self.max_messages = max_messages
        self._items: dict[str, list[ChatMessage]] = {}
        self._lock = Lock()

    def load(self, key: str) -> list[ChatMessage]:
        with self._lock:
            return list(self._items.get(key, []))

    def replace(self, key: str, messages: list[ChatMessage]) -> None:
        with self._lock:
            self._items[key] = self._trim(messages)

    def append_turn(self, key: str, user_content: str, assistant_content: str) -> None:
        if not user_content.strip() or not assistant_content.strip():
            return

        with self._lock:
            messages = list(self._items.get(key, []))
            messages.extend(
                [
                    ChatMessage(role="user", content=user_content),
                    ChatMessage(role="assistant", content=assistant_content),
                ]
            )
            self._items[key] = self._trim(messages)

    def clear(self, key: str) -> None:
        with self._lock:
            self._items.pop(key, None)

    def _trim(self, messages: list[ChatMessage]) -> list[ChatMessage]:
        return clean_and_trim_messages(messages, self.max_messages)


def history_key(module: str, session_id: str, thread_id: str | None = None) -> str:
    return thread_id or f"{module}:{session_id}"


@lru_cache(maxsize=1)
def get_conversation_history() -> ConversationHistoryStore:
    settings = get_settings()
    return SQLiteConversationHistory(
        settings.history_db_path,
        max_messages=settings.history_max_messages,
    )
