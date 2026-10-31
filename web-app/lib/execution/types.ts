// Unified result + status model for code execution. As of 2026-06-07 the design
// is CLIENT-SIDE WASM ONLY -- Judge0 has been dropped (too heavy for the servers).
// Languages with no browser runtime today are "deferred", not shipped to a server.
//
// The status codes still mirror Judge0's numbering -- a convenient, familiar
// convention for "ran / compile-error / runtime-error / internal-error" that the
// existing UI already understands -- but nothing here calls Judge0.
//
// Research + rationale: CLIENT_SIDE_EXECUTION.md

/** Judge0-compatible status ids (numbering convention only; no Judge0 server is used). */
export const STATUS = {
  ACCEPTED: 3,
  COMPILATION_ERROR: 6,
  RUNTIME_ERROR: 11, // NZEC / non-zero exit
  INTERNAL_ERROR: 13,
  TIME_LIMIT_EXCEEDED: 5,
} as const;

export type StatusId = (typeof STATUS)[keyof typeof STATUS];

/** The single result shape every runtime returns. */
export type ExecResult = {
  stdout: string;
  stderr: string;
  /** Human-readable status, e.g. "Accepted", "Compilation Error". */
  status: string;
  /** Numeric status (Judge0 numbering convention). */
  status_id: number;
  /** Wall-clock seconds as a string, or null. */
  time: string | null;
  /** Process exit code (0 = success). */
  exit_code: number;
  /** Which runtime actually executed this, for telemetry/debugging. */
  ran_with?: string;
};

/** The seven requested languages + python; ids are stable registry keys. */
export type LanguageId =
  | "python"
  | "go"
  | "c"
  | "cpp"
  | "java"
  | "csharp"
  | "rust";

/**
 * Where the code runs.
 * - "wasm-client": a browser WASM runtime, on the user's machine, zero server cost.
 * - "deferred": no viable client runtime today; NOT shipped to a server (Judge0
 *   dropped). Disabled until a client runtime exists, or a lightweight sandbox is
 *   deliberately added later.
 */
export type ExecutionTier = "wasm-client" | "deferred";

/**
 * How a Tier-1 runtime works under the hood. Drives expectations about
 * download size, startup cost, and fidelity (see docs).
 */
export type RuntimeStrategy =
  | "interpreter-wasm" // Pyodide (CPython), Yaegi (Go)
  | "compiler-wasm" //    clang/lld (C/C++), Roslyn (C#)
  | "jvm-wasm" //         CheerpJ (Java)
  | "none"; //            no client option (Rust) -> deferred

/** How production-ready the client-side path is, today. */
export type RuntimeStatus =
  | "proven" //        in production somewhere / verified here
  | "viable" //        works, well-trodden, needs integration
  | "experimental" //  demoware / rough edges
  | "none"; //         no client-side option exists

export type LanguageConfig = {
  id: LanguageId;
  label: string;
  tier: ExecutionTier;
  strategy: RuntimeStrategy;
  status: RuntimeStatus;
  /** Name of the client-side runtime, if any (e.g. "Pyodide", "Yaegi"). */
  runtime: string | null;
  /**
   * If this language can't run client-side, the lightweight server runtime that
   * would handle it *if/when* deliberately added. Explicitly NOT Judge0.
   */
  serverFallback: "piston" | "wasi" | null;
  /** Rough one-time, cacheable download in MB for the Tier-1 asset(s). */
  approxDownloadMB: number | null;
  /** Licensing note -- load-bearing for a commercial SaaS (see CheerpJ). */
  license: string;
  /** Honest, terse engineering notes. */
  notes: string;
};
