"use client";

import { useSyncExternalStore } from "react";
import { createEmptyState, parseStoredState, STORAGE_KEY, type CounterState } from "./counter";

const CHANGE_EVENT = "refrigerator-counter:change";
type Snapshot = { state: CounterState; hydrated: boolean; error: string | null };
const serverSnapshot: Snapshot = { state: createEmptyState(), hydrated: false, error: null };
let snapshot = serverSnapshot;
let cachedRaw: string | null | undefined;

function getSnapshot(): Snapshot {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (snapshot.hydrated && raw === cachedRaw) return snapshot;
    const parsed = parseStoredState(raw);
    cachedRaw = raw;
    snapshot = { ...parsed, hydrated: true };
  } catch {
    // Invalidate the raw cache so a temporary permission failure can recover
    // even when the persisted content itself has not changed.
    cachedRaw = undefined;
    if (!snapshot.hydrated || !snapshot.error) {
      snapshot = { state: snapshot.state, hydrated: true, error: "ブラウザの保存領域を利用できません。設定をご確認ください。" };
    }
  }
  return snapshot;
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      cachedRaw = undefined;
      listener();
    }
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCounterStore() {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}

type CommitResult = { ok: true; state: CounterState } | { ok: false; error: string };

function commitNow(update: (state: CounterState) => CounterState): CommitResult {
  const current = getSnapshot();
  if (current.error) return { ok: false, error: current.error };
  const next = update(current.state);
  try {
    const raw = JSON.stringify(next);
    window.localStorage.setItem(STORAGE_KEY, raw);
    cachedRaw = raw;
    snapshot = { state: next, hydrated: true, error: null };
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return { ok: true, state: next };
  } catch {
    return { ok: false, error: "保存できませんでした。空き容量やブラウザの設定をご確認ください。今回の操作は反映していません。" };
  }
}

/** Web Locks serialize read/modify/write across tabs in supported secure browsers. */
export async function commitState(update: (state: CounterState) => CounterState): Promise<CommitResult> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    try {
      return await navigator.locks.request("refrigerator-counter:write", () => commitNow(update));
    } catch {
      return { ok: false, error: "保存処理を開始できませんでした。少し待ってから、もう一度お試しください。" };
    }
  }
  // Progressive fallback for older browsers without the Web Locks API.
  return commitNow(update);
}

let clock = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();
function tick() {
  clock = Date.now();
  clockListeners.forEach((listener) => listener());
}
function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (!clockTimer) {
    clock = Date.now();
    clockTimer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      clearInterval(clockTimer);
      clockTimer = undefined;
      document.removeEventListener("visibilitychange", tick);
    }
  };
}
export function useClock() {
  return useSyncExternalStore(subscribeClock, () => clock, () => 0);
}
