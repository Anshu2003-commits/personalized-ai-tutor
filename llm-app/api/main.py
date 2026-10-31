from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agent.router import router as agent_router


app = FastAPI(title="Onlearn LLM App")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(agent_router, prefix="/chat/v1", tags=["agent"])


@app.get("/")
async def root() -> dict[str, str]:
    return {"status": "ok", "service": "onlearn-llm-app"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "healthy"}
