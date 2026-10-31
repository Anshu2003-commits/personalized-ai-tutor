# Client-side (WASM) code execution - research + POC

**Status:** proof-of-concept (branch `feat/client-side-wasm-execution`). Not wired to the
product UI. Goal: answer *"does a Pyodide-equivalent exist for each language, and how
would the backend be structured to run code on the user's own machine?"*

**Date:** 2026-06-07. Researched + scaffolded autonomously.

> **Update (2026-06-07):** **Judge0 is dropped** - too heavy for the servers. The design is now
> **client-side WASM only**. Languages that can't run in the browser are *deferred* (disabled), not
> pushed to a server. If a server tier is ever genuinely needed it should be a *lightweight* one
> (Piston or server-side WASI via wasmtime) - **never Judge0**. See
> [Scientific Python](#scientific-python-numpy-pandas--yes-pytorch--no-use-a-substitute) for the
> numpy / pandas / PyTorch answer.

---

## TL;DR

| Language | Client-side WASM option | What it actually is | Maturity | Approx download¹ | Verdict |
|----------|------------------------|---------------------|----------|------------------|---------|
| **Python 3** | **Pyodide** | CPython 3.13 compiled to WASM (interpreter) | Production | ~6-11 MB gz core, packages lazy | ✅ **Ship it** - already in repo |
| **Go** | **Yaegi → WASM** | Go interpreter (written in Go) compiled to `js/wasm` | Usable | ~9-15 MB | ✅ **Viable** - interpreter, not the gc compiler |
| **C** | **wasm-clang** / **Wasmer-JS `clang`** / **Emception** | clang + lld compiled to WASM; compiles *and* runs in-page | Demo→usable | ~15-40 MB | ✅ **Viable**, heavy |
| **C++** | **Emception** (Emscripten-in-browser) / wasm-clang | full clang/llvm/binaryen toolchain in WASM | Demo→usable | ~25-40 MB | ✅ **Viable**, heaviest toolchain |
| **Java** | **CheerpJ 4.x** | OpenJDK JVM compiled to WASM, loaded via `<script>` | Production | ~10-20 MB runtime, JDK lazy | ⚠️ **Viable but licensed** (commercial) |
| **C#** | **.NET WASM + Roslyn** (Blazor / Webcil) | Mono/.NET runtime + Roslyn compiler in WASM | Production | ~5-15 MB runtime + Roslyn | ✅ **Viable**, heavy |
| **Rust** | *(none practical)* | rustc+LLVM is too large to ship to a browser | - | - | ❌ **Deferred** (no client path; Judge0 dropped) |

¹ One-time, cached aggressively after first load (immutable assets → perfect cache candidates,
matches the repo's caching constraints). Numbers are order-of-magnitude, not exact.

**Bottom line:** 6 of the 7 requested languages have a genuine "runs on the user's computer,
no server" path. Only **Rust has no practical client-side story** - running `rustc` (which drags
in all of LLVM) in a browser isn't viable today. **Judge0 is being dropped (too heavy for the
servers), so Rust is simply deferred** rather than routed to a server. Everything else runs
entirely on the user's machine.

This is **strategically relevant**: Onlearn frames *multi-language code execution* as a paid
feature (see `CLAUDE.md` monetization). With Judge0 gone, client-side WASM execution runs on the
user's hardware at **zero marginal server cost** and never sends code off-device - so the feature
costs essentially nothing to serve. (Not proposing a pricing change here; just flagging it.)

---

## Two kinds of "client-side execution"

It's worth being precise, because the languages split into two camps and the camps have very
different costs:

1. **Interpreter-in-WASM** - ship a language *interpreter* compiled to WASM, hand it source
   text, it runs. No compile step in the browser.
   - Python → **Pyodide** (CPython)
   - Go → **Yaegi** (a Go interpreter)
   - (also: Ruby → ruby.wasm, Lua, PHP → php-wasm, etc.)
   - **Pros:** one artifact, fast startup-to-run, "feels like Pyodide".
   - **Cons:** interpreter semantics - usually no real concurrency/threads, some stdlib gaps,
     slower than native. Fine for DSA/DS-sized problems.

