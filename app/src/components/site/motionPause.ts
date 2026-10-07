"use client";

import { useSyncExternalStore } from "react";

// The landing's page-wide motion switch (WCAG 2.2.2: anything that moves on its own for more than 5 s
// can be paused). The "Pause motion" button under the hero (MotionToggle) flips it; it pauses the infinite
// loops only: the isobar canvas (useCanvasLoop), the map's arcs and the scroll cue (.motion-loop in globals.css). The
// one-off entrances keep running. It lives on <html data-motion="paused"> so CSS can read it too.
let paused = false;
const listeners = new Set<() => void>();

export function isMotionPaused(): boolean {
  return paused;
}

export function setMotionPaused(next: boolean) {
  paused = next;
  if (next) document.documentElement.dataset.motion = "paused";
  else delete document.documentElement.dataset.motion;
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Whether the page's motion is paused, for components that render the switch or depend on it. */
export function useMotionPaused(): boolean {
  return useSyncExternalStore(subscribe, isMotionPaused, () => false);
}
