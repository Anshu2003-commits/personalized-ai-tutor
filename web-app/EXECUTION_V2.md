# Execution v2 - multi-language, learner-first I/O contract

The target architecture for running learner code in any language **correctly** and
**without making the learner deal with I/O**. Supersedes the ad-hoc judging in
`tutor-workspace.tsx`. Companion to [`CLIENT_SIDE_EXECUTION.md`](./CLIENT_SIDE_EXECUTION.md)
(which runtime per language) - this doc is about *what the learner writes* and
*how we decide they're right*.

## Principles

1. **The learner edits a function body and `return`s the answer.** No `input()`,
   no `print`, no parsing, no output formatting - ever (in `function` mode).
2. **Judge values, not text.** Output is compared by structured value, so
   whitespace/bracket/format differences across languages don't matter.
3. **Per-language behavior lives behind one adapter**, not scattered in the UI.

## Two I/O modes (per problem)

- **`function` (default, ~95%)** - hidden driver reads inputs, calls the
  learner's function, serializes the return value. Learner sees only the
  signature + body. Driver shown read-only on demand ("▸ show driver code").
- **`stdio` (escape hatch)** - the problem *is* the I/O (read N lines, print a
  formatted report). Learner reads stdin / writes stdout. Used only where the
  structured `output_field` doesn't capture the task.

The presence of a clean `structure.output_fields` selects `function` mode.

## Canonical serialization (display **and** judging)

One form per type, used identically for "Expected", "Your output", and the
structured comparison:

| Type | Canonical form |
|---|---|
| `int` / `float` | `42` / `3.14` (floats: 6 sig figs) |
| `bool` | `true` / `false` |
| `string` | the string (quoted when nested in a list/object) |
| `list<T>` | `[1, 2, 3]` |
| `list<list<T>>` | `[[1, 2], [3, 4]]` |
| `ListNode` | `[1, 2, 3]` (array form) |
| `TreeNode` | `[1, 2, null, 3]` (level-order, `null` for gaps) |
| `null` / `None` | `null` |

The console shows **parsed, named** values, not raw streams:

```
Input:       nums = [2, 7, 11, 15], target = 9
Expected:    [0, 1]
Your output: [0, 1]   ✓
```

## Judging rule (`lib/execution/judge.ts`)

```
judge(actual, expected):
  a, e = parseValue(actual), parseValue(expected)   # JSON OR Python-repr OR space-sep nums
  if both structural (number/bool/null/array/object):  deepEqual(a, e, floatTol=1e-6)
  else:                                                exact trimmed-text compare
```

`parseValue` accepts JSON (`[1,2]`, `true`), Python-repr (`[1, 2]`, `True`,
`'x'`), Python's `print(*list)` space-separated numbers (`1 2 3`), and values
that arrive already-parsed from the catalog (array/bool/int). Strings are always
compared as text (never coerced to a structural match). This makes every
language's structured output judge correctly and removes the `.trim()` crash on
the ~53 catalog questions whose `expected_output` is a non-string.

## Locked decisions

- **A.** `function` mode + **hidden** driver is the default.
- **B.** `void`/in-place problems are **re-modeled to return** the mutated
  structure (uniform "always return the answer").
- **C.** Floats: compare with tolerance **1e-6**, display **6 sig figs**.
- **D.** `ListNode` = array form; `TreeNode` = level-order with `null`.

## Per-language runtime adapter (target)

```ts
interface LanguageRuntime {
  id; label; runtimeKind; tracks;
  capabilities: { needsCrossOriginIsolation; kind: "interpreter" | "compiler" };
  assets: { url; approxMB }[];
  boilerplate(structure): string;
  prepareProgram(source, testInput, problem): { program; stdin; meta };  // owns DSA/DS/clang specifics
  classifyError?(raw): string;
}
```

Availability is **derived**, not a manual flag:
`available = assetsPresent && (!needsCrossOriginIsolation || crossOriginIsolated)`.
Default to single-threaded runtimes so no COOP/COEP is needed (which would break
the CDN-loaded Pyodide + Clerk).

## Phases