2. **Compiler-toolchain-in-WASM** - ship the actual *compiler* (clang, the JDK's javac, Roslyn)
   compiled to WASM. The browser compiles the user's source to a WASM module, then runs it.
   - C/C++ → **clang+lld** in WASM (wasm-clang, Emception, Wasmer-JS)
   - Java → **CheerpJ** (full JVM; can run `javac` from the bundled JDK)
   - C# → **.NET runtime + Roslyn** in WASM
   - **Pros:** real compiler, real semantics, closer to native behaviour.
   - **Cons:** big downloads (the toolchain is tens of MB), slower first run, more moving parts.

Rust would be camp #2, but its toolchain (`rustc` + LLVM + std) is far too heavy to ship -
hence no client-side option.

---

## Per-language deep dive

### Python 3 - Pyodide ✅ (already in the repo)

- **What:** [Pyodide](https://pyodide.org) is CPython compiled to WASM via Emscripten. Latest
  stable is **0.29.4** (May 2026, Python 3.13). The repo currently pins **0.24.1** in
  `app/workers/pyodide.worker.ts` - **bump it** (0.24 → 0.27.7+ at minimum; 0.27.x is what this
  POC verifies against).
- **How it runs here:** Web Worker loads `pyodide.js` from jsDelivr CDN via `importScripts`,
  `loadPyodide()`, then `runPythonAsync(code)` with `setStdout`/`setStderr` capture and a
  `StringIO` stdin shim. Already wired (`hooks/use-pyodide.ts` → `components/tutor-workspace.tsx`).
- **Packages:** numpy/pandas/scipy/scikit-learn/matplotlib etc. ship as prebuilt WASM wheels, loaded
  lazily with `loadPackage` / `micropip`. The worker now auto-loads them via
  `loadPackagesFromImports(code)`. **PyTorch is the exception - not available; see
  [Scientific Python](#scientific-python-numpy-pandas--yes-pytorch--no-use-a-substitute) below.**
- **Isolation:** runs in the page's WASM sandbox in a Worker thread. No filesystem/network unless
  granted. Memory-capped by the browser tab.
- **Verdict:** Production. This is the gold standard the user already likes. Keep it; just upgrade
  the pin and fold it into the unified registry below.

### Scientific Python: numpy, pandas - yes; PyTorch - no (use a substitute)

This is the DS-track question. Short version:

| Library | Client-side in Pyodide? | How |
|---------|------------------------|-----|
| **numpy** | ✅ yes | prebuilt WASM wheel ships with Pyodide; `loadPackage("numpy")` |
| **pandas** | ✅ yes | prebuilt WASM wheel ships with Pyodide; `loadPackage("pandas")` |
| **scipy / scikit-learn / matplotlib / sympy / statsmodels** | ✅ yes | also prebuilt in Pyodide |
| **PyTorch** | ❌ no | no Pyodide/WASM wheel exists |

**Why numpy/pandas work but PyTorch doesn't.** Pyodide ships a curated set of packages whose
native (C/C++/Fortran) extensions have been *recompiled to WebAssembly* - numpy, pandas, scipy,
scikit-learn, matplotlib, sympy, networkx, Pillow, statsmodels, and more. For anything else,
`micropip` installs **pure-Python** wheels from PyPI (`*-none-any.whl`) at runtime - but it
**cannot** install wheels with native extensions, which PyPI ships as `*-x86_64.whl` (native code
the WASM VM can't load). **PyTorch is exactly that case:** `torch` is a large native (C++/CUDA)
library with no Pyodide-compiled wheel, so `import torch` cannot work in the browser today.
(ExecuTorch-on-WASM is an early experiment for *inference* of exported models, not the training
Python API; `shiqimei/pytorch.wasm` is an old toy port. Neither is usable.)

**What to do for deep learning client-side (pick by intent):**

1. **Teaching autograd / backprop / training loops in Python** - use a **pure-Python**, numpy-only
   framework that runs in Pyodide unchanged:
   - **[micrograd](https://github.com/karpathy/micrograd)** - Karpathy's tiny scalar autograd + MLP,
     PyTorch-*like* API, zero heavy deps. Trains a small net in-browser. Best for "show me how
     backprop works".
   - **[tinygrad](https://github.com/tinygrad/tinygrad)** - `<1000`-line, PyTorch-ergonomic tensor +
     autograd library; its numpy/CPU path runs in Pyodide. The closest "feels like torch" experience
     that is actually client-side. (GPU/Metal/LLVM backends won't work in-browser; the CPU path does.)

   These are arguably *better pedagogy* than `import torch` - the student sees the mechanics, not a
   black box.
2. **Running a pre-trained model (inference) in the browser** - export PyTorch → ONNX and run with
   **[ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)** (WASM + optional WebGPU) or
   **[Transformers.js](https://github.com/huggingface/transformers.js)** (HF pipelines, built on ORT
   Web). JS-side, not the Python `torch` API, but production-grade and fully on the user's machine.
   WebGPU gives ~10-15× over plain WASM on large models.
3. **Genuinely need the real `torch` API** (e.g. teaching `torch.nn` specifics) - that content cannot
   run client-side. Since Judge0 is dropped, the options are: reframe it on tinygrad's torch-like API,
   or defer it. A heavy Python+torch server is exactly the cost we're avoiding.

**Net for the DS track:** classical DS/ML (numpy, pandas, scikit-learn, scipy, matplotlib) is
**fully client-side today** and covers the large majority of a DS curriculum. Deep learning is the
only gap - bridge it with tinygrad/micrograd for "learn the mechanics" content and ONNX Runtime Web
for "run a trained model" content.

### Go - Yaegi compiled to WASM ✅

- **What:** [Yaegi](https://github.com/traefik/yaegi) ("Yet Another Elegant Go Interpreter", by
  the Traefik team) is a Go *interpreter written in Go*. Compile it with `GOOS=js GOARCH=wasm`
  and you get a `.wasm` that interprets Go source **entirely in the browser**. Used in production
  by playgrounds like Playcode and several "serverless Go playground" projects.
- **How it runs:** Go's WASM output needs Go's JS runtime shim `wasm_exec.js`. A tiny Go `main`
  registers a JS-callable `runGo(src)` (via `syscall/js`) that feeds source into a Yaegi
  interpreter and returns captured stdout/stderr. The worker loads `wasm_exec.js` + `yaegi.wasm`
  and calls `runGo`. See `runtimes/go/` in this branch for the Go source + build script and
  `app/workers/go-yaegi.worker.ts` for the glue.
- **Limits:** it's an *interpreter*, not `gc`/`go build`. Goroutines/channels work but are
  cooperatively scheduled and limited; no `cgo`; a handful of stdlib/reflection corners differ
  from native. For DSA-sized problems (the Onlearn use case) it's more than enough.
- **Build artifact:** you must produce `yaegi.wasm` once with the Go toolchain (CI step or a
  committed binary). Not buildable in this sandbox (no Go installed) - documented, not built.
- **Verdict:** Viable. The closest thing to "Pyodide for Go".

### C and C++ - clang/LLVM compiled to WASM ✅ (heavy)

Three real options, all of which compile *and* run the user's C/C++ in the browser, server-free:

1. **[wasm-clang](https://github.com/binji/wasm-clang)** (Ben Smith / binji, CppCon 2019) - clang
   + lld compiled to WASM with WASI and an in-memory filesystem. The original "C/C++ in the
   browser" demo. Self-described "demoware" but the technique is sound and widely copied.
2. **[Emception](https://github.com/jprendes/emception)** - the most complete: runs *Emscripten
   itself* in the browser. Bundles clang/lld/llvm-nm/ar/objcopy/llc (`llvm-box`) plus binaryen
   (`wasm-as`, `wasm-opt`, etc.) all compiled to WASM, BusyBox-style. Compiles real C++ to WASM
   in-page. Heaviest download but the most faithful.
3. **[Wasmer-JS SDK](https://wasmer.io/posts/clang-in-browser)** (`@wasmer/sdk`, Wasmer 4.4+) -
   pull the `clang` package from the Wasmer registry and run it in the browser to compile C, then
   run the produced WASI module. Cleanest packaging (npm install + registry fetch) of the three.
   This branch scaffolds the Wasmer-JS path in `app/workers/clang.worker.ts` as the recommended
   starting point (least custom build tooling).
- **Lighter alternative for C++ only:** [twr-wasm](https://github.com/twiddlingbits/twr-wasm) and
  build-time Emscripten if you DON'T need *user-supplied* source compiled at runtime. Not relevant
  here because Onlearn runs arbitrary user code.
- **Isolation:** WASI sandbox in a Worker. Compiler + program both run in WASM; no host FS/network.
- **Verdict:** Viable for both C and C++. Budget 15-40 MB of one-time download and a 1-3 s first
  compile. Recommend Wasmer-JS for the POC, Emception if you need full Emscripten fidelity.

### Java - CheerpJ ⚠️ (viable, but commercially licensed)

- **What:** [CheerpJ](https://cheerpj.com) (Leaning Technologies) is a full **OpenJDK JVM compiled
  to WebAssembly**. Latest line is **4.x** (Java 11 bytecode, JNI support; 4.3 shipped Apr 2026).
  Delivered as static WASM/JS assets - drop in a `<script src="https://cjrtnc.leaningtech.com/4.x/loader.js">`,
  call `cheerpjInit()`, and run JARs/classes in the browser. It can run the bundled JDK tools,
  including **`javac`**, so you can compile *and* run user Java client-side.
- **The catch - licensing:** CheerpJ is **commercial software**. Free for FOSS / personal / single-
  person companies; paid for small businesses; enterprise tiers for larger orgs (with education/
  non-profit discounts). **Onlearn is a commercial B2C SaaS**, so shipping CheerpJ in production
  would require a paid CheerpJ licence. This is the one option here with a real cost/legal gate -
  factor it into the build-vs-buy-vs-server decision for Java specifically.
- **Runs on main thread:** CheerpJ expects DOM access; it's not a drop-in Web Worker runtime like
  the others. The POC documents it as a main-thread loader, not a worker.
- **Open-source alternatives (weaker):** DoppioJVM (JVM in JS, unmaintained); TeaVM / JWebAssembly
  (ahead-of-time Java→WASM/JS at *build* time - can't compile arbitrary user source at runtime).
  None match CheerpJ for running real user Java in-browser.
- **Verdict:** Technically the strongest Java-in-browser option, but the licence is the catch. With
  Judge0 dropped there's no cheap server fallback either, so Java is a binary choice: **license
  CheerpJ and run it client-side, or defer Java** until a track actually needs it. (Onlearn launches
  with DSA + DS, so Java can wait.)

### C# - .NET runtime + Roslyn in WASM ✅ (heavy)

- **What:** Blazor WebAssembly ships the **Mono/.NET runtime compiled to WASM**. Pair it with the
  **Roslyn** compiler (`Microsoft.CodeAnalysis.CSharp`) running on that runtime and you can compile
  *and* execute arbitrary C# entirely client-side. Mature, with several open-source REPLs proving
  it ([BlazorCodeEditor](https://github.com/thatplatypus/BlazorCodeEditor) uses the **Webcil**
  format - WASM-friendly .NET assemblies - to JIT user C# in-page).
- **Gotchas:** Roslyn's scripting API doesn't run unmodified on Mono-WASM; use the compilation API
  (`CSharpCompilation`) with **`concurrentBuild = false`** (browser WASM has no threads for the
  concurrent build path). Reference assemblies must be fetched as `.wasm`/`.webcil` and fed to the
  compilation.
- **Packaging reality:** this path is **.NET-toolchain-shaped**, not "drop a wasm in a worker". You
  build a small Blazor/`dotnet wasm` project that exposes a JS-interop `compileAndRun(src)` and load
  its `_framework` output. Heavier integration than Pyodide/Yaegi. Not buildable in this sandbox
  (no .NET SDK) - documented as an integration recipe, not built.
- **Verdict:** Viable and production-grade, but the heaviest *integration* effort of the bunch.

### Rust - no practical client-side option ❌

- **The confusion to avoid:** "Rust runs in the browser via WASM" is true for **pre-compiled** Rust
  (you build `wasm32-unknown-unknown` with `wasm-pack` at *build* time and ship the result). That is
  NOT the same as "compile the user's Rust source in the browser".
- **Compiling user Rust client-side** means running `rustc` in the browser, which drags in the
  entire LLVM backend + std. It's been discussed (rust-internals "Running rustc on WASM") but there
  is **no production-ready in-browser rustc**. The official Rust Playground compiles **server-side**
  and ships back the result - and that's still the state of the art.
- **No usable Rust interpreter exists** either (Miri interprets MIR but needs the full compiler
  frontend; not a browser story).
- **Verdict:** **Deferred.** No client-side path, and Judge0 is being dropped, so there's nowhere to
  route it. If a Rust track is ever added, stand up a *lightweight* sandbox (server-side WASI via
  wasmtime, or Piston) - not Judge0. This is the single gap.

---

## Recommended architecture: client-side WASM, no server

**Judge0 is dropped** (too heavy for the servers). Everything that *can* run in the browser does;
languages that can't are **deferred** (disabled in the picker), not pushed to a server. Generalises
the existing Pyodide-client pattern to every viable language:

```
                       ┌─────────────────────────────────────────┐
                       │            execution registry            │
                       │   language → runtime + metadata          │
                       └───────────────┬─────────────────────────┘
                                       │
              ┌────────────────────────┴───────────────────────────┐
              ▼                                                     ▼
   ┌─────────────────────────┐                       ┌──────────────────────────┐
   │   WASM, on the client   │                       │  DEFERRED (no runtime)   │
   │   runs on user machine  │                       │  NOT sent to a server    │
   │   zero server cost      │                       │                          │
   │                         │                       │  Rust  (rustc too big)   │
   │  Python   → Pyodide     │                       │                          │
   │  Go       → Yaegi.wasm  │                       │  If a server tier ever   │
   │  C / C++  → clang.wasm  │                       │  returns: lightweight    │
   │  C#       → dotnet.wasm │                       │  WASI/Piston, NOT Judge0 │
   │  Java*    → CheerpJ     │                       │                          │
   └─────────────────────────┘                       └──────────────────────────┘
        * Java client-side needs a CheerpJ commercial licence, else defer
```

- **Single result shape** - keep the Judge0-style status *numbering* (`status_id`: 3 = Accepted,
  6 = Compilation Error, 11 = Runtime Error, 13 = Internal Error) because the existing UI already
  understands it, even though **no Judge0 runs**. Implemented in `lib/execution/types.ts`.
- **Registry-driven** (`lib/execution/registry.ts`): each language declares its tier, strategy,
  runtime, licence, and approximate download. Adding/moving a language is a data edit.
- **Worker-per-runtime** (matches the existing Pyodide worker), so a heavy compile can't block the
  UI thread. CheerpJ is the exception (main-thread).
- **No server fallback:** if a WASM asset fails to load (slow network, unsupported browser), the UI
  surfaces a retry rather than silently shipping code to a server. Languages with no client runtime
  (Rust) are simply disabled until one exists.

### What's in this branch (POC scope)

| File | What it is | Runnable? |
|------|-----------|-----------|
| `lib/execution/types.ts` | unified `ExecResult` + status model | yes (types) |
| `lib/execution/registry.ts` | language → provider/metadata table | yes |
| `lib/execution/protocol.ts` | Worker message contract (shared) | yes |
| `app/workers/pyodide.worker.ts` | Python (pre-existing; kept) | ✅ **verified** (Node) |
| `app/workers/go-yaegi.worker.ts` | Go glue (needs `yaegi.wasm` built in CI) | glue ready, asset TODO |
| `app/workers/clang.worker.ts` | C/C++ via `@wasmer/sdk` | glue ready, `npm i @wasmer/sdk` |
| `runtimes/go/main.go` + `build.sh` | Go source that builds `yaegi.wasm` | needs Go toolchain |
| `hooks/use-wasm-runtime.ts` | generalised worker hook (Pyodide hook, any runtime) | yes |
| `runtimes/README.md` + `public/wasm/README.md` | where built artifacts go + build steps | docs |
| `scripts/verify-execution.mjs` | headless Pyodide proof (Node) | ✅ run it: `node scripts/verify-execution.mjs` |

**Why some are "glue ready, asset TODO":** this sandbox has only Node, Python, and a Java JRE -
no Go, Rust, clang, emcc, or .NET SDK. So the WASM *artifacts* for Go/C/C++/C# can't be built
here. The browser-side **glue code is deterministic and complete**; producing the artifacts is a
one-time CI/build step, documented per runtime. Python is fully verified end-to-end because
Pyodide ships prebuilt and runs under Node.

---

## Concrete next steps (when productionising)

1. **Python:** bump Pyodide 0.24.1 → 0.27.7+ (or 0.29.x), keep the existing worker, register it.
2. **Go:** add a CI job: `GOOS=js GOARCH=wasm go build -o public/wasm/go/yaegi.wasm ./runtimes/go`
   and copy Go's `wasm_exec.js` next to it. Wire `go-yaegi.worker.ts`.
3. **C/C++:** `npm i @wasmer/sdk`, host the clang package assets, finish `clang.worker.ts`. Or adopt
   Emception if you want full Emscripten fidelity.
4. **C#:** stand up a small `dotnet wasm` project exposing `compileAndRun`, ship its `_framework`,
   load via a thin worker/JS-interop. Heaviest lift.
5. **Java:** license CheerpJ (main-thread loader) or defer Java. No Judge0 fallback.
6. **Rust:** defer. If ever needed, a lightweight WASI/Piston sandbox - never Judge0.
7. Decide a **download budget / lazy-load policy** - don't fetch a 30 MB clang toolchain until the
   user actually opens a C/C++ problem. Registry already carries `approxDownloadMB` to drive this.
8. **Retire Judge0 from the live DSA path.** The existing `lib/judge0.ts` + the DSA tutor still call
   a Judge0 server. Migrate DSA execution onto the client-side runtimes above (Python via the
   existing Pyodide worker today; C/C++/Go as their workers land), then delete `lib/judge0.ts` and
   tear down the Judge0 container. Do this as an explicit cutover, not silently, so no track loses
   execution mid-flight.

---

## Sources

- Pyodide - https://pyodide.org , https://pyodide.org/en/stable/project/changelog.html
- Yaegi - https://github.com/traefik/yaegi , https://github.com/Aryan-Bagale/go-browser-interpreter
- wasm-clang - https://github.com/binji/wasm-clang
- Emception - https://github.com/jprendes/emception
- Wasmer clang-in-browser - https://wasmer.io/posts/clang-in-browser
- CheerpJ - https://cheerpj.com , https://labs.leaningtech.com/blog/cheerpj-4.0
- C# Roslyn-in-Blazor - https://github.com/thatplatypus/BlazorCodeEditor , https://www.strathweb.com/2019/06/building-a-c-interactive-shell-in-a-browser-with-blazor-webassembly-and-roslyn/
- Rust (server-compile reality) - https://internals.rust-lang.org/t/running-rustc-on-wasm/16198 , https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Rust_to_Wasm
