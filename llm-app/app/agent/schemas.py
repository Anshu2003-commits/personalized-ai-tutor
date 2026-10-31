from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    message: str
    sessionId: str = ""
    module: str = "dsa"
    question_id: str | None = None
    threadId: str | None = None
    parent_msg_id: str | None = None
    context: dict[str, Any] | None = None
    user_id: str | None = None
    current_code: str | None = None
    current_language: str | None = None
    current_starter_code: str | None = None
    messages: list[ChatMessage] | None = None
    # Kept for backwards-compatible clients; not used by the Python tutor yet.
    files: dict[str, Any] | None = None


class QuestionContext(BaseModel):
    question_id: str | None = None
    title: str | None = None
    difficulty: str | None = None
    question: str | None = None
    concepts: list[str] = Field(default_factory=list)


class LessonContext(BaseModel):
    course_slug: str | None = None
    module_slug: str | None = None
    title: str | None = None
    description: str | None = None
    projects: list[str] = Field(default_factory=list)
    concepts: list[str] = Field(default_factory=list)


class AgentContext(BaseModel):
    module: str
    session_id: str
    question: QuestionContext | None = None
    lesson: LessonContext | None = None
    history: list[ChatMessage] = Field(default_factory=list)
