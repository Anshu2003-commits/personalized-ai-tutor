from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.agent.config import get_settings
from app.agent.schemas import AgentContext, ChatRequest, LessonContext, QuestionContext


def build_agent_context(request: ChatRequest) -> AgentContext:
    question_id = (request.question_id or "").strip()
    question = load_question(request.module, question_id) if question_id else None
    lesson = _lesson_context(request.context)

    return AgentContext(
        module=request.module,
        session_id=request.sessionId,
        question=question,
        lesson=lesson,
    )


def _lesson_context(context: dict[str, Any] | None) -> LessonContext | None:
    raw = context.get("lesson") if isinstance(context, dict) else None
    if not isinstance(raw, dict):
        return None

    def text(name: str, limit: int = 2000) -> str | None:
        value = raw.get(name)
        return str(value)[:limit] if isinstance(value, str) and value.strip() else None

    def strings(name: str) -> list[str]:
        value = raw.get(name)
        if not isinstance(value, list):
            return []
        return [str(item)[:160] for item in value[:20] if isinstance(item, str)]

    return LessonContext(
        course_slug=text("courseSlug", 120),
        module_slug=text("moduleSlug", 120),
        title=text("title", 240),
        description=text("description"),
        projects=strings("projects"),
        concepts=strings("concepts"),
    )


def load_question(module: str, question_id: str) -> QuestionContext | None:
    for row in _load_questions(module):
        if row.get("question_id") != question_id:
            continue

        concepts = row.get("concepts") or row.get("standard_concepts") or []
        if not isinstance(concepts, list):
            concepts = []

        return QuestionContext(
            question_id=str(row.get("question_id") or ""),
            title=row.get("question_title"),
            difficulty=row.get("difficulty"),
            question=row.get("question"),
            concepts=[str(item) for item in concepts],
        )

    return QuestionContext(question_id=question_id)


@lru_cache(maxsize=8)
def _load_questions(module: str) -> tuple[dict[str, Any], ...]:
    safe_module = module if module in {"dsa", "ds"} else "dsa"
    path = Path(get_settings().course_data_path) / safe_module / "questions.json"
    if not path.exists():
        return ()

    try:
        data = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return ()

    if not isinstance(data, list):
        return ()

    return tuple(row for row in data if isinstance(row, dict))
