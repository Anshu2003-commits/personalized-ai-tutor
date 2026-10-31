# Phase 2 spike - findings

**Branch:** `phase-2-spike`
**Range:** commits `714b64e` (Day 1) → `05c3378` (Day 4) + Day 6 close
**Stack:** Next.js 16.2.6, React 19.2.4, Tailwind v4, shadcn (neutral), CodeMirror 6, Pyodide (CDN-loaded), LangGraph (via existing `llm-app` service on `:8000`)

## What the spike was for

Validate whether the Phase 2 brief's perf + architecture claims are achievable, with the smallest possible end-to-end implementation, before committing to the full Phase 2 rewrite. Throwaway by design.

---

## Validated

| Claim | Measured | Notes |
|---|---|---|
| Topic → first question render <300ms warm | **25-65ms** | RSC + bundled catalog. In dev mode. Production should be faster. |
| Topic → first question render <800ms cold | **190ms** | First-visit with Turbopack compile in dev. |
| Catalog as immutable in-memory map | yes | `lib/catalog.ts` - loaded once at module init, RSC reads from it. |
| Sibling-question prefetch architecture | **5-32ms warm hit** | All sibling question_ids hit `/api/questions/[id]` in parallel on mount. |
| IndexedDB cache layer for question content | structurally validated | `lib/idb-cache.ts` + `lib/question-loader.ts` (IDB-first, fetch-on-miss, in-flight dedup). Sub-5ms hit expected in-browser. |
| SSE transport for AI streaming | yes | `app/api/chat/stream/route.ts` proxies `llm-app /chat/stream`; SSE events stream through cleanly with negligible proxy overhead (<100ms). |
| Lazy-loaded CodeMirror | yes | `next/dynamic({ ssr: false })`, shows skeleton then hydrates. |
| Pyodide in-browser Python | yes | CDN-loaded WASM, stdin redirection via `sys.stdin = io.StringIO(...)`, Judge0-compatible result shape. ~5MB first download (browser-cached after). |
| Three-pane tutor layout (desktop) | yes | `grid-cols-[1fr_1fr_1fr]` on `md:`+, single-column stack below. |

## Invalidated

| Claim | Measured | Why |
|---|---|---|
| **First AI token <200ms from submit** | **2.5-3.0s** | Not a transport problem. Time goes to: LangGraph middleware (TutorContextMiddleware, memory load, workspace fetch) + LLM provider TTFT + the agent's preliminary tool calls (`ls /`, `glob /*.md`, `read_playbook`) before any user-visible token. The transport layer (RSC → proxy → SSE) adds <100ms. Closing this gap requires **agent-side changes**, not architecture changes. |

## Parked (see `OPEN_QUESTIONS.md`)

1. **Tutor column order** - chat-middle (brand emphasis on AI mentor) vs code-middle (LeetCode ergonomic). Spike kept chat-middle; revisit with user testing.
2. **DSA→Judge0 / DS→Pyodide split** - resolved after the spike for active deployment. The v2 staging/production stack does not run Judge0; client-side execution is the active path, with future multi-language WASM work tracked separately. Old `lib/judge0.ts` / `app/api/run/route.ts` references are parked legacy/reference code.
3. **Agent pre-warm experiment** - the most architecturally consequential thing left unmeasured. Open the LangGraph thread on question page load, skip the preliminary workspace tool calls. Plausibly cuts first-token from 2.5-3.0s to <1s. Worth a focused 1-2 day follow-up before Phase 2 settles on a perf budget.

## Revised perf targets

The brief's targets need a calibration pass:

| Target | Brief | Realistic |
|---|---|---|
| First SSE event of any type | <200ms | **500ms-1s** with agent pre-warm; 2.5s without |
| First user-visible token | <200ms | **1.0-1.5s** with pre-warm + skip-workspace-tools; 3.0s today |
| Topic → question render (warm) | <300ms | **<100ms** - achievable, already met |
| Code keystroke → visual | <16ms | CodeMirror baseline, achievable |
| Lighthouse 95+ | aspirational | **Not measured** in spike (dev mode only). Schedule production build + Lighthouse run before Phase 2 ships. |

## What was NOT measured

- Production build (`next build`) perf
- Lighthouse scores
- Real mobile device perf (mobile responsive pass was viewport-meta + min-heights only; tabbed mobile UX is deferred)
- Service worker / PWA install
- Optimistic UI rollback edge cases (no user-progress state was added)
- Multiple concurrent users hitting the SSE proxy
- Pyodide cold-load wall-clock on slow connections

## Recommendation

**Proceed to the real Phase 2 build.** The architecture (Next 16 + RSC + Tailwind v4 + shadcn + IndexedDB cache + SSE proxy + Pyodide for local dev + LangGraph back end) is sound. The single invalidated claim is the <200ms first-token figure, and that's an *agent-side* issue with known mitigations - not a foundation problem.

**Before Phase 2 settles on a perf budget:** run the agent-pre-warm experiment (parked above) to know whether the first-token target should be 1s or 3s. That single data point will more accurately frame the "AI mentor is the protagonist" UX than any other measurement.

## What to carry forward

The spike's code is throwaway, but **patterns to copy into the real Phase 2 build**:

- `lib/catalog.ts` shape - slug↔question_id map, RSC-readable
- `lib/idb-cache.ts` - IDB wrapper, ~60 lines, no deps
- `lib/question-loader.ts` - IDB-then-fetch with in-flight dedup
- `lib/sse.ts` - fetch + ReadableStream SSE parser with stage timings (T0/T1/T2/T3)
- `app/api/chat/stream/route.ts` - server-side SSE proxy pattern
- `components/code-editor.tsx` + `tutor-editor.tsx` - lazy-loaded CodeMirror with stdin/pass/fail UI
- `app/workers/pyodide.worker.ts` + `hooks/use-pyodide.ts` - Pyodide worker with stdin redirection
- `web-app/docker-compose.yml` - spike-isolated backend stack (`onlearn-spike` project name, `spike-network`)

## What to discard

- `app/page.tsx` roadmap - placeholder, real Phase 2 needs proper roadmap visualization
- `data/seed-questions.json` - replace with the full catalog or an API-driven fetch path
- `app/learn/[slug]/page.tsx` thin shell - keep the *pattern* (RSC for slug routing, client component for question content) but the layout itself needs real design
- The Q1/Q2/Q3 nav buttons - bare-minimum spike UI, replace with proper roadmap-driven navigation
- Hardcoded `module: "dsa"` everywhere - needs real track selection

## Spike close

Branch `phase-2-spike` is on `master`. Four "Day" commits document the build. `OPEN_QUESTIONS.md` carries the deferred decisions. This file is the standalone artifact.
