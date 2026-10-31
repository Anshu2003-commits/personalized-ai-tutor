# `public/wasm/` - built Tier-1 runtime artifacts (served statically)

These are large, immutable, prebuilt WASM artifacts loaded by the workers in `app/workers/`.
They are **build outputs**, produced from `../../runtimes/` (or fetched from a CDN/registry),
and are intentionally **not committed** - generate them in CI. Cache them hard (immutable).

Expected layout once built:

```
public/wasm/
  go/
    yaegi.wasm      <- runtimes/go/build.sh  (GOOS=js GOARCH=wasm)
    wasm_exec.js    <- copied from $(go env GOROOT)/lib/wasm/wasm_exec.js
  dotnet/           <- C#: _framework output from a `dotnet wasm` project (optional)
  clang/            <- C/C++: only if self-hosting Wasmer/Emception assets
```

Python (Pyodide) is loaded from the jsDelivr CDN by `app/workers/pyodide.worker.ts`, so it
needs nothing here. See `../../CLIENT_SIDE_EXECUTION.md`.
