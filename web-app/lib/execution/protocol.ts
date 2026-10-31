// Shared message contract between the main thread and every Tier-1 WASM Worker.
// All runtime workers (pyodide, yaegi-go, clang, ...) speak this protocol so the
// singleton runtime manager (lib/execution/runtime-manager.ts) can drive any of
// them through one hook (hooks/use-runtime.ts).
//
// See CLIENT_SIDE_EXECUTION.md for the architecture.

import type { ExecResult } from "./types";

/** main -> worker */
export type WorkerRequest =
  | { type: "INIT"; id: string }
  | { type: "RUN"; id: string; code: string; stdin: string };

/** worker -> main */
export type WorkerResponse =
  | { type: "INIT_DONE"; id: string }
  | { type: "RUN_RESULT"; id: string; result: ExecResult }
  | { type: "ERROR"; id: string; error: string };

/** Standard "something blew up before we could run" result. */
export function internalError(message: string, ran_with?: string): ExecResult {
  return {
    stdout: "",
    stderr: message,
    status: "Internal Error",
    status_id: 13,
    time: null,
    exit_code: 1,
    ran_with,
  };
}
