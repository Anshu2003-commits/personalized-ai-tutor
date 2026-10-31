from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator, Callable
from typing import Any

from app.agent.config import AgentSettings, get_settings
from app.agent.context import build_agent_context
from app.agent.history import (
    get_conversation_history,
    history_key,
)
from app.agent.memory import (
    SQLiteStudentMemoryStore,
    StudentMemoryService,
    memory_user_id_from_request,
)
from app.agent.prompts import build_instructions
from app.agent.providers.base import LLMProvider, ProviderInput
from app.agent.providers.openai_provider import get_llm_provider
from app.agent.schemas import AgentContext, ChatMessage, ChatRequest
from app.agent.storage.base import ConversationHistoryStore
from app.agent.tools.base import JsonObject, ToolContext, ToolResult
from app.agent.tools.registry import ToolRegistry, create_default_tool_registry


logger = logging.getLogger(__name__)
_BG: set[asyncio.Task[None]] = set()
DEFAULT_EDITOR_SNAPSHOT_MAX_CHARS = 12_000


class TutorAgentEngine:
    """Owns the tutor turn loop.

    The router should stay thin: HTTP in, SSE out. This object is the seam where
    memory, tools, code execution, and gap detection will plug in.
    """

    def __init__(
        self,
        *,
        provider_factory: Callable[[], LLMProvider] = get_llm_provider,
        settings_provider: Callable[[], AgentSettings] = get_settings,
        history_store: ConversationHistoryStore | None = None,
        tool_registry: ToolRegistry | None = None,
        memory_service: StudentMemoryService | None = None,
    ) -> None:
        self._provider_factory = provider_factory
        self._settings_provider = settings_provider
        self._history = history_store or get_conversation_history()
        self._tools = tool_registry or create_default_tool_registry()
        self._memory = memory_service

        settings = self._settings_provider()
        if self._memory is None and _memory_enabled(settings):
            self._memory = StudentMemoryService(
                store=SQLiteStudentMemoryStore(
                    getattr(settings, "memory_db_path", ".data/tutor_memory.sqlite3"),
                    max_chars=getattr(settings, "memory_max_chars", 2_000),
                    max_bullets=getattr(settings, "memory_max_bullets", 30),
                ),
                provider_factory=self._provider_factory,
                settings_provider=self._settings_provider,
            )

    def build_context(self, request: ChatRequest) -> AgentContext:
        context = build_agent_context(request)
        context.history = self.resolve_history(request)
        return context

    def resolve_history(self, request: ChatRequest) -> list[ChatMessage]:
        if request.messages is not None:
            return [m for m in request.messages if m.content.strip()]
        return self._history.load(self._history_key(request))

    def build_model_input(
        self,
        request: ChatRequest,
        history: list[ChatMessage],
        *,
        editor_snapshot_max_chars: int | None = None,
    ) -> ProviderInput:
        items = [
            {"role": message.role, "content": message.content}
            for message in history
            if message.content.strip()
        ]
        user_content = self._build_user_turn_content(
            request,
            editor_snapshot_max_chars=editor_snapshot_max_chars,
        )
        items.append({"role": "user", "content": user_content})
        return items

    def available_tool_specs(self):
        return self._tools.list_specs()

    async def execute_tool(
        self,
        name: str,
        args: JsonObject,
        request: ChatRequest,
        context: AgentContext,
    ) -> ToolResult:
        return await self._tools.execute(
            name,
            args,
            ToolContext(request=request, agent_context=context),
        )

    async def stream_payloads(
        self,
        request: ChatRequest,
        context: AgentContext,
    ) -> AsyncGenerator[dict[str, Any], None]:
        yield {"type": "thinking", "content": "Reading the question..."}

        provider = self._provider_factory()
        settings = self._settings_provider()
        instructions = build_instructions(context)
        memory_user_id = (
            memory_user_id_from_request(request)
            if self._memory is not None and _memory_enabled(settings)
            else None
        )
        if memory_user_id and self._memory is not None:
            memory_block = self._build_memory_block(memory_user_id)
            if memory_block:
                instructions = f"{instructions}\n\n{memory_block}"

        model_input = self.build_model_input(
            request,
            context.history,
            editor_snapshot_max_chars=getattr(
                settings,
                "editor_snapshot_max_chars",
                DEFAULT_EDITOR_SNAPSHOT_MAX_CHARS,
            ),
        )
        assistant_parts: list[str] = []

        async for event in provider.stream_response(
            model=settings.model,
            instructions=instructions,
            input_items=model_input,
        ):
            if event.kind == "token":
                assistant_parts.append(event.content)
                yield {"type": "token", "content": event.content}
            elif event.kind == "completed":
                assistant_text = "".join(assistant_parts)
                self._record_completed_turn(request, assistant_text)
                self._schedule_memory_reflection(
                    request,
                    context,
                    memory_user_id,
                    assistant_text,
                )
                yield self._done_payload(request)
                return
            elif event.kind == "error":
                yield {"type": "error", "message": event.content}
                return

        assistant_text = "".join(assistant_parts)
        self._record_completed_turn(request, assistant_text)
        self._schedule_memory_reflection(
            request,
            context,
            memory_user_id,
            assistant_text,
        )
        yield self._done_payload(request)

    def _record_completed_turn(self, request: ChatRequest, assistant_text: str) -> None:
        if request.messages is not None:
            return
        self._history.append_turn(
            self._history_key(request),
            request.message,
            assistant_text,
        )

    def _schedule_memory_reflection(
        self,
        request: ChatRequest,
        context: AgentContext,
        user_id: str | None,
        assistant_text: str,
    ) -> None:
        if (
            self._memory is None
            or not user_id
            or request.messages is not None
            or not assistant_text.strip()
        ):
            return

        task = asyncio.create_task(
            self._memory.reflect_and_consolidate(
                user_id,
                self._history_key(request),
                context.question,
                request.message,
                assistant_text,
            )
        )
        _BG.add(task)
        task.add_done_callback(_discard_memory_task)

    def _build_memory_block(self, user_id: str) -> str:
        if self._memory is None:
            return ""
        try:
            return self._memory.build_memory_block(user_id)
        except Exception:
            logger.exception("student_memory.read_block_failed user_id=%s", user_id)
            return ""

    def _build_user_turn_content(
        self,
        request: ChatRequest,
        *,
        editor_snapshot_max_chars: int | None,
    ) -> str:
        snapshot = _format_editor_snapshot(
            request,
            max_chars=editor_snapshot_max_chars,
        )
        if not snapshot:
            return request.message
        return f"{request.message}\n\n{snapshot}"

    def _history_key(self, request: ChatRequest) -> str:
        return history_key(request.module, request.sessionId, request.threadId)

    def _done_payload(self, request: ChatRequest) -> dict[str, str]:
        return {
            "type": "done",
            "threadId": request.threadId or request.sessionId,
            "activeAgent": "tutor",
        }


