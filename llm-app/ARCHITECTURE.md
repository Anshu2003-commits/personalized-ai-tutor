# Onlearn AI Tutor Architecture

Status: foundation build, Python-only tutor backend.

This document describes the root `llm-app/` service only. The web app is a
consumer of the SSE contract, but it is not part of this architecture pass.

## Goal

Build a smart tutor that can:

- understand the current question,
- remember the current conversation,
- later use long-term student memory,
- later inspect and execute code,
- identify gaps in understanding,
- guide with hints before full solutions,
- stream responses quickly,
- stay testable without LangChain, LangGraph, or DeepAgents.

The rule for this service is simple: keep the agent as a small explicit Python
loop around a provider interface, then add capabilities as small tested modules.
Today the only provider is OpenAI.

## Current Runtime Flow

Current endpoint:

```text
POST /chat/v1/stream
```

Request enters FastAPI in `api/main.py`, which mounts the tutor router:

```text
api/main.py
  -> app/agent/router.py
  -> app/agent/engine.py
  -> app/agent/storage/sqlite_history.py
  -> app/agent/tools/registry.py
  -> app/agent/providers/base.py
  -> app/agent/providers/openai_provider.py
  -> OpenAI Responses API
  -> app/agent/events.py
  -> SSE response
```

The active code path today:

1. `router.py` receives a `ChatRequest`.
2. `agent_engine.build_context()` loads question context and recent chat history.
3. `stream_tutor_response()` asks the engine for tutor events.
4. `TutorAgentEngine.stream_payloads()` builds instructions and model input.
5. The configured `LLMProvider` streams provider-neutral events.
6. The engine emits internal events like `thinking`, `token`, `done`, or `error`.
7. `events.py` serializes those events as SSE:

```text
data: {"type":"token","content":"..."}

```

## File Map

### `api/main.py`

Creates the FastAPI app, CORS, health route, and mounts the tutor router at:

```text
/chat/v1
```

It should stay boring. No tutor logic belongs here.

### `app/agent/router.py`

Owns HTTP routing only.

Responsibilities:

- accept `POST /stream`,
- build context through the engine,
- return `StreamingResponse`,
- catch unexpected top-level errors.

It should not make model decisions or manage memory/tools.

### `app/agent/schemas.py`

Defines request and internal data shapes:

- `ChatRequest`: input from the client.
- `ChatMessage`: prior user/assistant messages.
- `QuestionContext`: current catalog question data.
- `AgentContext`: module, session, question, and resolved history.

This file is the contract between layers.

### `app/agent/context.py`

Loads the current question from:

```text
data/courses/{dsa,ds}/questions.json
```

Current behavior:

- reads `question_id`,
- loads title, difficulty, problem statement, and concepts,
- falls back to an empty `QuestionContext` if the question is missing.

Future role:

- add topic/module metadata,
- add learner progress snapshot,
- add current code metadata if the client sends it or a tool fetches it.

### `app/agent/prompts.py`

Builds tutor instructions.

Current behavior:

- sets the base tutoring style,
- adds active module,
- adds current question details.

The prompt currently teaches the tutor to be concise, Socratic, practical, and
avoid giving full solutions immediately.

Future role:

- include gap-detection rubric,
- include memory summary,
- include tool-use policy,
- include code-review behavior.

### `app/agent/tools/base.py`

Defines the internal tool contract:

- `ToolSpec`: name, description, input schema, read-only flag.
- `ToolContext`: request plus resolved agent context.
- `ToolResult`: structured success/failure result.
- `TutorTool`: protocol every tool must implement.

Tools return structured results. They should not leak raw exceptions into the
agent loop.

### `app/agent/tools/validation.py`

Validates tool arguments against the JSON-schema subset we use internally.

Current support:

- object schemas,
- required fields,
- `additionalProperties: false`,
- basic JSON types: string, boolean, integer, number, object, array, null.

This avoids adding a dependency until we need full JSON Schema behavior.

### `app/agent/tools/registry.py`

Owns safe tool registration and execution.

Current behavior:

- validates tool names,
- rejects duplicate tools,
- validates tool schemas at registration,
- validates arguments before execution,
- returns structured errors for unknown tools, bad arguments, and tool crashes.

