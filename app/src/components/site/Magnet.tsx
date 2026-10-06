// Adapted from React Bits "Magnet" (https://reactbits.dev/animations/magnet, github.com/DavidHDev/react-bits). Copyright (c) 2026 David Haz. MIT + Commons Clause License Condition v1.0: used as part of this application; not sold, sublicensed or redistributed as a component. Full text in THIRD_PARTY_NOTICES.md.

"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const SPRING = { stiffness: 150, damping: 15 };

/**
 * Pulls its child toward the cursor while the cursor is within `padding` px of its box (by the
 * offset from the centre / `strength`, so about 19 px at most on a 150 px pill), then springs it
 * back. Pointer moves only write motion values, never React state. Off under reduced motion (read at
 * mount: motion's useReducedMotion does not follow a later change) and on coarse pointers, both
 * decided in an effect so the server and first client render match. Keep focus styles on the child;
 * `className` is for the wrapper's placement only, never an animation class such as `.rise`: its
 * fill-mode `both` holds `transform` over the inline style and cancels the pull.
 */
export function Magnet({ children, className, padding = 40, strength = 6 }: { children: ReactNode; className?: string; padding?: number; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const pullX = useMotionValue(0);
  const pullY = useMotionValue(0);
  const x = useSpring(pullX, SPRING);
  const y = useSpring(pullY, SPRING);

  useEffect(() => {
    if (reduced || window.matchMedia("(pointer: coarse)").matches) return;
    const release = () => {
      pullX.set(0);
      pullY.set(0);
    };
    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el || e.pointerType === "touch") return;
      const r = el.getBoundingClientRect();
      // The rect includes the pull already drawn; take it back to measure from the laid-out box.
      const dx = e.clientX - (r.left + r.width / 2 - x.get());
      const dy = e.clientY - (r.top + r.height / 2 - y.get());
      if (Math.abs(dx) < r.width / 2 + padding && Math.abs(dy) < r.height / 2 + padding) {
        pullX.set(dx / strength);
        pullY.set(dy / strength);
      } else {
        release();
      }
    };
    // Leaving the window sends no further pointermove: let go there too.
    const onOut = (e: PointerEvent) => {
      if (!e.relatedTarget) release();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerout", onOut, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerout", onOut);
      release();
      x.jump(0);
      y.jump(0);
    };
  }, [reduced, padding, strength, pullX, pullY, x, y]);

  return (
    <motion.span ref={ref} className={cn("inline-block", className)} style={{ x, y }}>
      {children}
    </motion.span>
  );
}
