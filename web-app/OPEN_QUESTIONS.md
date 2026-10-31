# Spike - open questions

Decisions deferred out of the spike. Revisit during Phase 2 design (deliverable #11 of the brief).

## Tutor three-panel column order

**Current:** problem (left) | chat (center) | code (right)

**Alternative:** problem (left) | code (center) | chat (right) - the LeetCode pattern

**Tradeoff:**
- Chat-middle visually reinforces *"AI mentor is the protagonist"* - the entire brand differentiator.
- Code-middle matches established coding-tool ergonomics (LeetCode / NeetCode / CodeSignal) where 70%+ of session time is spent typing in the editor. Chat-middle pushes the typing surface to the far right.

**What resolves it:** real user testing once the loop works. Both layouts are one CSS class change away.

**Status:** kept chat-middle for the spike (perf validation is layout-independent).

## Code execution: Pyodide/client-side, Judge0 dropped from active deployment

**Historical Phase 1 split:**
- **DSA** track → Judge0 server-side execution (multi-language support, isolate sandbox, dev parity with prod)
- **DS** track → Pyodide in-browser (numpy/pandas WASM, no backend, faster for solo Python)

**Spike state:** seeds are DSA (Arrays/Fundamentals). Production path for these would be Judge0. But Judge0 1.13.1 ships with isolate v1.x which requires cgroups v1, and the dev kernel here (6.14, cgroups v2) breaks the sandbox with `rb_sysopen /box/script.py`. Phase 1's documented workaround for local dev is to use Pyodide.

**What the spike did:**
- Ported Phase 1's Pyodide worker + hook into `app/workers/pyodide.worker.ts` + `hooks/use-pyodide.ts`
- Wired `TutorEditor` to call Pyodide locally
- Kept `lib/judge0.ts` + `app/api/run/route.ts` as a possible DSA production execution path

**Current decision after v2 deployment:** active production uses the v2 Docker Compose stack
without Judge0. The current runnable path is client-side execution, with future multi-language
WASM work tracked separately. Judge0 code should be treated as parked legacy/reference code unless
Ashish explicitly reopens a server-side execution lane.

**Status:** resolved for active deployment. Judge0 is not part of staging or production.

## First-token latency: brief target is 15-25x optimistic

**Brief target:** first AI token streams <200ms from submit.

**Measured (spike, dev kernel, local llm-app):**
- Cold session, agent loads workspace via tool calls before responding:
  - First SSE event of any type: **~2.5s** (the first event is a `tool_chunk`, not a token)
  - First `token` event: longer (after 3+ tool roundtrips)
  - Total response: ~35s
- Warmer session, agent skips workspace tools:
  - First SSE event = first `token`: **~3.0s**
  - Total response: ~3.7s

**Where the time goes** (estimate, not yet measured per-stage):
- Proxy hop (web-app → llm-app service): <100ms
- llm-app FastAPI dispatch + LangGraph middleware (TutorContextMiddleware, memory, workspace load): 200-500ms
- LLM provider TTFT (Anthropic): 500ms-2s cold
- If agent decides to call workspace tools first: +1-2s per tool roundtrip

**Implication for Phase 2 brief:**
- The 200ms claim was aspirational, not architectural. Achieving it requires agent-side redesign, not transport optimization.
- Realistic candidates (none of which are spike scope):
  - Pre-warm LangGraph thread when the user opens a question
  - Skip workspace tool calls on the first turn (preload context server-side)
  - Stream a fast `thinking…` ack from a small model while the heavy agent loads
  - Classifier-router (the brief itself suggests this) - Haiku for short turns, Sonnet for substantive

**What to do:** when the Phase 2 brief is finalized, revise the latency target to something honest (e.g. *first event <500ms, first token <1.5s with pre-warming*). Treat the 200ms number as a stretch goal contingent on classifier-router + agent pre-warm shipping.

**Status:** spike validates that the *transport* architecture (RSC + Next.js proxy + SSE) is not the bottleneck. The bottleneck is agent + LLM, which is real production architecture work, not spike work.

## Agent pre-warm experiment (deferred)

**Hypothesis:** the 2.5-3.0s first-token figure measured on Day 3 can be cut substantially by:
- Opening the LangGraph thread the moment the user enters a question (before they send a message)
- Skipping or pre-loading workspace tool calls on the first turn (`ls /`, `glob /*.md`, `read_playbook`) since those are static per session
- Optionally streaming a cheap "thinking…" ack from a small model (Haiku) while the heavy agent loads

**Why deferred:** the spike is validating architecture, not redesigning the agent. Day 3 already produced enough data to know this is the gap.

**What to do later:** spin a focused experiment (1-2 days) that pre-warms a thread on question page load, then measures first-token on the user's first real message. If the number lands at <1s, it's worth shipping in Phase 2. If still 2s+, the LLM TTFT is the floor and target-setting needs to acknowledge that.

**Status:** parked.
