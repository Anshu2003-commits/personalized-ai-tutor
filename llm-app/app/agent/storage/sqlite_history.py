from __future__ import annotations

import sqlite3
from pathlib import Path
from threading import Lock

from app.agent.schemas import ChatMessage
from app.agent.storage.base import clean_and_trim_messages


class SQLiteConversationHistory:
    """SQLite-backed short-term tutor chat history."""

    def __init__(self, db_path: str, max_messages: int = 12) -> None:
        if max_messages < 2:
            raise ValueError("max_messages must be at least 2")
        self.db_path = db_path
        self.max_messages = max_messages
        self._lock = Lock()
        self._ready = False

    def load(self, key: str) -> list[ChatMessage]:
        with self._lock, self._connect() as conn:
            self._ensure_schema(conn)
            rows = conn.execute(
                """
                SELECT role, content
                FROM chat_messages
                WHERE history_key = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (key, self.max_messages),
            ).fetchall()

        return [
            ChatMessage(role=role, content=content)
            for role, content in reversed(rows)
        ]

    def replace(self, key: str, messages: list[ChatMessage]) -> None:
        trimmed = clean_and_trim_messages(messages, self.max_messages)
        with self._lock, self._connect() as conn:
            self._ensure_schema(conn)
            with conn:
                conn.execute("DELETE FROM chat_messages WHERE history_key = ?", (key,))
                conn.executemany(
                    """
                    INSERT INTO chat_messages (history_key, role, content)
                    VALUES (?, ?, ?)
                    """,
                    [(key, message.role, message.content) for message in trimmed],
                )

    def append_turn(self, key: str, user_content: str, assistant_content: str) -> None:
        if not user_content.strip() or not assistant_content.strip():
            return

        with self._lock, self._connect() as conn:
            self._ensure_schema(conn)
            with conn:
                conn.executemany(
                    """
                    INSERT INTO chat_messages (history_key, role, content)
                    VALUES (?, ?, ?)
                    """,
                    [
                        (key, "user", user_content),
                        (key, "assistant", assistant_content),
                    ],
                )
                self._trim(conn, key)

    def clear(self, key: str) -> None:
        with self._lock, self._connect() as conn:
            self._ensure_schema(conn)
            with conn:
                conn.execute("DELETE FROM chat_messages WHERE history_key = ?", (key,))

    def _connect(self) -> sqlite3.Connection:
        if self.db_path != ":memory:":
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        return sqlite3.connect(self.db_path)

    def _ensure_schema(self, conn: sqlite3.Connection) -> None:
        if self._ready:
            return
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                history_key TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_chat_messages_history_key_id
            ON chat_messages (history_key, id)
            """
        )
        conn.commit()
        self._ready = True

    def _trim(self, conn: sqlite3.Connection, key: str) -> None:
        conn.execute(
            """
            DELETE FROM chat_messages
            WHERE history_key = ?
              AND id NOT IN (
                SELECT id
                FROM chat_messages
                WHERE history_key = ?
                ORDER BY id DESC
                LIMIT ?
              )
            """,
            (key, key, self.max_messages),
        )
