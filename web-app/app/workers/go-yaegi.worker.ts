/// <reference lib="webworker" />
//
// Tier-1 client-side Go execution via Yaegi (a Go interpreter) compiled to
// `js/wasm`. Speaks lib/execution/protocol.ts, mirrors pyodide.worker.ts.
//
// REQUIRES two static assets (produced once by CI -- see runtimes/go/build.sh):
//   public/wasm/go/wasm_exec.js   (Go's official JS runtime shim, from $(go env GOROOT)/lib)
//   public/wasm/go/yaegi.wasm     (built from runtimes/go/main.go)
// They are NOT in the repo because this sandbox has no Go toolchain. The glue
// below is complete and deterministic; only the .wasm needs building.
//
// See CLIENT_SIDE_EXECUTION.md.

import type { ExecResult } from "@/lib/execution/types";

declare const Go: { new (): GoRuntime };
interface GoRuntime {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

const WASM_BASE = "/wasm/go/";
const RAN_WITH = "Yaegi (Go->wasm)";

// The Go program (runtimes/go/main.go) registers this on globalThis once booted.
type YaegiRun = (src: string, stdin: string) => {
  stdout: string;
  stderr: string;
  ok: boolean;
};
declare const __yaegiRun: YaegiRun | undefined;

let booted = false;

async function initGo(): Promise<void> {
  // Load Go's runtime shim (defines `Go`).
  importScripts(`${WASM_BASE}wasm_exec.js`);
  const go = new Go();
  const { instance } = await WebAssembly.instantiateStreaming(
    fetch(`${WASM_BASE}yaegi.wasm`),
    go.importObject,
  );
  // go.run resolves only when the Go program exits; ours blocks on `select{}`
  // to stay alive for repeated calls, so we deliberately do NOT await it.
  void go.run(instance);

  // Wait for the Go side to publish __yaegiRun on the global scope.
  const deadline = Date.now() + 10_000;
  while (typeof __yaegiRun === "undefined") {
    if (Date.now() > deadline) throw new Error("Yaegi failed to boot in 10s");
    await new Promise((r) => setTimeout(r, 15));
  }
  booted = true;
}

function runGo(code: string, stdin: string): ExecResult {
  if (!booted || typeof __yaegiRun === "undefined") {
    return mkResult("", "Yaegi not initialized", false, null);
  }
  const t0 = performance.now();
  try {
    const { stdout, stderr, ok } = __yaegiRun(code, stdin);
    return mkResult(stdout, stderr, ok, ((performance.now() - t0) / 1000).toFixed(3));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return mkResult("", msg, false, ((performance.now() - t0) / 1000).toFixed(3));
  }
}

function mkResult(
  stdout: string,
  stderr: string,
  ok: boolean,
  time: string | null,
): ExecResult {
  // Yaegi reports compile + run errors the same way; treat any failure as a
  // runtime error unless it clearly looks like a parse/compile problem.
  const isCompile = /expected|undefined:|syntax error|cannot use|not declared/i.test(
    stderr,
  );
  return {
    stdout: stdout.trimEnd(),
    stderr: stderr.trimEnd(),
    status: ok ? "Accepted" : isCompile ? "Compilation Error" : "Runtime Error (NZEC)",
    status_id: ok ? 3 : isCompile ? 6 : 11,
    time,
    exit_code: ok ? 0 : 1,
    ran_with: RAN_WITH,
  };
}

self.onmessage = async (event: MessageEvent) => {
  const { type, id, code, stdin } = event.data;
  try {
    switch (type) {
      case "INIT":
        await initGo();
        self.postMessage({ type: "INIT_DONE", id });
        break;
      case "RUN":
        self.postMessage({ type: "RUN_RESULT", id, result: runGo(code, stdin ?? "") });
        break;
      default:
        self.postMessage({ type: "ERROR", id, error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    self.postMessage({
      type: "ERROR",
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
