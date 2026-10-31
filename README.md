# Personalized AI Tutoring Platform

An AI-powered technical learning platform designed for engineers to master Data Structures & Algorithms (DSA) and Data Science through interactive problem-solving with a real-time Socratic AI mentor.

> **Architecture Reference:**
> - **`ARCHITECTURE_V2.md`** — Core platform architecture, data contracts, and design patterns.
> - **`web-app/SEO.md`** — Search engine & Answer Engine Optimization (AEO / GEO) architecture.
> - **`web-app/CLIENT_SIDE_EXECUTION.md`** — Client-side WebAssembly (WASM) code execution design.

## Repository Layout

This is a monorepo organized into focused service boundaries:

| Path | What it is | Description |
| --- | --- | --- |
| `web-app/` | **Frontend Platform** | Next.js 16 (App Router), React 19, TypeScript, CodeMirror editor, Clerk Auth, Mongoose, client-side WASM execution. |
| `llm-app/` | **AI Tutor Backend** | Fast, explicit Python AI tutor service (FastAPI) featuring streaming SSE, context resolution, and asynchronous student memory reflection. |
| `agent/` | **Agent Harness** | Framework-free agent orchestration lane designed for minimal time-to-first-token latency. |
| `data/courses/{dsa,ds}/` | **Question Catalog** | Curated catalog of 1,000+ technical problems (440 DSA + 631 DS) with test cases, function schemas, and concepts. |
| `projects/` | **Hands-On Projects** | Systems and deep-learning project curriculum (e.g. building an autograd engine from scratch). |
| `nginx/`, `config/`, `docker-compose.yml` | **Infrastructure** | Containerized deployment configuration with reverse proxy and SSL. |

## Tech Stack & Architecture Highlights

- **Frontend & IDE:** Next.js 16, React 19, Tailwind CSS, CodeMirror 6 with custom multi-language syntax highlighting and automatic draft persistence.
- **Client-Side WASM Execution:** In-browser code execution using Web Workers (Pyodide for Python with NumPy/Pandas support, Clang for C/C++, Yaegi for Go). Eliminates expensive server-side execution sandboxes.
- **AI Mentorship Engine:** Low-latency streaming SSE pipeline emitting incremental tokens, thinking states, and tool actions without LangChain/LangGraph overhead.
- **Dual-Tier Student Memory:** Per-user persistent notes stored in SQLite, updated via asynchronous post-turn background reflection (`gpt-5-mini`) to track learning milestones and misconceptions across sessions.
- **Data & Boilerplate Generation:** Dynamic compiler generating executable test harnesses and type stubs from JSON catalog schemas.

## Local Development

Run the web platform and AI tutor backend locally:

### 1. Start the AI Tutor Backend (Python)
```bash
cd llm-app
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -e .
python -m uvicorn api.main:app --reload --port 8000
```

### 2. Start the Web Application (Next.js)
```bash
cd web-app
npm install
npm run dev
```

Open <http://localhost:3000> in your browser.
