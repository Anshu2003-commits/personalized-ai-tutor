// Pure JavaScript execution core - shared by the JS worker and the Node-based
// verifier (scripts/verify-driver.mjs). No browser/Worker APIs here so it runs
// identically in both. JS is the one language that needs no WASM and no
// cross-origin isolation: it's the browser's native runtime.
//
// The program (function-mode: driver prefix + learner function + driver suffix)
// is run via `new Function` with stdin and a capturing console injected.

import type { ExecResult } from "./types";

function fmt(arg: unknown): string {
  if (typeof arg === "string") return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function runJsProgram(code: string, stdin: string): ExecResult {
  let stdout = "";
  let stderr = "";
  const cons = {
    log: (...args: unknown[]) => {
      stdout += args.map(fmt).join(" ") + "\n";
    },
    info: (...args: unknown[]) => {
      stdout += args.map(fmt).join(" ") + "\n";
    },
    warn: (...args: unknown[]) => {
      stdout += args.map(fmt).join(" ") + "\n";
    },
    error: (...args: unknown[]) => {
      stderr += args.map(fmt).join(" ") + "\n";
    },
  };

  const t0 = performance.now();
  try {
    const fn = new Function("__stdin__", "console", code);
    fn(stdin, cons);
    return {
      stdout: stdout.trimEnd(),
      stderr: stderr.trimEnd(),
      status: "Accepted",
      status_id: 3,
      time: ((performance.now() - t0) / 1000).toFixed(3),
      exit_code: 0,
      ran_with: "JavaScript (browser)",
    };
  } catch (error) {
    const isSyntax = error instanceof SyntaxError;
    const msg =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    return {
      stdout: stdout.trimEnd(),
      stderr: msg,
      status: isSyntax ? "Compilation Error" : "Runtime Error (NZEC)",
      status_id: isSyntax ? 6 : 11,
      time: ((performance.now() - t0) / 1000).toFixed(3),
      exit_code: 1,
      ran_with: "JavaScript (browser)",
    };
  }
}
