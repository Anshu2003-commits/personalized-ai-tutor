"use client";

import { idbGet, idbSet } from "./idb-cache";
import type { Question } from "./types";

export type LoadResult = {
  data: Question;
  fromCache: boolean;
  latency_ms: number;
};

const inflight = new Map<string, Promise<LoadResult>>();
const isDev = process.env.NODE_ENV !== "production";

export async function loadQuestion(id: string): Promise<LoadResult> {
  const existing = inflight.get(id);
  if (existing) return existing;

  const promise = (async (): Promise<LoadResult> => {
    const t0 = performance.now();

    if (!isDev) {
      try {
        const cached = await idbGet<Question>(`q:${id}`);
        if (cached) {
          return {
            data: cached,
            fromCache: true,
            latency_ms: Math.round(performance.now() - t0),
          };
        }
      } catch {
        // IndexedDB unavailable - fall through to network
      }
    }

    const res = await fetch(`/api/questions/${id}`, {
      cache: isDev ? "no-store" : "force-cache",
    });
    if (!res.ok) throw new Error(`question fetch failed: ${res.status}`);
    const data = (await res.json()) as Question;

    if (!isDev) {
      try {
        await idbSet(`q:${id}`, data);
      } catch {
        // IDB write failure is non-fatal
      }
    }

    return {
      data,
      fromCache: false,
      latency_ms: Math.round(performance.now() - t0),
    };
  })();

  inflight.set(id, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(id);
  }
}

export function prefetchQuestion(id: string): void {
  void loadQuestion(id).catch(() => {});
}