1. ✅ **Value contract + structural judge.** Pure correctness; fixes the
   format-parity + non-string-crash bugs. `lib/execution/{value,judge}.ts`.
2. ✅ **Function/return model + hidden driver + adapter.** `generateStub` +
   `generateDriver` (Python/JS), `lib/execution/{io,program,editor-languages}.ts`;
   the editor shows only the function, the driver does I/O + canonical
   serialization (incl. ListNode/TreeNode). `void`/in-place stays stdio mode.
3. ✅ **JavaScript** - runs client-side with zero deps (`js-runtime.ts` +
   `app/workers/js.worker.ts`); proves the adapter end-to-end.
4. ✅ **Go** - `yaegi.wasm` built + committed (`public/wasm/go/`), `runnable:
   true`. Runs in stdio mode via `fmt.Scan` (yaegi doesn't wire
   `bufio.NewReader(os.Stdin)`); `runtimes/go/main.go` evaluates the source once
   (yaegi auto-runs `main`). Verified headlessly under Node (verify:driver runs
   real programs through the wasm). Single-threaded → no isolation.
5. ◧ **C/C++** - C++ **function-mode driver done and verified with g++**
   (scripts/verify-driver). Runtime = single-threaded clang (binji/wasm-clang,
   no isolation); `clang.worker.ts` is a scaffold. Remaining: add the clang-wasm
   assets + wire the binji glue + browser-verify, then flip `cpp.runnable`.
   C stays stdio mode.
6. ◻ **C# / R / Java …** - add a descriptor + worker per language as demand
   dictates (Java gated on a CheerpJ license).

Verification: `npm run verify:judge` (judge over the catalog), `verify:driver`
(Python via python3 + JS via Node + **C++ via g++** end-to-end over the catalog),
`verify:boilerplate` (stubs for every language). All green.

## Enabling a gated language (runbook)

Each gated language is one asset/dep + one flag away. The UI, starter code,
highlighting, drafts, and gating already work for it today.

### Go - DONE
`public/wasm/go/{yaegi.wasm,wasm_exec.js}` are built (Go 1.22 + yaegi v0.16.1)
and committed; `go.runnable: true`. Verified headlessly (`npm run verify:driver`
runs generated programs through the wasm). To rebuild: `cd web-app/runtimes/go &&
./build.sh` (Go 1.21+). Notes:
- Size: 36 MB raw, ~7.6 MB gzipped (the one-time, cached wire transfer). To
  shrink, give yaegi a trimmed stdlib subset instead of all of `stdlib.Symbols`.
- Consider Git LFS for the `.wasm`, or build it in a `FROM golang` CI/Docker
  stage and gitignore it, if the raw blob in history becomes a concern.
- Go runs in **stdio mode** (`fmt.Scan`). For canonical-output function mode,
  add a Go branch to `generateStub`/`generateDriver` (verify with a Go toolchain).

### C / C++
Runtime chosen: **single-threaded `binji/wasm-clang`** (no threads → no
SharedArrayBuffer → no COOP/COEP, so Pyodide/Clerk are untouched). Already done:
the C++ **function-mode driver** (`generateStub`/`generateDriver` for cpp) is
written and **verified end-to-end with native g++** (`npm run verify:driver`),
`cpp.functionMode: true`, `needsCrossOriginIsolation: false`. `clang.worker.ts`
is a documented scaffold with the integration points marked. Remaining:
1. Produce/host the single-threaded clang-wasm assets in `public/wasm/clang/`
   (clang.wasm, lld.wasm, a WASI sysroot).
2. Wire the binji glue in `clang.worker.ts` (load on INIT; compile main.cpp with
   `-std=c++17`; run via WASI piping stdin) and **verify in a browser**.
3. Flip `cpp.runnable: true` (and `c.runnable` - C runs in stdio mode).

### C# / R / Java / Ruby / SQL …
Add a descriptor to `EDITOR_LANGUAGES`, a `*.worker.ts` speaking
`protocol.ts`, a `RuntimeKind`, and (for function mode) a `generateDriver`
branch. Java/JVM additionally gate on a CheerpJ license. See
`CLIENT_SIDE_EXECUTION.md` for per-language runtime choices.
