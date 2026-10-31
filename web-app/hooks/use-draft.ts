"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./use-auth";
import type { TrackSlug } from "@/lib/types";

export type SyncStatus =
  | "loading" // fetching the stored draft
  | "synced" // no unsaved changes
  | "unsaved" // local edits not yet persisted
  | "saving" // a save is in flight
  | "error" // last save failed
  | "conflict" // a newer version exists server-side
  | "offline"; // signed out - drafts stay in-memory only

// The persistence layer's own state. "offline"/"loading-for-auth" are derived
// from auth at the edge, so they're never written into this.
type SaveStatus = Exclude<SyncStatus, "offline">;

export type ConflictInfo = { code: string; version: number; updatedAt: string };

type DraftSnapshot = { code: string; version: number; updatedAt: string };

const DEBOUNCE_MS = 800;

/**
 * DB-backed persistence for the code editor buffer of a single (user, question).
 * The editor's `code` state stays the source of truth in the component; this
 * hook debounces writes to `/api/user/draft`, tracks the server `version` for
 * optimistic-concurrency conflict detection, and exposes a `seed` (applied to
 * the editor via a nonce) for the initial load, reset, and "use server version".
 *
 * Signed-out users get a no-op "offline" status: the editor still works, it
 * just isn't persisted.
 */
