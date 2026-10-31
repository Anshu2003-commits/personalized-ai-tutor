from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.agent.engine import agent_engine
from app.agent.events import sse_event
from app.agent.schemas import ChatRequest
from app.agent.streaming import stream_tutor_response


router = APIRouter()


@router.post("/stream")
async def stream_chat(request: ChatRequest) -> StreamingResponse:
    async def event_generator():
        try:
            context = agent_engine.build_context(request)
            async for event in stream_tutor_response(request, context):
                yield event
        except Exception:
            yield sse_event(
                {
                    "type": "error",
                    "message": "Something went wrong on our end. Please retry.",
                }
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",# TODO : what does no cache mean here
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
