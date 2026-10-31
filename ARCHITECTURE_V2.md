# Personalized AI Tutoring Platform — Architecture & Build Plan

> **Status:** active build plan. **Last updated:** 2026-06-08.
> This is the cross-cutting anchor for the v2 build. The product strategy lives in
> archived Claude notes; current working context lives in `AGENTS.md`;
> design tokens live in `web-app/DESIGN.md`. This doc owns the
> **architecture, the shared contracts, the work-stream split, and the open decisions.**

---

## 0. How to use this doc

The v2 build runs as **several parallel chat sessions**, one per work stream (see §2). That only
works if every session builds against the **same contracts** (§3) and records decisions in the
**same place** (§8). So:

1. **Read §1–§3 at the start of every session**, whatever stream you're in.
2. When you make a load-bearing decision, move it from §8 (Open) to the relevant stream section
   as DECIDED, and mirror it into `AGENTS.md` or the relevant audit/design doc.
3. **Do not redefine a shared contract inside a single stream.** If a contract needs to change,
   change it here first, then update consumers.
4. One git branch per stream (§11). Rebase often.

Legend: **[DECIDED]** = locked. **[OPEN]** = must be resolved (see §8). **[ASSUMED]** = working
assumption, cheap to revise.

---

## 1. Current state (verified 2026-06-08)

Branch in flight: `feat/client-side-wasm-execution` (off `v2`).

**What works (verified this session — `next dev`, real HTTP):**
- App boots; `/`, `/dsa`, `/ds`, and the tutor route all SSR `200`. The earlier "won't load
  locally" problem is gone.
- Clerk middleware (`proxy.ts`) runs clean; tutor route correctly redirects unauthenticated users
  to sign-in.
- Real catalog served: **DSA 440 questions / 17 steps / 70 sub-steps**, **DS 631 / 16 / 37** (DS catalog refreshed 2026-06-11 from the latest Phase-1 curriculum; was 167).
- Auth (Clerk: Google + magic link), Mongo user model, AI credit metering (100/week), progress +
  streak + XP persistence, roadmap progress markers, Dodo Payments wiring — all built.
- Code execution is **client-side WASM** (`use-wasm-runtime`); Judge0 dropped. Python via Pyodide
  (numpy/pandas yes, PyTorch no).

**Verified-in-code completion loop (the core ritual):**
`tutor-workspace.tsx` (`passed = !stderr && actual === expected`) → `onQuestionCompleted()` →
`tutor-view.tsx` `handleQuestionCompleted` → `useProgress.markComplete()` →
`POST /api/user/progress` → `lib/progress.ts markQuestionCompleted()` → persists
`completedQuestionIds`, advances `currentQuestionId`, marks topic complete + `+10 XP`, updates streak.
**Wired end-to-end but never browser-tested on the WASM path** — see Stream B.

**Known issues carried in:**
- Streak day-boundary uses UTC (`todayUTC()`) despite the field name `lastActiveDayLocal` — rolls at
  the wrong midnight for most users.
- AI chat needs the agent backend running (today: `llm-app` on `:8000`). First token measured at
  **2.5–3.0s**, dominated by the LangGraph agent making 3 preliminary tool calls (`ls`, `glob`,
  `read_playbook`) before any token. This is the main reason for Stream A.

**Parked by explicit decision:** Mongo password rotation (testing only, rotate at prod), the
uncommitted June working-tree reconciliation, deep-debugging the old localhost symptom.

---

## 2. The build: parallel work streams

| Stream | Scope | Branch | Owns | Depends on |
| --- | --- | --- | --- | --- |
| **A. Agent** | Hand-rolled tutoring agent, no LangChain/LangGraph | `feat/agent-core` | the agent service + SSE contract (§3.3) | contracts §3.3 |
| **B. Module UX** | Select a module → solve → complete loop + polish | `feat/module-ux` | the in-browser learning flow | contracts §3.2, §3.4; consumes A's SSE |
| **C. Projects** | Repo-based projects + MCP server + certs + logs | `feat/projects` | new MCP service + project repo template | contracts §3.1, §3.5 only |
| **D. SEO & smooth** | SEO surfaces, landing, mobile, Lighthouse | `feat/seo` | marketing + perf + crawlability | none (most independent) |