The default registry is currently empty. This step built the plumbing only; the
next step is adding the first read-only tutor tool.

### `app/agent/history.py`

Conversation history helpers and default store factory.

Current behavior:

- keyed by `threadId` if present, otherwise `{module}:{sessionId}`,
- returns a SQLite-backed history store by default,
- keeps an in-memory implementation for focused tests and fallback use.

Why this exists:

The tutor needs prior chat history, but we do not want persistence decisions
mixed into the agent loop. This interface can later be backed by Mongo, Redis,
files, or another store without changing the router.

### `app/agent/storage/base.py`

Defines the conversation-history storage contract:

- `load(key)`
- `replace(key, messages)`
- `append_turn(key, user_content, assistant_content)`
- `clear(key)`

It also owns shared message cleanup/trimming.

### `app/agent/storage/sqlite_history.py`

SQLite-backed short-term chat history.

Current behavior:

- stores user/assistant messages by conversation key,
- conversation key is `threadId` if present, otherwise `{module}:{sessionId}`,
- preserves message order,
- trims to the latest `HISTORY_MAX_MESSAGES` messages,
- persists across Python process restarts,
- lazily creates the DB on first use.

Default DB path:

```text
HISTORY_DB_PATH=.data/tutor_history.sqlite3
```

The default path is local generated state and is gitignored.

### `app/agent/memory/identity.py`

Owns Phase 0 memory identity rules.

Current behavior:

- long-term memory ids must be namespaced, for example `clerk:user_123`,
- empty, anonymous, or un-namespaced ids are not valid memory ids,
- `memory_user_id_from_request()` returns `None` unless the request has a valid
  namespaced `user_id`.

Phase 0 finding:

- the web route already has the authenticated Clerk user id,
- the old browser payload sent a hardcoded `spike-user`,
- the web route now overwrites browser input and forwards `clerk:${userId}` to
  the Python tutor.

### `app/agent/memory/sqlite_memory.py`

SQLite-backed long-term student memory store.

Storage shape:

```text
student_memory(user_id TEXT PRIMARY KEY, content TEXT, updated_at TEXT)
```

The content is one small markdown blob per user with fixed sections:

```text
## Misconceptions

## Preferences

## Progress
```

Current behavior:

- reads the whole blob for a namespaced user,
- atomically replaces the blob,
- atomically appends one bullet under a fixed section,
- compacts by rewriting and capping the blob,
- rejects writes for empty or un-namespaced user ids,
- logs reads and writes with the saved/injected content,
- supports `:memory:` for tests.

This is intentionally not a structured per-concept memory system yet.

### `app/agent/engine.py`

The core tutor loop.

Current responsibilities:

- resolve history,
- build provider input,
- build tutor instructions,
- call the configured `LLMProvider`,
- convert provider-neutral stream events into tutor payloads,
- record completed turns into history.

This is the main place where future agent behavior will be added.

Future phases:

- tool-call loop,
- memory retrieval,
- code execution tool,
- misconception/gap detector,
- post-turn reflection and memory write.

The engine must not import provider SDKs directly.

### `app/agent/code_execution/base.py`

Defines the shared code-runner contract:

- `CodeRunRequest`
- `CodeRunResult`
- `CodeRunner`

The same contract should be used by the tutor and by the student-facing Run
Code API. This keeps tutor-visible output and student-visible output aligned.

### `app/agent/code_execution/python_runner.py`

Local Python subprocess runner.

Current behavior:

- writes the submitted code to a temporary `main.py`,
- runs it without a shell,
- passes optional stdin,
- captures stdout, stderr, and combined display output,
- enforces a timeout,
- truncates very large output.

This is a foundation runner, not a production sandbox. Production execution
should keep this request/result contract and run inside stronger isolation, such
as a locked-down container.

### `app/agent/providers/base.py`

Defines the provider-neutral model contract:

- `LLMProvider`
- `ProviderEvent`
- `ProviderInput`

The engine only knows this contract. It does not know whether the underlying
model is OpenAI, Anthropic, Gemini, or something else later.

Current event kinds:

- `token`
- `completed`
- `error`

