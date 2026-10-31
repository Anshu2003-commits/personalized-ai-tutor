# Onlearn Tutor Flow TODO

## STATUS — Multi-language + starter-code logic (2026-06-18)

Shipped in `web-app/`: a functional multi-language editor (Python runs today;
C/C++/Go are selectable, editable, syntax-highlighted, and persisted, with
execution gated until their runtimes' assets land), plus per-language starter
code generated from each DSA question's `structure`.

### What landed

- **Per-language starter code** — `lib/boilerplate.ts` now generates idiomatic
  stubs (signature + stdin/stdout harness) for Python / C++ / C / Go / Java from
  the catalog `FunctionSignature`. Python output is byte-identical to before.
  ListNode/TreeNode get standard struct defs injected. Verified over the real
  catalog: `npm run verify:boilerplate` → 2115/2115 stubs, 0 failures.
- **Runtime layer** — `lib/execution/runtime-manager.ts` (singleton worker per
  family, booted once per tab) + `hooks/use-runtime.ts`. Replaces and removes
  the old `use-pyodide.ts` / `use-wasm-runtime.ts` (one mechanism now).
- **Language registry** — `lib/execution/editor-languages.ts`: language → runtime
  kind + boilerplate + CodeMirror mode + `runnable` flag + per-track offering
  (DS = Python only; DSA = Python/C++/C/Go).
- **Editor** — `components/code-editor.tsx` takes a `language` prop (CodeMirror
  cpp/go/python modes). Functional language menu in `tutor-workspace.tsx`;
  selection persists across questions via localStorage.
- **Per-language drafts** — `language` added to the draft model (new unique index
  `{clerkId, questionId, language}`; legacy index reconciled at runtime via
  `syncIndexes()`), threaded through `lib/draft.ts`, the route, and `use-draft.ts`.
  Switching language remounts the keyed workspace → isolated draft per language.

### Gated (cannot run in this dev env — wired, not executing)

- **C/C++** — needs `npm i @wasmer/sdk` + cross-origin isolation (COOP/COEP)
  headers. `clang.worker.ts` import is marked `turbopackIgnore` so the build is
  green while the dep is absent. COOP/COEP intentionally NOT enabled globally
  (would break the Pyodide CDN load + Clerk) — scope it when enabling C/C++.
- **Go** — needs the CI-built `public/wasm/go/{yaegi.wasm,wasm_exec.js}` (see
  `runtimes/go/build.sh`; no Go toolchain here).
- To turn a language on: build/install its assets, then flip `runnable: true`
  in `editor-languages.ts` (and drop the ignore hints for C/C++).

### Verified

- `npx tsc --noEmit` clean · `eslint` clean · `next build` green ·
  `npm run verify:boilerplate` 0 failures.

### Not done / deferred

- Java / C# / Rust selection (licensed / heavy-integration / no client path —
  see `lib/execution/registry.ts`). Java boilerplate exists in the generator.
- Output-format parity for non-Python Submit (expected outputs are Python-`print`
  formatted; the generated harness reads input + calls the fn but leaves exact
  output formatting to the learner — same best-effort level as the Python stub).

## STATUS — AI Tutor Memory Foundation (2026-06-26)

Good enough for testing now:

- Stable Clerk-backed tutor identity is forwarded as `clerk:${userId}`.
- Long-term memory is stored in SQLite as one markdown blob per user.
- Memory sections are fixed: `## Misconceptions`, `## Preferences`, `## Progress`.
- Tutor prompt can receive the memory block as untrusted context.
- Post-turn memory reflection runs in the background.
- Memory compaction has size/bullet caps and hysteresis to avoid repeated calls.
- Covered by focused `llm-app` tests.

Future follow-ups:

- Verify memory end-to-end with real OpenAI calls.
- Tune the memory reflection and consolidation prompts from real conversations.
- Add a simple admin/debug view or endpoint to inspect a user's memory blob.
- Add a manual reset/delete memory endpoint.
- Improve the reflection gate so it only runs for useful learning signals.
- Cap or periodically clear the in-process `_turn_counts` map.
- Revisit structured per-concept memory or embeddings only if the blob approach
  becomes too large or too hard to retrieve from.
