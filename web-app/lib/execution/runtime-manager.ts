"use client";

// Singleton manager for every Tier-1 WASM runtime worker. Generalises the
// original use-pyodide singleton: one worker per RuntimeKind is booted lazily
// and reused for the whole tab, so switching questions (or languages) never
// re-pays a multi-MB runtime download. All workers speak lib/execution/protocol.
//
// A React view subscribes via hooks/use-runtime.ts (useSyncExternalStore); this
// module owns the worker lifecycle and the request/response plumbing.

import type { ExecResult } from "./types";
import { internalError } from "./protocol";

/** Which worker family backs a language. Several languages share one (c/cpp). */
export type RuntimeKind = "pyodide" | "js" | "go" | "clang";

export type RuntimeStatus = {
  isReady: boolean;
  isLoading: boolean;
  isRunning: boolean;
  initError: string | null;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

type RuntimeState = {
  worker: Worker | null;
  initPromise: Promise<void> | null;
  pending: Map<string, Pending>;
  nextId: number;
  listeners: Set<() => void>;
  // `status` is replaced (new object) on every change so useSyncExternalStore's
  // getSnapshot stays referentially stable between changes.
  status: RuntimeStatus;
};

const IDLE: RuntimeStatus = {
  isReady: false,
  isLoading: false,
  isRunning: false,
  initError: null,
};

const states = new Map<RuntimeKind, RuntimeState>();

function getState(kind: RuntimeKind): RuntimeState {
  let s = states.get(kind);
  if (!s) {
    s = {
      worker: null,
      initPromise: null,
      pending: new Map(),
      nextId: 0,
      listeners: new Set(),
      status: IDLE,
    };
    states.set(kind, s);
  }
  return s;
}

function patch(s: RuntimeState, next: Partial<RuntimeStatus>) {
  s.status = { ...s.status, ...next };
  for (const cb of s.listeners) cb();
}

// The `new URL(..., import.meta.url)` worker hint must be static per branch so
// the bundler can find and emit each worker chunk.
function makeWorker(kind: RuntimeKind): Worker {
  switch (kind) {
    case "pyodide":
      return new Worker(
        new URL("../../app/workers/pyodide.worker.ts", import.meta.url),
        { type: "module" },
      );
    case "js":
      return new Worker(
        new URL("../../app/workers/js.worker.ts", import.meta.url),
        { type: "module" },
      );
    case "go":
      return new Worker(
        new URL("../../app/workers/go-yaegi.worker.ts", import.meta.url),
        { type: "module" },
      );
    case "clang":
      return new Worker(
        new URL("../../app/workers/clang.worker.ts", import.meta.url),
        { type: "module" },
      );
  }
}

function send(
  s: RuntimeState,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!s.worker) {
      reject(new Error("Worker not initialized"));
      return;
    }
    const id = `msg_${s.nextId++}`;
    s.pending.set(id, { resolve, reject });
    s.worker.postMessage({ type, id, ...payload });
  });
}

/** Boot the runtime (idempotent). Resolves once it's ready to RUN. */
export function initRuntime(kind: RuntimeKind): Promise<void> {
  const s = getState(kind);
  if (s.status.isReady) return Promise.resolve();
  if (s.initPromise) return s.initPromise;

  const worker = makeWorker(kind);
  worker.onmessage = (event: MessageEvent) => {
    const { type, id, result, error } = event.data;
    const p = s.pending.get(id);
    if (!p) return;
    s.pending.delete(id);
    switch (type) {
      case "INIT_DONE":
        p.resolve(true);
        break;
      case "RUN_RESULT":
        p.resolve(result);
        break;
      case "ERROR":
        p.reject(new Error(error));
        break;
      default:
        p.reject(new Error(`Unknown response type: ${type}`));
    }
  };
  worker.onerror = (e) => {
    const err = e instanceof ErrorEvent ? e.message : "Worker error";
    for (const [, p] of s.pending) p.reject(new Error(err));
    s.pending.clear();
  };
  s.worker = worker;

  patch(s, { isLoading: true, initError: null });
  s.initPromise = send(s, "INIT")
    .then(() => {
      patch(s, { isReady: true, isLoading: false });
    })
    .catch((e) => {
      // Failed boot: tear down so a later attempt starts clean. The heavy
      // runtimes (clang needs @wasmer/sdk + cross-origin isolation; go needs a
      // CI-built yaegi.wasm) fail here until their assets are present - surfaced
      // as initError, not a crash.
      s.worker?.terminate();
      s.worker = null;
      s.initPromise = null;
      patch(s, {
        isLoading: false,
        isReady: false,
        initError:
          e instanceof Error ? e.message : "Runtime failed to initialize.",
      });
      throw e;
    });
  return s.initPromise;
}

/**
 * Run `code` on the runtime. `extra` carries runtime-specific fields - notably
 * `lang: "c" | "cpp"` for the shared clang worker.
 */
export async function runOnRuntime(
  kind: RuntimeKind,
  code: string,
  stdin: string,
  extra: Record<string, unknown> = {},
): Promise<ExecResult> {
  const s = getState(kind);
  if (!s.status.isReady || !s.worker) {
    return internalError("Runtime is not initialized.");
  }
  patch(s, { isRunning: true });
  try {
    return (await send(s, "RUN", { code, stdin, ...extra })) as ExecResult;
  } catch (error) {
    return internalError(
      error instanceof Error ? error.message : "Execution failed",
    );
  } finally {
    patch(s, { isRunning: false });
  }
}

export function subscribe(kind: RuntimeKind, cb: () => void): () => void {
  const s = getState(kind);
  s.listeners.add(cb);
  return () => s.listeners.delete(cb);
}

export function getStatus(kind: RuntimeKind): RuntimeStatus {
  return getState(kind).status;
}