Future provider event kinds can include structured tool calls once we add tool
support.

### `app/agent/providers/openai_provider.py`

The OpenAI adapter.

Current behavior:

- calls `client.responses.create(..., stream=True)`,
- maps `response.output_text.delta` to `ProviderEvent(kind="token")`,
- maps `response.completed` to `ProviderEvent(kind="completed")`,
- maps OpenAI stream errors to `ProviderEvent(kind="error")`.

This is the only layer that should understand OpenAI stream event names.

### `app/agent/events.py`

SSE serialization.

Current event types:

- `thinking`
- `token`
- `done`
- `error`

The frontend already understands richer events too, so future events can include:

- `tool_start`
- `tool_end`
- `tool_chunk`
- `memory_used`
- `gap_detected`

### `app/agent/openai_client.py`

Creates the async OpenAI client from `OPENAI_API_KEY`.

This should remain a small adapter used by `OpenAIProvider`.

### `app/agent/config.py`

Reads environment settings:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`, default `gpt-5`
- `COURSE_DATA_PATH`, default `../data/courses`
- `HISTORY_DB_PATH`, default `.data/tutor_history.sqlite3`
- `HISTORY_MAX_MESSAGES`, default `12`
- `MEMORY_ENABLED`, default `true`
- `MEMORY_DB_PATH`, default `.data/tutor_memory.sqlite3`
- `MEMORY_MODEL`, default `gpt-5-mini`

## Current Capabilities

The tutor can currently:

- stream responses with OpenAI Responses API,
- include current question context,
- include persistent recent chat history,
- isolate OpenAI SDK usage behind a provider adapter,
- register and safely execute internal tutor tools,
- run Python code through the shared local runner foundation,
- store long-term student memory as a small SQLite markdown blob,
- preserve the frontend SSE shape,
- handle basic OpenAI auth/rate/API errors,
- be tested without calling OpenAI.

## Current Limitations

The tutor does not yet:

- inject long-term student memory into tutor prompts,
- write long-term memory after tutor turns,
- inspect editor code automatically,
- expose code execution to the tutor or frontend API,
- let the model request tools through provider tool-calling,
- detect gaps as structured data,
- create learning plans,
- store post-session reflections.

Those are planned layers, not hidden behavior.

## Target Architecture

The finished Python tutor should look like this:

```text
FastAPI router
  -> TutorAgentEngine
      -> ContextBuilder
      -> HistoryStore
      -> MemoryStore
      -> PromptBuilder
      -> LLMProvider
          -> OpenAIProvider today
          -> other provider adapters later
      -> ToolRegistry
          -> code_execution
          -> current_question
          -> prior_chat_search
          -> student_memory
          -> progress_snapshot
      -> provider stream
      -> GapDetector / Reflection
      -> EventEmitter
```

The agent loop should stay explicit:

1. Load context.
2. Load short-term chat history.
3. Retrieve relevant long-term memory.
4. Build instructions.
5. Send request through the configured provider.
6. Stream tokens.
7. If the model asks for a tool, validate and run the tool through `ToolRegistry`.
8. Feed tool output back to the model.
9. Continue until final answer.
10. Store the turn and any useful memory/reflection.

No framework should own this loop for us.

## Test Strategy

Every layer should have focused tests:

- context loading: catalog question in, `QuestionContext` out,
- prompt building: includes the correct question and tutor rules,
- history: bounded append/load behavior,
- engine: fake provider stream in, tutor events out,
- provider adapters: provider SDK stream in, provider-neutral events out,
- SSE: exact wire format,
- tools: input validation, output shape, failure behavior,
- code execution: correct stdout/stderr/timeouts,
- memory: retrieval and write rules,
- gap detection: structured examples and regressions.

The first tests use Python `unittest` to avoid adding dependencies too early.

## Build Order

1. Foundation: router, engine, events, history, tests. Done.
2. Persistent history store. Done.
3. Tool registry skeleton. Done.
4. First read-only current-question tool.
5. Prior-chat search tool.
6. Code execution tool.
7. Student memory retrieval.
8. Structured gap detection.
9. Reflection and memory write-back.
10. Golden tutor behavior tests.

Each step must solve a real student problem and come with tests.