export function useDraft(args: {
  track: TrackSlug;
  topicSlug: string;
  questionId: string;
  /** Editor language - drafts are persisted per (question, language). */
  language: string;
  initialCode: string;
}) {
  const { track, topicSlug, questionId, language, initialCode } = args;
  const { isSignedIn, isLoaded } = useAuth();

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [seed, setSeed] = useState<{ code: string; nonce: number } | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  // Persistence bookkeeping - refs so the callbacks below stay referentially
  // stable (the workspace calls notifyChange from a [code] effect).
  const versionRef = useRef(0); // last server version we know about
  // The content that needs no save: the starter code until a draft loads, then
  // whatever is currently persisted. Starts at initialCode so merely opening a
  // question never writes the untouched starter to the DB.
  const lastSavedRef = useRef<string>(initialCode);
  const latestCodeRef = useRef(initialCode); // most recent editor content
  const loadedRef = useRef(false); // initial GET resolved - safe to save
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef(false);
  const conflictRef = useRef(false);
  const nonceRef = useRef(0);
  const mountedRef = useRef(true);
  const signedInRef = useRef(false);
  const flushRef = useRef<(opts?: { keepalive?: boolean }) => void>(() => {});

  useEffect(() => {
    signedInRef.current = !!isSignedIn;
  }, [isSignedIn]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const setConflictState = useCallback((c: ConflictInfo | null) => {
    conflictRef.current = c !== null;
    setConflict(c);
  }, []);

  // Exposed status: auth states are derived so we never setState for them.
  const status: SyncStatus = !isLoaded
    ? "loading"
    : !isSignedIn
      ? "offline"
      : saveStatus;

  // --- initial load ---------------------------------------------------------
  // The workspace remounts per (question, language) - it's keyed by both - so
  // this runs fresh each switch and never needs to reset stale bookkeeping.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return; // offline/loading derived above
    let cancelled = false;
    fetch(
      `/api/user/draft?questionId=${encodeURIComponent(questionId)}&language=${encodeURIComponent(language)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { draft: DraftSnapshot | null } | null) => {
        if (cancelled) return;
        const draft = data?.draft ?? null;
        if (draft) {
          versionRef.current = draft.version;
          lastSavedRef.current = draft.code;
          latestCodeRef.current = draft.code;
          nonceRef.current += 1;
          setSeed({ code: draft.code, nonce: nonceRef.current });
        } else {
          versionRef.current = 0;
          lastSavedRef.current = initialCode; // baseline: untouched starter
        }
        loadedRef.current = true;
        setSaveStatus("synced");
        // The user may have edited while the GET was in flight - persist it.
        if (latestCodeRef.current !== lastSavedRef.current) {
          setSaveStatus("unsaved");
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => flushRef.current(), DEBOUNCE_MS);
        }
      })
      .catch(() => {
        if (!cancelled) setSaveStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, questionId, language, initialCode]);

  // --- core save ------------------------------------------------------------
  const flushNow = useCallback(
    async (opts?: { keepalive?: boolean }) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!loadedRef.current || !signedInRef.current || conflictRef.current)
        return;
      const code = latestCodeRef.current;
      if (code === lastSavedRef.current) {
        if (mountedRef.current) setSaveStatus("synced");
        return;
      }
      if (inflightRef.current) return; // a trailing change reschedules below
      inflightRef.current = true;
      if (mountedRef.current) setSaveStatus("saving");
      try {
        const res = await fetch("/api/user/draft", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          keepalive: opts?.keepalive,
          body: JSON.stringify({
            questionId,
            language,
            track,
            topicSlug,
            code,
            baseVersion: versionRef.current,
          }),
        });
        if (res.status === 409) {
          const data = (await res.json().catch(() => null)) as {
            server: ConflictInfo | null;
          } | null;
          if (mountedRef.current) {
            setConflictState(data?.server ?? null);
            setSaveStatus("conflict");
          } else {
            conflictRef.current = true;
          }
          return;
        }
        if (!res.ok) {
          if (mountedRef.current) setSaveStatus("error");
          return;
        }
        const data = (await res.json()) as { draft: DraftSnapshot };
        versionRef.current = data.draft.version;
        lastSavedRef.current = code;
      } catch {
        if (mountedRef.current) setSaveStatus("error");
        return;
      } finally {
        inflightRef.current = false;
      }
      // A change landed while we were saving - persist it too.
      if (
        signedInRef.current &&
        !conflictRef.current &&
        latestCodeRef.current !== lastSavedRef.current
      ) {
        flushRef.current();
      } else if (mountedRef.current) {
        setSaveStatus(
          latestCodeRef.current === lastSavedRef.current ? "synced" : "unsaved",
        );
      }
    },
    [questionId, language, track, topicSlug, setConflictState],
  );

  useEffect(() => {
    flushRef.current = flushNow;
  }, [flushNow]);

  // Called on every editor change. Debounces a save; no-op when offline or
  // while a conflict is awaiting resolution (so we never clobber the newer
  // server copy before the user has chosen).
  const notifyChange = useCallback((code: string) => {
    latestCodeRef.current = code;
    if (!loadedRef.current || !signedInRef.current || conflictRef.current)
      return;
    if (code === lastSavedRef.current) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (mountedRef.current) setSaveStatus("synced");
      return;
    }
    if (mountedRef.current) setSaveStatus("unsaved");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), DEBOUNCE_MS);
  }, []);

  // Force an immediate save of the latest content (used on submit / unmount).
  const flush = useCallback((opts?: { keepalive?: boolean }) => {
    flushRef.current(opts);
  }, []);

  // Best-effort save when the workspace unmounts (e.g. switching questions).
  useEffect(() => {
    return () => {
      if (
        signedInRef.current &&
        !conflictRef.current &&
        latestCodeRef.current !== lastSavedRef.current
      ) {
        flushRef.current({ keepalive: true });
      }
    };
  }, []);

  // Reset to starter code: clears the server draft and re-seeds the editor.
  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setConflictState(null);
    versionRef.current = 0;
    lastSavedRef.current = initialCode;
    latestCodeRef.current = initialCode;
    loadedRef.current = true;
    nonceRef.current += 1;
    setSeed({ code: initialCode, nonce: nonceRef.current });
    setSaveStatus("synced");
    if (signedInRef.current) {
      fetch(
        `/api/user/draft?questionId=${encodeURIComponent(questionId)}&language=${encodeURIComponent(language)}`,
        {
          method: "DELETE",
          keepalive: true,
        },
      ).catch(() => {
        if (mountedRef.current) setSaveStatus("error");
      });
    }
  }, [initialCode, questionId, language, setConflictState]);

  // Conflict resolution - keep my local edits and overwrite the server copy.
  const keepLocal = useCallback(() => {
    if (!conflict) return;
    versionRef.current = conflict.version; // adopt server version so our write lands
    setConflictState(null);
    flushRef.current();
  }, [conflict, setConflictState]);

  // Conflict resolution - discard local edits and load the server copy.
  const useServer = useCallback(() => {
    if (!conflict) return;
    versionRef.current = conflict.version;
    lastSavedRef.current = conflict.code;
    latestCodeRef.current = conflict.code;
    nonceRef.current += 1;
    setSeed({ code: conflict.code, nonce: nonceRef.current });
    setConflictState(null);
    setSaveStatus("synced");
  }, [conflict, setConflictState]);

  return {
    status,
    /** Apply `code` into the editor whenever `nonce` changes. */
    seed,
    conflict,
    notifyChange,
    flush,
    reset,
    keepLocal,
    useServer,
  };
}
