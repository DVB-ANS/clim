"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// JSON values kept in localStorage (when this browser joined a pool). The server render and hydration
// see the fallback, then the stored value; a memory copy keeps them for the visit when storage is blocked.
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** A stored JSON value and its updater; `fallback` must be a stable constant. */
export function useStored<T>(key: string, fallback: T): [T, (update: (value: T) => T) => void] {
  const raw = useSyncExternalStore(subscribe, () => readRaw(key), () => null);
  const value = useMemo(() => parse(raw, fallback), [raw, fallback]);
  const update = useCallback(
    (f: (value: T) => T) => {
      const next = JSON.stringify(f(parse(readRaw(key), fallback)));
      memory.set(key, next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // blocked storage: the memory copy lasts for this visit
      }
      for (const l of listeners) l();
    },
    [key, fallback],
  );
  return [value, update];
}
