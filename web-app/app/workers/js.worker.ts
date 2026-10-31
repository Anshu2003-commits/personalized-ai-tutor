/// <reference lib="webworker" />
//
// Tier-1 client-side JavaScript execution. JS is the browser's native runtime,
// so there's no WASM to download and no cross-origin isolation needed - the
// program runs immediately in this Worker. The actual execution lives in the
// pure lib/execution/js-runtime.ts so it can be unit-tested under Node.
// Speaks lib/execution/protocol.ts.

import { runJsProgram } from "@/lib/execution/js-runtime";

self.onmessage = (event: MessageEvent) => {
  const { type, id, code, stdin } = event.data;
  try {
    switch (type) {
      case "INIT":
        // Nothing to load - JS is ready immediately.
        self.postMessage({ type: "INIT_DONE", id });
        break;
      case "RUN":
        self.postMessage({
          type: "RUN_RESULT",
          id,
          result: runJsProgram(code, stdin ?? ""),
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
