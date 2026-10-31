"use client";

// React binding for the singleton runtime manager. `useRuntime(kind)` subscribes
// to one worker family's status and exposes init/run. Calling it with a changing
// `kind` across renders is fine - it's a stable single hook call, and the
// subscription re-targets when kind changes.

import { useCallback, useSyncExternalStore } from "react";
import type { ExecResult } from "@/lib/execution/types";
import {
  type RuntimeKind,
  type RuntimeStatus,
  getStatus,
  initRuntime,
  runOnRuntime,
  subscribe,
} from "@/lib/execution/runtime-manager";

const SERVER_SNAPSHOT: RuntimeStatus = {
  isReady: false,
  isLoading: false,
  isRunning: false,
  initError: null,
};

export function useRuntime(kind: RuntimeKind) {
  const status = useSyncExternalStore(
    useCallback((cb) => subscribe(kind, cb), [kind]),
    useCallback(() => getStatus(kind), [kind]),
    () => SERVER_SNAPSHOT,
  );

  const init = useCallback(() => initRuntime(kind), [kind]);

  const run = useCallback(
    (code: string, stdin: string, extra?: Record<string, unknown>): Promise<ExecResult> =>
      runOnRuntime(kind, code, stdin, extra),
    [kind],
  );

  return { ...status, init, run };
}
