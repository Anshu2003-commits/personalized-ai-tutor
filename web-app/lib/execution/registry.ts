// The single source of truth mapping each language to HOW it executes.
//
// Adding a language, moving it between tiers, or swapping its runtime is a data
// edit here -- nothing else in the execution layer hardcodes a language.
//
// DESIGN (2026-06-07): client-side WASM ONLY. Judge0 was dropped -- too heavy for
// the servers. Languages with no browser runtime today are "deferred" (disabled),
// NOT shipped to a server. `serverFallback` only names the *lightweight* runtime
// (Piston / server-side WASI) we'd reach for if a server tier is ever deliberately
// re-introduced -- never Judge0.
//
// Research, bundle sizes, and licensing rationale: CLIENT_SIDE_EXECUTION.md

import type { LanguageConfig, LanguageId } from "./types";

export const LANGUAGES: Record<LanguageId, LanguageConfig> = {
  python: {
    id: "python",
    label: "Python 3",
    tier: "wasm-client",
    strategy: "interpreter-wasm",
    status: "proven",
    runtime: "Pyodide (CPython 3.13 -> WASM)",
    serverFallback: null,
    approxDownloadMB: 11,
    license: "MPL-2.0 / Apache-2.0 (free, commercial-OK)",
    notes:
      "Already in the repo. Bump pin 0.24.1 -> 0.27.7+. Scientific stack (numpy, pandas, " +
      "scipy, scikit-learn, matplotlib) lazy-loads as prebuilt WASM wheels. PyTorch is NOT " +
      "available -- see CLIENT_SIDE_EXECUTION.md (use tinygrad/micrograd or ONNX Runtime Web).",
  },

  go: {
    id: "go",
    label: "Go",
    tier: "wasm-client",
    strategy: "interpreter-wasm",
    status: "viable",
    runtime: "Yaegi (Go interpreter -> js/wasm)",
    serverFallback: null,
    approxDownloadMB: 13,
    license: "Apache-2.0 (free, commercial-OK)",
    notes:
      "Interpreter, not `go build`. Goroutines limited, no cgo. Build yaegi.wasm once in CI " +
      "(GOOS=js GOARCH=wasm). Glue: app/workers/go-yaegi.worker.ts.",
  },

  c: {
    id: "c",
    label: "C",
    tier: "wasm-client",
    strategy: "compiler-wasm",
    status: "viable",
    runtime: "clang+lld -> WASM (Wasmer-JS / wasm-clang)",
    serverFallback: null,
    approxDownloadMB: 20,
    license: "Apache-2.0 w/ LLVM exceptions (free, commercial-OK)",
    notes:
      "Compiles AND runs user C in-page via WASI. Recommend @wasmer/sdk clang package. " +
      "Glue: app/workers/clang.worker.ts.",
  },

  cpp: {
    id: "cpp",
    label: "C++",
    tier: "wasm-client",
    strategy: "compiler-wasm",
    status: "viable",
    runtime: "Emscripten/clang -> WASM (Emception / wasm-clang)",
    serverFallback: null,
    approxDownloadMB: 35,
    license: "Apache-2.0 w/ LLVM exceptions / MIT (free, commercial-OK)",
    notes:
      "Heaviest toolchain. Emception = full Emscripten-in-browser for best fidelity; " +
      "Wasmer-JS clang for simplest packaging. Shares clang.worker.ts.",
  },

  java: {
    id: "java",
    label: "Java",
    // Technically client-side (CheerpJ), but gated by a COMMERCIAL licence for a
    // SaaS. With Judge0 dropped, the choice is: license CheerpJ, or defer Java.
    tier: "wasm-client",
    strategy: "jvm-wasm",
    status: "viable",
    runtime: "CheerpJ 4.x (OpenJDK JVM -> WASM)",
    serverFallback: null,
    approxDownloadMB: 18,
    license:
      "COMMERCIAL (CheerpJ). Free for FOSS/personal/1-person cos; PAID for SaaS. <-- license or defer",
    notes:
      "Strongest Java-in-browser tech, but licensed. Runs on the MAIN thread (needs DOM), not a " +
      "Worker. No Judge0 fallback any more: license CheerpJ or defer Java until launch needs it.",
  },

  csharp: {
    id: "csharp",
    label: "C#",
    tier: "wasm-client",
    strategy: "compiler-wasm",
    status: "viable",
    runtime: ".NET runtime + Roslyn -> WASM (Blazor/Webcil)",
    serverFallback: null,
    approxDownloadMB: 15,
    license: "MIT (free, commercial-OK)",
    notes:
      "Roslyn (concurrentBuild=false) on the Mono/.NET WASM runtime. Heaviest INTEGRATION: " +
      "needs a small `dotnet wasm` project exposing compileAndRun(). No npm-only path.",
  },

  rust: {
    id: "rust",
    label: "Rust",
    tier: "deferred",
    strategy: "none",
    status: "none",
    runtime: null,
    // If a Rust track is ever added, reach for a LIGHTWEIGHT sandbox, not Judge0.
    serverFallback: "wasi",
    approxDownloadMB: null,
    license: "n/a",
    notes:
      "NO practical client-side option: rustc+LLVM too large to ship; no usable interpreter. " +
      "Judge0 dropped -- so Rust is DEFERRED. If added later, use a lightweight WASI sandbox " +
      "(wasmtime) or Piston, never Judge0.",
  },
};

/** Languages that genuinely run client-side today (Tier 1). */
export function clientSideLanguages(): LanguageConfig[] {
  return Object.values(LANGUAGES).filter((l) => l.tier === "wasm-client");
}

/** Languages with no client runtime today -- disabled until one exists. */
export function deferredLanguages(): LanguageConfig[] {
  return Object.values(LANGUAGES).filter((l) => l.tier === "deferred");
}

/** Resolve where a language runs. Deferred languages have no execution path yet. */
export function resolveTier(id: LanguageId): {
  tier: LanguageConfig["tier"];
  serverFallback: LanguageConfig["serverFallback"];
} {
  const cfg = LANGUAGES[id];
  return { tier: cfg.tier, serverFallback: cfg.serverFallback };
}