**Coupling reality (important):**
- A ↔ B share the **agent SSE contract** (§3.3). B consumes whatever A emits.
- B uses the **catalog + progress contracts** (§3.2, §3.4) — already built, mostly stable.
- **C is nearly standalone.** It does NOT use the in-browser tutor, the agent, the WASM runtime, or
  the catalog schema. It shares only **auth + the User record** (§3.1, §3.5).
- **D is fully independent** and can start immediately. It cross-links to C (shareable project logs
  are indexable SEO content).

Therefore: **lock §3 first**, then A and B move in lockstep, C and D run free in parallel.

---

## 3. Shared contracts (single source of truth)

These are the surfaces more than one stream touches. Define here, change here.

### 3.1 Identity & the User record  [DECIDED]

Auth is **Clerk** (Google + magic link), abstracted behind `web-app/lib/auth.ts`. Mongo
connection via `lib/mongo.ts`. The Mongo `User` document (`web-app/lib/models/user.ts`) is the
**one identity record shared by all streams**:

```
User {
  clerkId, email, name, image
  modules:   Map<trackSlug, ModuleState>      // DSA/DS learning progress (Stream B)
  aiCredits, aiCreditsRefilledAt              // freemium metering
  subscriptionStatus, dodoCustomerId, dodoSubscriptionId
  preferredTrack
  // + projects: Map<projectSlug, ProjectState>   <-- ADDED by Stream C, see §3.5
}

ModuleState { topicProgress: Map<topicSlug, TopicState>,
              streak: { count, lastActiveDayLocal, lastActiveAt }, xp }
TopicState  { status: not_started|in_progress|completed,
              currentQuestionId, completedQuestionIds[] }
```

Rule: **Stream C extends this record (adds `projects`), it does not fork a second user store.** One
identity, one record.

### 3.2 Catalog / content model  [DECIDED]

Questions live in `data/courses/{dsa,ds}/questions.json`, loaded server-only via
`web-app/lib/catalog.ts`. Types in `web-app/lib/types.ts`:

- `TrackSlug = "dsa" | "ds"` — **N-extensible**; never hardcode the count. New tracks = catalog data
  + track metadata + nav config only.
- `Topic { slug, track, step_no, sub_step_no, title, question_ids[] }`
- `Question { question_id, track, difficulty, question, test_cases?, structure?, starter_code?, ... }`
  — three shapes coexist: DSA coding (`structure` + stdin/stdout), DS function (`starter_code`),
  conceptual (no code, chat-only). Any consumer must handle all three.

**Projects are NOT modeled here** — they are not catalog content (§6).

### 3.3 Agent ↔ frontend SSE contract  [OPEN — owned by Stream A]

The browser consumes the agent through `POST /api/chat/stream` (SSE), parsed by
`web-app/lib/sse.ts`. The current `ChatEvent` union is the contract the frontend already speaks:

```
token        { content }          // appended text — first token = T3 latency marker
thinking     { content }          // reasoning / pre-token status
tool_start   { name, input? }
tool_end     { name, output? }
tool_chunk   { name, input? }
subagent_start / subagent_end { name }
done
error        { message }
credits      { remaining, isPaid } // appended by the Next proxy, not the agent
```

**Stream A must either preserve this union or evolve it here deliberately** (then update `sse.ts` +
`chat-panel.tsx`). The frontend already renders a thinking state (bouncing dots) to mask the
pre-first-token gap; keep emitting `thinking`/`tool_*` so that UX still works. Timing markers
(`t0_send … t3_first_token`) must keep flowing — they are how we measure the latency win.

### 3.4 Progress & completion semantics  [DECIDED]

- **Unit of completion = 1 question solved** (tests pass → `markComplete`). Not minutes, not lessons.
- Topic completes when all its `question_ids` are in `completedQuestionIds`; awards `+10 XP` once.
- **Streak threshold = 1 full question completed in a calendar day**; auto-freeze for 1–2 missed
  days/month (freeze logic deferred). [OPEN] day-boundary must become **local**, not UTC (bug §1).
- Endpoint `POST /api/user/progress` `{ action: "question_completed", track, topicSlug, questionId }`
  is idempotent; client dedups in-flight via `inflightRef`.

### 3.5 Projects ↔ User record  [OPEN — owned by Stream C]

Stream C adds one field to the User record (§3.1):

