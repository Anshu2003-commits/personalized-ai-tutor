from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class StudentMemoryBlob:
    user_id: str
    content: str
    updated_at: str


class StudentMemoryStore(Protocol):
    def read(self, user_id: str | None) -> str:
        """Read the markdown memory blob for a namespaced user id."""

    def write(
        self,
        user_id: str,
        content: str,
        *,
        gate: str = "manual",
    ) -> StudentMemoryBlob:
        """Atomically replace a user's markdown memory blob."""

    def append_bullet(
        self,
        user_id: str,
        section: str,
        bullet: str,
        *,
        gate: str,
    ) -> StudentMemoryBlob:
        """Atomically append one memory bullet under a fixed section."""

    def compact(
        self,
        user_id: str,
        rewritten_content: str | None = None,
        *,
        gate: str = "compact",
    ) -> StudentMemoryBlob:
        """Rewrite and cap a memory blob after reflection/compaction."""
