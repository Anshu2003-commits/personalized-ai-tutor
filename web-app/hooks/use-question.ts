"use client";

import { useEffect, useState } from "react";
import { loadQuestion } from "@/lib/question-loader";
import type { Question } from "@/lib/types";

export type UseQuestionState = {
  data: Question | null;
  fromCache: boolean | null;
  latency_ms: number | null;
  error: Error | null;
};

const EMPTY: UseQuestionState = {
  data: null,
  fromCache: null,
  latency_ms: null,
  error: null,
};

export function useQuestion(id: string | null): UseQuestionState {
  // State is tagged with the id it belongs to; the return value is derived so
  // an id switch never needs a synchronous reset inside the effect.
  const [state, setState] = useState<UseQuestionState & { forId: string | null }>(
    { ...EMPTY, forId: null },
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    loadQuestion(id)
      .then((r) => {
        if (cancelled) return;
        setState({
          data: r.data,
          fromCache: r.fromCache,
          latency_ms: r.latency_ms,
          error: null,
          forId: id,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setState({
          data: null,
          fromCache: null,
          latency_ms: null,
          error: e instanceof Error ? e : new Error(String(e)),
          forId: id,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) return EMPTY;
  if (state.forId === id) return state;
  // Stale-while-loading: keep showing the previous question's data until the
  // new one resolves (loads are near-instant via the IDB cache + prefetch).
  return { data: state.data, fromCache: null, latency_ms: null, error: null };
}