```
projects: Map<projectSlug, ProjectState>
ProjectState { status: in_progress|completed, startedAt, completedAt,
               certificateId?, logsUrl?, mode: assignment|tutoring }
```

This is the **only** contract C shares with the rest of v2. Everything else in C is its own service.

---

## 4. Stream A — Agent from scratch

**[DECIDED]** Build the tutoring agent from scratch in `agent/`. **No LangChain, no LangGraph, no DeepAgents.**
Reason: utmost control + crush the 2.5–3s first-token latency. A tutoring agent is a thin loop
around the LLM API with tool dispatch — keep it a loop, **not a homegrown framework.**

**Goals**
- Stream the first token immediately. Eliminate / defer / parallelize the 3 preliminary tool calls
  that currently block first token. Consider pre-warming the session on tutor page load.
- Preserve Socratic behavior. **Reuse the existing prompts/playbooks from `legacy/llm-app`** — rebuild the
  orchestration, not the pedagogy.
- Default to the **latest Claude model**; consult the `claude-api` skill before writing API code.

**Must honor**
- The SSE `ChatEvent` contract (§3.3) — or change it there first.
- Credit metering: the Next proxy checks/decrements credits and appends the `credits` event; the
  agent itself stays auth-agnostic.

**[OPEN] Runtime — the key decision (see §8.1):** Python/FastAPI in `agent/` vs
TypeScript inside the Next.js runtime (drops the Next→FastAPI proxy hop, directly helps latency).

**Tooling the agent needs:** read current question/context, (optionally) trigger/inspect a test run,
and progression tools (e.g. `mark_topic_complete`) consistent with §3.4. Phase 1 already proved out
agent progression tools — mine that for the tool set.

**Test plan:** golden-transcript checks for Socratic behavior; measure T0–T3 before/after to prove
the latency win; verify graceful handling of tool errors and credit exhaustion (402).

---

## 5. Stream B — Module selection → completion UX

**Scope:** the in-browser learning flow a student spends most of their time in:
`roadmap → pick track/module → topic → question → write code → run (WASM) → tests pass →
completion → streak/XP → advance to next question`, with AI mentor alongside.

**Reuses (already built):** catalog (§3.2), progress/completion (§3.4), WASM runtime, the
Linear-monochrome design system (`web-app/DESIGN.md`).

