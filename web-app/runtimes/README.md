# `runtimes/` - source for Tier-1 client-side WASM runtimes

These are the **buildable sources** for the "runs on the user's machine" code-execution
runtimes. They produce static WASM artifacts that land in `public/wasm/` and are loaded by the
Web Workers in `app/workers/`. Background, trade-offs, and the per-language verdict live in
[`../CLIENT_SIDE_EXECUTION.md`](../CLIENT_SIDE_EXECUTION.md).

The build steps need language toolchains (Go, .NET, Emscripten) that are **not** in the dev
sandbox where this was scaffolded - run them in CI or locally with the toolchain installed.

## `go/` - Go via Yaegi (interpreter → `js/wasm`)

```bash
cd runtimes/go
./build.sh           # needs Go 1.21+; emits public/wasm/go/{yaegi.wasm,wasm_exec.js}
```

Worker: [`../app/workers/go-yaegi.worker.ts`](../app/workers/go-yaegi.worker.ts).

## C / C++ - clang/LLVM → WASM (no source here)

No checked-in source: use [`@wasmer/sdk`](https://wasmer.io/posts/clang-in-browser)
(`npm i @wasmer/sdk`, pulls the prebuilt `clang` package from the Wasmer registry) or
[Emception](https://github.com/jprendes/emception) for full Emscripten fidelity. Needs
cross-origin isolation (COOP/COEP headers). Worker:
[`../app/workers/clang.worker.ts`](../app/workers/clang.worker.ts).

## C# - .NET runtime + Roslyn → WASM (recipe, not built here)

Stand up a small `dotnet wasm` / Blazor project that exposes a JS-interop `compileAndRun(src)`
using `CSharpCompilation` with `concurrentBuild = false`, then ship its `_framework` output to
`public/wasm/dotnet/`. Heaviest integration; see the doc.

## Java - CheerpJ (commercial; loaded from CDN, not built here)

CheerpJ is a `<script>`-loaded JVM, runs on the **main thread** (not a Worker), and is
**commercially licensed** for a SaaS. Kept on the Judge0 server tier by default - see the doc
and `lib/execution/registry.ts`.

## Rust - none

No client-side path (rustc + LLVM too large to ship). Stays on the Judge0 server tier.

---

## Verifying the model works

The Python (Pyodide) path is verified headlessly under Node - the same runtime the repo's
existing `app/workers/pyodide.worker.ts` uses:

```bash
npm i -D pyodide@0.27.7
node scripts/verify-execution.mjs
# -> [PASS] Python runs entirely client-side via WASM. Tier-1 model verified.
```
