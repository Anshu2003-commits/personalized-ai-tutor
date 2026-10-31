"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./use-auth";
import type { TrackSlug } from "@/lib/types";

export type CompletionResult = {
  topicStatus: string;
  currentQuestionId: string | null;
  completedCount: number;
  totalCount: number;
  topicCompleted: boolean;
  streakUpdated: boolean;
  streak: { count: number };
  xp: number;
  xpAwarded: number;
} | null;

export function useProgress(track: TrackSlug, topicSlug: string) {
  const { isSignedIn, isLoaded } = useAuth();
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [streak, setStreak] = useState<{ count: number; updated: boolean } | null>(null);
  // Loading is derived from which topic key has finished fetching, so topic
  // switches never need a synchronous state reset inside the effect.
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);
  const inflightRef = useRef<Set<string>>(new Set());

  const key = `${track}::${topicSlug}`;

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    fetch(`/api/user/progress?track=${track}&topicSlug=${encodeURIComponent(topicSlug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setCompletedIds(new Set(data.completedQuestionIds ?? []));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFetchedFor(`${track}::${topicSlug}`);
      });

    return () => { cancelled = true; };
  }, [isSignedIn, isLoaded, track, topicSlug]);

  const loading = !isLoaded ? true : !isSignedIn ? false : fetchedFor !== key;

  const markComplete = useCallback(
    async (questionId: string): Promise<CompletionResult> => {
      setCompletedIds((prev) => new Set(prev).add(questionId));

      if (!isSignedIn || inflightRef.current.has(questionId)) return null;
      inflightRef.current.add(questionId);

      try {
        const res = await fetch("/api/user/progress", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "question_completed",
            track,
            topicSlug,
            questionId,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.streakUpdated) {
          setStreak({ count: data.streak.count, updated: true });
        }
        return data as CompletionResult;
      } catch {
        return null;
      } finally {
        inflightRef.current.delete(questionId);
      }
    },
    [isSignedIn, track, topicSlug],
  );

  return { completedIds, streak, loading, markComplete };
}