**Work items** (this absorbs the existing task list):
- **Verify the authenticated core loop end-to-end on the WASM path** (signed-in browser walkthrough).
  This is the definition of "functional." (Task #1)
- Confirm WASM output correctness across all three question schemas (§3.2). (Task #3)
- Fix the streak day-boundary (UTC → local). (Task #4)
- Refine module-selection UX: how a user picks a module, sees progress, and resumes
  ("continue where you left off"); completion + "next question" affordances; streak/XP feedback that
  stays "cold in chrome, warm in copy."

**Anti-scope (from archived product context):** no platform tour, no diagnostic quiz, no
conversational onboarding, no 5-min-session framing.

---

## 6. Stream C — Projects + MCP server

**[DECIDED] Model:** projects are a **local Claude Code experience**, not an in-browser one. They
are independent of DSA/DS. Flow:

1. Website **showcases** projects and **redirects** to each project's **own GitHub repo**
   (e.g. `byo-micrograd`). User clones/downloads it.
2. The repo ships `.claude/` config (commands like `/hint`, `/check`, `/next`) and connects to
   **our MCP server.**
3. The **MCP server authenticates** the user (links the local session to their Onlearn account) and
   **tracks progress** as they work.
4. On successful completion → **certificate.**
5. Throughout the project lifetime a **`logs.txt`** transcript (everything the user said + the agent
   responded) is captured and is **shareable.**
6. A project can run as an **assignment** or as **tutoring** (`mode` in §3.5).

**Components to build:**
- **Website surface** (in `web-app`): a projects listing/detail that links out to repos. Likely
  its own top-level section (`/projects`), not a DSA/DS track. Low complexity.
- **MCP server** (new service in the monorepo): auth, progress events, certificate issuance,
  `logs.txt` storage + sharing. Talks to the same Clerk + Mongo as the web app.
- **Project repo template:** `.claude/` commands + tests + MCP connection config; the reproducible
  skeleton every future project (there will be many) is cut from.
- **Certificate + logs sharing surface** (web app): view/share earned certs and completed-project
  transcripts. Shareable transcripts double as **indexable SEO content** (cross-link Stream D).

**Shares with the rest of v2:** only auth + the User record (§3.1 / §3.5). Nothing else.

**[OPEN] decisions — see §8.2–§8.5.** Auth mechanism, certificate integrity, logs capture source,
MCP server stack/location.

---

## 7. Stream D — SEO & smoothness

**Scope:** make the site discoverable and fast.
- **Landing page:** replace the stub with real pitch / features / pricing / proof.
- **SEO surfaces / redirects:** v1 has ranking MDX topic pages at `/learn/[slug]`; **v2 has none.**
  Cutover without SEO pages or 301 redirects **kills organic traffic** — highest risk item.
- **Crawlability:** sitemap, robots, OG, JSON-LD (deferred to here per the landing-page-state memory).
- **Mobile UX:** the 3-pane tutor needs a Problem/Chat/Code tab-switcher on small screens.
- **Performance:** Lighthouse 95+; roadmap nav <100ms; topic→first-question <300ms warm; honor the
  2.5–3s first-token floor (Stream A may improve it).

**Independent of A/B/C** — can start now. Cross-links to C via shareable project logs.

---

## 8. Open decisions (load-bearing — resolve before/early in each stream)

**8.1 Agent runtime (Stream A).** Python/FastAPI in `agent/` vs TypeScript-in-Next (drop the proxy
hop, better latency). _Recommendation:_ lean TS-in-Next for the latency win + code sharing, unless
`legacy/llm-app` has tooling that's expensive to port. **Unresolved.**

**8.2 MCP auth mechanism (Stream C).** MCP OAuth (slick: add server → Clerk login → server knows
the user; PostHog's MCP does this) vs personal token paste (simplest). _Recommendation:_ MCP OAuth,
token as fallback. **Unresolved.**

**8.3 Certificate integrity (Stream C).** Tests run on the user's machine, so completion is
self-reported and spoofable. Honor-system vs MCP server **re-runs/validates the final submission
server-side** before issuing the cert. _Recommendation:_ server-side verification, or the cert is
meaningless. **Unresolved.**

**8.4 `logs.txt` capture source (Stream C).** The MCP server sees only its own tool traffic, not the
full conversation. Capturing "everything said" needs a hook/command that reads the **local Claude
Code session transcript** (JSONL) and uploads it. Also needs **user consent** (storing + sharing the
transcript is PII). **Unresolved.**

**8.5 Projects website placement (Stream C).** Top-level `/projects` section vs modeling as an
N-extensible "track". _Recommendation:_ own section; projects are a different modality. **Unresolved.**

**8.6 Streak day-boundary (Stream B).** Source of the user's local day: client-sent offset vs stored
tz. **Unresolved (small).**

---

## 9. Sequencing & dependencies

1. **Lock §3 contracts** (this doc). Cheap, prevents the expensive divergence.
2. Then fan out:
   - **A → B in lockstep** (B consumes A's SSE; if A changes the contract, B follows).
   - **C and D in parallel from day one** (C touches only auth + User record; D touches nothing
     shared).
3. **Then** the deferred aspects (§10).

Minimum bar for "v2 is functional" (the immediate goal): Stream B's core loop verified end-to-end +
the agent (Stream A) streaming. Minimum bar for "retire v1" (cutover): + landing + SEO/redirects +
mobile + production Lighthouse pass.

---

## 10. Deferred — the "remaining aspects" (after the four streams)

- **PostHog instrumentation** (briefed; deferred until UI stable — no point instrumenting a layout
  about to change).
- **Dodo Payments live test** (wired; test against a real account last).
- **v1 cutover execution** (retire `web-app/` once parity + SEO continuity are met).
- **Mongo password rotation** at production.
- **Light mode** (post-launch).
- **Deferred by principle** (archived product context): social/leaderboards, spaced-repetition/mastery scoring —
  kept architecturally possible, not built.

---

## 11. Working model

- **One branch per stream** (§2). Clear file ownership; rebase on `v2` often to limit conflicts.
- Keep **`AGENTS.md`**, this architecture doc, and the relevant audit/design docs updated as
  decisions land. Across parallel sessions, these docs are the shared source of truth.
- Sole-author commits (no `Co-Authored-By`). Never push/force-push without asking. No `--no-verify`.
- No emojis in code or docs.
</content>
</invoke>
