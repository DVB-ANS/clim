"use client";

import { type RefObject, useEffect, useRef } from "react";
import { isMotionPaused } from "./motionPause";

export type CanvasFrame = (g: CanvasRenderingContext2D, w: number, h: number, dpr: number, now: number) => void;

/**
 * Paints `frame` on the canvas about 20 times a second while it is on screen. With reduced motion,
 * or while the page's motion is paused (motionPause.ts), it paints once per render instead: the data
 * still updates, nothing moves on its own. The clock passed to `frame` stops while paused, so the
 * picture resumes where it stopped instead of jumping ahead.
 */
export function useCanvasLoop(ref: RefObject<HTMLCanvasElement | null>, frame: CanvasFrame) {
  const frameRef = useRef(frame);
  const paintRef = useRef<() => void>(() => {});
  const reduceRef = useRef(false);

  useEffect(() => {
    frameRef.current = frame;
    if (reduceRef.current || isMotionPaused()) paintRef.current();
  });

  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    reduceRef.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // the motion clock: performance.now() minus the time spent paused; while paused it holds the last
    // painted frame's time, so a repaint for new data shows the same picture, and play resumes from there
    let offset = 0, pausedAt = 0, last = 0;
    const clock = () => {
      const now = performance.now();
      if (isMotionPaused()) {
        if (!pausedAt) pausedAt = last + offset;
        return last;
      }
      if (pausedAt) {
        offset += now - pausedAt;
        pausedAt = 0;
      }
      last = now - offset;
      return last;
    };
    const paint = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
      if (!w || !h) return;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      // with reduced motion the clock stands still: the frame shows the data, never a drift or a spin
      frameRef.current(g, w, h, dpr, reduceRef.current ? 0 : clock());
    };
    paintRef.current = paint;
    let raf = 0, lastPaint = 0, visible = true;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || isMotionPaused() || now - lastPaint < 50) return;
      lastPaint = now;
      paint();
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(c);
    paint();
    if (!reduceRef.current) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [ref]);
}
