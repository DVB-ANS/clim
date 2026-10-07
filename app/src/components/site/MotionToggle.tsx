"use client";

import { setMotionPaused, useMotionPaused } from "./motionPause";

/**
 * The landing's pause switch, a plain text button: it stops every looping motion on the page (the isobar
 * canvas, the map's arcs, the scroll cue; motionPause.ts), so nothing keeps moving on its own once a
 * visitor asks it to stop (WCAG 2.2.2).
 */
export function MotionToggle({ className = "" }: { className?: string }) {
  const paused = useMotionPaused();
  return (
    <button
      type="button"
      aria-pressed={paused}
      onClick={() => setMotionPaused(!paused)}
      className={`inline-flex min-h-6 items-center rounded-sm text-[13px] text-fg-muted underline decoration-line underline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${className}`}
    >
      {paused ? "Play motion" : "Pause motion"}
    </button>
  );
}