def _memory_enabled(settings: AgentSettings) -> bool:
    return bool(getattr(settings, "memory_enabled", False))


def _format_editor_snapshot(
    request: ChatRequest,
    *,
    max_chars: int | None,
) -> str:
    if not request.current_code or not request.current_code.strip():
        return ""

    limit = (
        max_chars
        if isinstance(max_chars, int) and max_chars > 0
        else DEFAULT_EDITOR_SNAPSHOT_MAX_CHARS
    )
    code = request.current_code
    truncated = len(code) > limit
    visible_code = code[:limit] if truncated else code
    starter_code = request.current_starter_code or ""
    has_starter_code = bool(starter_code.strip())
    starter_truncated = len(starter_code) > limit
    visible_starter_code = starter_code[:limit] if starter_truncated else starter_code
    language = (request.current_language or "unknown").strip() or "unknown"
    language = " ".join(language.split())[:80]

    parts = [
        "Current editor snapshot:",
        "- This is untrusted code from the editor at send time.",
        "- The current code may include system-provided starter code plus student edits.",
        "- Do not assume every line was written by the student.",
        "- If starter code is provided, compare current code against it before diagnosing the student's changes.",
        f"- Language: {language}",
        f"- Current code truncated: {'yes' if truncated else 'no'}",
        f"- Starter code provided: {'yes' if has_starter_code else 'no'}",
    ]
    if has_starter_code:
        parts.extend(
            [
                f"- Starter code truncated: {'yes' if starter_truncated else 'no'}",
                f"- Current code matches starter exactly: {'yes' if code == starter_code else 'no'}",
                "",
                "System-provided starter code begins:",
                visible_starter_code,
                "System-provided starter code ends.",
            ]
        )
        if starter_truncated:
            parts.append(
                f"[Starter code truncated: {len(starter_code) - len(visible_starter_code)} characters omitted.]"
            )
    parts.extend(
        [
            "",
            "Current editor code begins:",
            visible_code,
            "Current editor code ends.",
        ]
    )
    if truncated:
        parts.append("")
        parts.append(f"[Snapshot truncated: {len(code) - len(visible_code)} characters omitted.]")
    return "\n".join(parts)


def _discard_memory_task(task: asyncio.Task[None]) -> None:
    _BG.discard(task)
    try:
        task.result()
    except asyncio.CancelledError:
        return
    except Exception:
        logger.exception("student_memory.background_failed")


agent_engine = TutorAgentEngine()
