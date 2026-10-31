from __future__ import annotations

from collections.abc import AsyncGenerator

from openai import APIError, AuthenticationError, RateLimitError

from app.agent.engine import agent_engine
from app.agent.events import sse_event
from app.agent.schemas import AgentContext, ChatRequest


async def stream_tutor_response(
    request: ChatRequest,
    context: AgentContext,
) -> AsyncGenerator[str, None]:
    try:
        async for payload in agent_engine.stream_payloads(request, context):
            yield sse_event(payload)
    except AuthenticationError:
        yield sse_event(
            {
                "type": "error",
                "message": "OpenAI authentication failed. Check OPENAI_API_KEY.",
            }
        )
    except RateLimitError:
        yield sse_event(
            {
                "type": "error",
                "message": "OpenAI rate limit reached. Please retry shortly.",
            }
        )
    except APIError:
        yield sse_event(
            {
                "type": "error",
                "message": "OpenAI API error. Please retry shortly.",
            }
        )
