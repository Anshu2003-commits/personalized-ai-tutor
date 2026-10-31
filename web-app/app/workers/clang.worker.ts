/// <reference lib="webworker" />
//
// Tier-1 client-side C / C++ via a SINGLE-THREADED clang (binji/wasm-clang).
// Single-threaded means no SharedArrayBuffer and therefore NO cross-origin
// isolation (COOP/COEP) - which is what keeps the CDN-loaded Pyodide and Clerk
// working. Speaks lib/execution/protocol.ts.
//
// Assets live in public/wasm/clang/ and come from binji/wasm-clang:
// shared.js, clang, lld, memfs, and sysroot.tar. The function-mode DRIVER that
// wraps the learner's code (lib/boilerplate.ts) is already verified with native
// g++.

import type { ExecResult } from "@/lib/execution/types";

const ASSET_BASE = "/wasm/clang/";
const RAN_WITH = "clang -> wasm (single-threaded WASI)";

type ClangApiOptions = {
  readBuffer(filename: string): Promise<ArrayBuffer>;
  compileStreaming(filename: string): Promise<WebAssembly.Module>;
  hostWrite(text: string): void;
  clang?: string;
  lld?: string;
  memfs?: string;
  sysroot?: string;
};

type ClangApi = {
  ready: Promise<void>;
  hostWrite(text: string): void;
  memfs: {
    hostWrite(text: string): void;
    setStdinStr(text: string): void;
    addFile(path: string, contents: string | ArrayBuffer | Uint8Array): void;
    getFileContents(path: string): Uint8Array;
  };
  clangCommonArgs: string[];
  getModule(name: string): Promise<WebAssembly.Module>;
  link(obj: string, wasm: string): Promise<unknown>;
  run(module: WebAssembly.Module, ...args: string[]): Promise<unknown>;
};

type ClangApiConstructor = new (options: ClangApiOptions) => ClangApi;

declare global {
  // Published by loadSharedJs() after evaluating binji's shared.js.
  var __WasmClangAPI: ClangApiConstructor | undefined;
}

let api: ClangApi | null = null;
let runSeq = 0;

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

async function readBuffer(filename: string): Promise<ArrayBuffer> {
  const response = await fetch(`${ASSET_BASE}${filename}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch clang asset ${filename}: ${response.status}`);
  }
  return response.arrayBuffer();
}

async function compileStreaming(filename: string): Promise<WebAssembly.Module> {
  return WebAssembly.compile(await readBuffer(filename));
}

async function initClang(): Promise<void> {
  if (api) return;
  const APIConstructor = await loadSharedJs();
  api = new APIConstructor({
    readBuffer,
    compileStreaming,
    hostWrite() {
      // INIT fetch/untar logs are intentionally hidden from the UI.
    },
  });
  await api.ready;
}

async function loadSharedJs(): Promise<ClangApiConstructor> {
  if (globalThis.__WasmClangAPI) return globalThis.__WasmClangAPI;

  const response = await fetch(`${ASSET_BASE}shared.js`);
  if (!response.ok) {
    throw new Error(`Failed to fetch clang asset shared.js: ${response.status}`);
  }
  const source = await response.text();
  // shared.js is vendored demoware, not an ES module. Evaluate it once inside
  // this worker and publish its local `API` constructor for module-worker code.
  (0, eval)(`${source}\n;globalThis.__WasmClangAPI = API;`);

  if (!globalThis.__WasmClangAPI) {
    throw new Error("Failed to initialize clang API from shared.js");
  }
  return globalThis.__WasmClangAPI;
}

async function compileAndRun(
  code: string,
  stdin: string,
  lang: "c" | "cpp",
): Promise<ExecResult> {
  if (!api) throw new Error("Clang runtime is not initialized.");

  const t0 = performance.now();
  const id = runSeq++;
  const ext = lang === "c" ? "c" : "cc";
  const input = `main_${id}.${ext}`;
  const obj = `main_${id}.o`;
  const wasm = `main_${id}.wasm`;
  let phase: "compile" | "run" = "compile";
  let compilerLog = "";
  let programOutput = "";

  const captureWrite = (text: string) => {
    const clean = stripAnsi(text);
    if (phase === "run") {
      if (clean.startsWith("> ")) {
        compilerLog += clean;
      } else {
        programOutput += clean;
      }
      return;
    }
    compilerLog += clean;
  };
  api.hostWrite = captureWrite;
  api.memfs.hostWrite = captureWrite;

  try {
    await api.ready;
    api.memfs.addFile(input, code);

    const clang = await api.getModule("clang");
    await api.run(
      clang,
      "clang",
      "-cc1",
      "-emit-obj",
      ...api.clangCommonArgs,
      lang === "cpp" ? "-std=c++17" : "-std=c17",
      "-O2",
      "-o",
      obj,
      "-x",
      lang === "cpp" ? "c++" : "c",
      input,
    );

    await api.link(obj, wasm);
    api.memfs.setStdinStr(stdin);

    const wasmBytes = new Uint8Array(api.memfs.getFileContents(wasm));
    const wasmModule = await WebAssembly.compile(wasmBytes);

    phase = "run";
    await api.run(wasmModule, wasm);

    return {
      stdout: programOutput.trimEnd(),
      stderr: "",
      status: "Accepted",
      status_id: 3,
      time: ((performance.now() - t0) / 1000).toFixed(3),
      exit_code: 0,
      ran_with: RAN_WITH,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exitCode =
      error && typeof error === "object" && "code" in error
        ? Number((error as { code: unknown }).code) || 1
        : 1;
    const stderr = `${phase === "compile" ? compilerLog : programOutput}\n${message}`
      .trim()
      .trimEnd();
    return {
      stdout: phase === "run" ? programOutput.trimEnd() : "",
      stderr,
      status: phase === "compile" ? "Compilation Error" : "Runtime Error (NZEC)",
      status_id: phase === "compile" ? 6 : 11,
      time: ((performance.now() - t0) / 1000).toFixed(3),
      exit_code: exitCode,
      ran_with: RAN_WITH,
    };
  }
}

let langHint: "c" | "cpp" = "cpp";

self.onmessage = async (event: MessageEvent) => {
  const { type, id, code, stdin, lang } = event.data;
  if (lang === "c" || lang === "cpp") langHint = lang;
  try {
    switch (type) {
      case "INIT":
        await initClang();
        self.postMessage({ type: "INIT_DONE", id });
        break;
      case "RUN":
        self.postMessage({
          type: "RUN_RESULT",
          id,
          result: await compileAndRun(code, stdin ?? "", langHint),
        });
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
