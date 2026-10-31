from __future__ import annotations

import logging
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock

from app.agent.memory.base import StudentMemoryBlob
from app.agent.memory.identity import (
    is_namespaced_user_id,
    require_memory_user_id,
)


logger = logging.getLogger(__name__)

FIXED_SECTIONS = ("Misconceptions", "Preferences", "Progress")
DEFAULT_MEMORY_CONTENT = "\n\n".join(f"## {section}" for section in FIXED_SECTIONS)
_DEFAULT_MAX_CHARS = 2_000
_DEFAULT_MAX_BULLETS = 30


class SQLiteStudentMemoryStore:
    """SQLite-backed long-term markdown memory blob per student."""

    def __init__(
        self,
        db_path: str,
        *,
        max_chars: int = _DEFAULT_MAX_CHARS,
        max_bullets: int = _DEFAULT_MAX_BULLETS,
    ) -> None:
        if max_chars < 200:
            raise ValueError("max_chars must be at least 200")
        if max_bullets < len(FIXED_SECTIONS):
            raise ValueError("max_bullets must cover the fixed sections")

        self.db_path = db_path
        self.max_chars = max_chars
        self.max_bullets = max_bullets
        self._lock = Lock()
        self._ready = False
        self._memory_conn: sqlite3.Connection | None = None

    def read(self, user_id: str | None) -> str:
        if not is_namespaced_user_id(user_id):
            logger.info("student_memory.read skipped user_id=%r", user_id)
            return ""

        with self._lock, self._connect() as conn:
            self._ensure_schema(conn)
            row = conn.execute(
                """
                SELECT content
                FROM student_memory
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()

        content = row[0] if row else ""
        logger.info("student_memory.read user_id=%s length=%d", user_id, len(content))
        logger.debug("student_memory.read user_id=%s content=%r", user_id, content)
        return content

    def write(
        self,
        user_id: str,
        content: str,
        *,
        gate: str = "manual",
    ) -> StudentMemoryBlob:
        user_id = require_memory_user_id(user_id)
        normalized = self._normalize_and_cap(content)
        return self._upsert(user_id, normalized, gate=gate)

    def append_bullet(
        self,
        user_id: str,
        section: str,
        bullet: str,
        *,
        gate: str,
    ) -> StudentMemoryBlob:
        user_id = require_memory_user_id(user_id)
        section = _normalize_section(section)
        bullet = _normalize_bullet(bullet)
        if not bullet:
            raise ValueError("memory bullet must not be empty")

        with self._lock, self._connect() as conn:
            self._ensure_schema(conn)
            conn.execute("BEGIN IMMEDIATE")
            try:
                existing = self._read_content(conn, user_id) or DEFAULT_MEMORY_CONTENT
                sections = _parse_sections(existing)
                sections[section].append(bullet)
                content = self._cap_sections(sections)
                updated_at = _utc_now()
                self._upsert_in_connection(conn, user_id, content, updated_at)
                conn.commit()
            except Exception:
                conn.rollback()
                raise

        logger.info(
            "student_memory.write user_id=%s gate=%s length=%d",
            user_id,
            gate,
            len(content),
        )
        logger.debug(
            "student_memory.write user_id=%s gate=%s content=%r",
            user_id,
            gate,
            content,
        )
        return StudentMemoryBlob(user_id=user_id, content=content, updated_at=updated_at)

    def compact(
        self,
        user_id: str,
        rewritten_content: str | None = None,
        *,
        gate: str = "compact",
    ) -> StudentMemoryBlob:
        user_id = require_memory_user_id(user_id)

        with self._lock, self._connect() as conn:
            self._ensure_schema(conn)
            existing = self._read_content(conn, user_id) or DEFAULT_MEMORY_CONTENT

        logger.info(
            "student_memory.compact_before user_id=%s gate=%s length=%d",
            user_id,
            gate,
            len(existing),
        )
        logger.debug(
            "student_memory.compact_before user_id=%s gate=%s content=%r",
            user_id,
            gate,
            existing,
        )
        content = rewritten_content if rewritten_content is not None else existing
        return self._upsert(user_id, self._normalize_and_cap(content), gate=gate)

    def clear(self, user_id: str) -> None:
        user_id = require_memory_user_id(user_id)
        with self._lock, self._connect() as conn:
            self._ensure_schema(conn)
            with conn:
                conn.execute("DELETE FROM student_memory WHERE user_id = ?", (user_id,))

    def _upsert(
        self,
        user_id: str,
        content: str,
        *,
        gate: str,
    ) -> StudentMemoryBlob:
        updated_at = _utc_now()
        with self._lock, self._connect() as conn:
            self._ensure_schema(conn)
            with conn:
                self._upsert_in_connection(conn, user_id, content, updated_at)

        logger.info(
            "student_memory.write user_id=%s gate=%s length=%d",
            user_id,
            gate,
            len(content),
        )
        logger.debug(
            "student_memory.write user_id=%s gate=%s content=%r",
            user_id,
            gate,
            content,
        )
        return StudentMemoryBlob(user_id=user_id, content=content, updated_at=updated_at)

    def _upsert_in_connection(
        self,
        conn: sqlite3.Connection,
        user_id: str,
        content: str,
        updated_at: str,
    ) -> None:
        conn.execute(
            """
            INSERT INTO student_memory (user_id, content, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                content = excluded.content,
                updated_at = excluded.updated_at
            """,
            (user_id, content, updated_at),
        )

    def _read_content(self, conn: sqlite3.Connection, user_id: str) -> str | None:
        row = conn.execute(
            """
            SELECT content
            FROM student_memory
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        return row[0] if row else None

    def _normalize_and_cap(self, content: str) -> str:
        return self._cap_sections(_parse_sections(content))

    def _cap_sections(self, sections: dict[str, list[str]]) -> str:
        sections = {name: list(sections.get(name, [])) for name in FIXED_SECTIONS}

        while _bullet_count(sections) > self.max_bullets:
            _drop_oldest_from_largest_section(sections)

        content = _format_sections(sections)
        while len(content) > self.max_chars and _bullet_count(sections) > 0:
            _drop_oldest_from_largest_section(sections)
            content = _format_sections(sections)

        if len(content) > self.max_chars:
            return content[: self.max_chars].rstrip()

        return content

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        if self.db_path == ":memory:":
            if self._memory_conn is None:
                self._memory_conn = sqlite3.connect(":memory:", check_same_thread=False)
            yield self._memory_conn
            return

        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        try:
            yield conn
        finally:
            conn.close()

    def _ensure_schema(self, conn: sqlite3.Connection) -> None:
        if self._ready:
            return
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS student_memory (
                user_id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
        self._ready = True


def _parse_sections(content: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {name: [] for name in FIXED_SECTIONS}
    current_section = "Progress"

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("## "):
            heading = line.removeprefix("## ").strip()
            if heading in sections:
                current_section = heading
            else:
                current_section = "Progress"
            continue
        sections[current_section].append(_normalize_bullet(line))

    return sections


def _format_sections(sections: dict[str, list[str]]) -> str:
    blocks: list[str] = []
    for section in FIXED_SECTIONS:
        lines = [f"## {section}"]
        lines.extend(line for line in sections.get(section, []) if line)
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks).strip()


def _normalize_section(section: str) -> str:
    normalized = section.strip()
    if normalized not in FIXED_SECTIONS:
        allowed = ", ".join(FIXED_SECTIONS)
        raise ValueError(f"memory section must be one of: {allowed}")
    return normalized


def _normalize_bullet(bullet: str) -> str:
    value = bullet.strip()
    if value.startswith("-"):
        value = value[1:].strip()
    return f"- {value}" if value else ""


def _bullet_count(sections: dict[str, list[str]]) -> int:
    return sum(len(lines) for lines in sections.values())


def _drop_oldest_from_largest_section(sections: dict[str, list[str]]) -> None:
    largest = max(FIXED_SECTIONS, key=lambda section: len(sections.get(section, [])))
    if sections.get(largest):
        sections[largest].pop(0)


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()
