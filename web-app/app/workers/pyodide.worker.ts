/// <reference lib="webworker" />

import {
  appendPythonIndentationHint,
  isPythonCompileError,
  normalizePythonSourceWhitespace,
} from "@/lib/execution/python-source";

declare function loadPyodide(config: unknown): Promise<unknown>;

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodide: any = null;

async function initPyodide() {
  importScripts(`${PYODIDE_CDN}pyodide.js`);
  pyodide = await loadPyodide({ indexURL: PYODIDE_CDN });
  return true;
}

type RunResult = {
  stdout: string;
  stderr: string;
  status: string;
  status_id: number;
  time: string | null;
  exit_code: number;
};

async function runPython(code: string, stdin: string): Promise<RunResult> {
  if (!pyodide) throw new Error("Pyodide not initialized");

  let stdout = "";
  let stderr = "";

  pyodide.setStdout({ batched: (t: string) => (stdout += t + "\n") });
  pyodide.setStderr({ batched: (t: string) => (stderr += t + "\n") });

  pyodide.globals.set("_stdin_text", stdin);
  await pyodide.runPython(
    `import sys, io\nsys.stdin = io.StringIO(_stdin_text)`,
  );

  const t0 = performance.now();
  try {
    const normalizedCode = normalizePythonSourceWhitespace(code);
    // Auto-load any Pyodide-available package referenced by the code's imports:
    // numpy, pandas, scipy, scikit-learn, matplotlib, sympy, networkx, etc. This
    // replaces brittle per-import string matching. NOTE: PyTorch is NOT in the
    // Pyodide package set (native wheel, no WASM build) -- see
    // CLIENT_SIDE_EXECUTION.md for the deep-learning story (tinygrad / micrograd /
    // ONNX Runtime Web).
    await pyodide.loadPackagesFromImports(normalizedCode);
    await pyodide.runPythonAsync(normalizedCode);
    return {
      stdout: stdout.trimEnd(),
      stderr: stderr.trimEnd(),
      status: "Accepted",
      status_id: 3,
      time: ((performance.now() - t0) / 1000).toFixed(3),
      exit_code: 0,
    };
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    const msg = appendPythonIndentationHint(rawMsg);
    const isSyntax = isPythonCompileError(rawMsg);
    return {
      stdout: stdout.trimEnd(),
      stderr: msg,
      status: isSyntax ? "Compilation Error" : "Runtime Error (NZEC)",
      status_id: isSyntax ? 6 : 11,
      time: ((performance.now() - t0) / 1000).toFixed(3),
      exit_code: 1,
    };
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { type, id, code, stdin } = event.data;
  try {
    switch (type) {
      case "INIT":
        await initPyodide();
        self.postMessage({ type: "INIT_DONE", id });
        break;
      case "RUN": {
        const result = await runPython(code, stdin ?? "");
        self.postMessage({ type: "RUN_RESULT", id, result });
        break;
      }
      default:
        self.postMessage({
          type: "ERROR",
          id,
          error: `Unknown message type: ${type}`,
        });
    }
  } catch (error) {
    self.postMessage({
      type: "ERROR",
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
