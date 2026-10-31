"use client";

import { useCallback, useSyncExternalStore } from "react";

const SHORTCUTS_KEY = "onlearn:tutor:shortcuts";
const CHANGE_EVENT = "onlearn:settings";

// Tutor-screen preferences, persisted to localStorage. Backed by an external
// store (useSyncExternalStore) so it reads synchronously without a setState-in-
// effect, and hydrates cleanly: the server snapshot is the default (shortcuts
// ON - audience is working engineers), and the client reconciles after mount.
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getShortcutsSnapshot(): boolean {
  try {
    return localStorage.getItem(SHORTCUTS_KEY) !== "0";
  } catch {
    return true;
  }
}

export function useTutorSettings() {
  const shortcutsEnabled = useSyncExternalStore(
    subscribe,
    getShortcutsSnapshot,
    () => true,
  );

  const setShortcutsEnabled = useCallback((value: boolean) => {
    try {
      localStorage.setItem(SHORTCUTS_KEY, value ? "1" : "0");
    } catch {
      // ignore unavailable storage
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { shortcutsEnabled, setShortcutsEnabled };
}
