# AI Tutor Backend Service

Fast, explicit Python agent service for the Personalized AI Tutoring Platform.

## Current Endpoint

- `POST /chat/v1/stream` — Low-latency Server-Sent Events (SSE) streaming endpoint.

## Architecture Highlights

- **Framework-Free Engine:** Built without LangChain or LangGraph to minimize time-to-first-token latency.
- **Context Injection:** Ingests question context, test cases, live code editor snapshots, and persistent chat history.
- **Student Memory Service:** Asynchronous post-turn reflection using `gpt-5-mini` that detects misconceptions, preferences, and progress, storing them in SQLite with automated compaction.

## Local Run

```bash
cd llm-app
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -e .
OPENAI_API_KEY=your_key_here python -m uvicorn api.main:app --reload --port 8000
```
