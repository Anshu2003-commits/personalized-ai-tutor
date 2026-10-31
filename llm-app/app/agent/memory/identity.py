from __future__ import annotations

import re

from app.agent.schemas import ChatRequest


_PROVIDER_RE = re.compile(r"^[a-z][a-z0-9_-]{1,31}$")
_USER_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._@-]{0,191}$")
_NAMESPACED_USER_ID_RE = re.compile(
    r"^[a-z][a-z0-9_-]{1,31}:[A-Za-z0-9][A-Za-z0-9._@-]{0,191}$"
)
_ANONYMOUS_IDS = {"", "anonymous", "anon", "guest", "null", "none", "undefined"}


def namespace_user_id(provider: str, raw_user_id: str | None) -> str | None:
    provider = provider.strip().lower()
    raw = (raw_user_id or "").strip()

    if raw.lower() in _ANONYMOUS_IDS:
        return None
    if not _PROVIDER_RE.match(provider):
        raise ValueError("provider must be a short lowercase namespace")
    if not _USER_ID_RE.match(raw):
        raise ValueError("raw_user_id contains unsupported characters")

    return f"{provider}:{raw}"


def is_namespaced_user_id(user_id: str | None) -> bool:
    normalized = (user_id or "").strip()
    if not _NAMESPACED_USER_ID_RE.match(normalized):
        return False

    _, raw = normalized.split(":", 1)
    return raw.strip().lower() not in _ANONYMOUS_IDS


def memory_user_id_from_request(request: ChatRequest) -> str | None:
    user_id = (request.user_id or "").strip()
    if not is_namespaced_user_id(user_id):
        return None
    return user_id


def require_memory_user_id(user_id: str | None) -> str:
    normalized = (user_id or "").strip()
    if not is_namespaced_user_id(normalized):
        raise ValueError("memory user_id must be non-empty and namespaced")
    return normalized
