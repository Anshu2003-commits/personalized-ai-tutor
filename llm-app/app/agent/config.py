from functools import lru_cache
from os import getenv


def _int_env(name: str, default: int) -> int:
    try:
        return int(getenv(name, str(default)))
    except ValueError:
        return default


def _bool_env(name: str, default: bool) -> bool:
    value = getenv(name)
    if value is None:
        return default

    return value.strip().lower() not in {"0", "false", "no", "off"}


class AgentSettings:
    def __init__(self) -> None:
        self.openai_api_key = getenv("OPENAI_API_KEY", "")
        self.model = getenv("OPENAI_MODEL", "gpt-5")
        self.course_data_path = getenv("COURSE_DATA_PATH", "../data/courses")
        self.history_db_path = getenv("HISTORY_DB_PATH", ".data/tutor_history.sqlite3")
        self.history_max_messages = _int_env("HISTORY_MAX_MESSAGES", 12)
        self.editor_snapshot_max_chars = _int_env("EDITOR_SNAPSHOT_MAX_CHARS", 12_000)
        self.memory_enabled = _bool_env("MEMORY_ENABLED", True)
        self.memory_db_path = getenv("MEMORY_DB_PATH", ".data/tutor_memory.sqlite3")
        self.memory_model = getenv("MEMORY_MODEL", "gpt-5-mini")
        self.memory_reflect_every_turns = _int_env("MEMORY_REFLECT_EVERY_TURNS", 3)
        self.memory_max_appends_per_reflection = _int_env(
            "MEMORY_MAX_APPENDS_PER_REFLECTION",
            3,
        )
        self.memory_consolidate_at_bullets = _int_env(
            "MEMORY_CONSOLIDATE_AT_BULLETS",
            24,
        )
        self.memory_max_bullets = _int_env("MEMORY_MAX_BULLETS", 30)
        self.memory_max_chars = _int_env("MEMORY_MAX_CHARS", 2_000)

    def require_openai_api_key(self) -> str:
        if not self.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured.")
        return self.openai_api_key


@lru_cache(maxsize=1)
def get_settings() -> AgentSettings:
    return AgentSettings()
