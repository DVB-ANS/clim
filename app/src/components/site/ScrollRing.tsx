// Adapted from Rare UI "Scroll Progress" (https://rareui.com), github.com/swamimalode07/rare-ui at commit 53956741 — MIT License, Copyright (c) 2026 Swami Malode (the licence in force at that commit). Full text in THIRD_PARTY_NOTICES.md.

"use client";

import { useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";

import { cn } from "@/lib/cn";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const LABEL_CROSSFADE = { duration: 0.22, ease: EASE_OUT } as const;
const RING_SPRING = { stiffness: 120, damping: 30, mass: 0.3 };

/**
 * Scroll-spy: the last section whose top has crossed `offset` px below the top of the viewport, or
 * the first section before any has. 140 clears the sticky stack (panel 04 sticks at 126 px, so the
 * upstream 120 would never reach it). Only the ids are watched, so an inline array is fine too.
 */
export function useActiveSection<T extends { id: string }>(sections: readonly T[], offset = 140): T | undefined {
  const ids = sections.map((s) => s.id).join(" ");
  const [activeId, setActiveId] = useState<string>();

  useEffect(() => {
    const list = ids ? ids.split(" ") : [];
    let raf = 0;
    const update = () => {
      raf = 0;
      setActiveId(
        list.findLast((id) => {
          const top = document.getElementById(id)?.getBoundingClientRect().top;
          return top !== undefined && top <= offset;
        }),
      );
    };
    // at most one read per frame, however many scroll events land in it
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [ids, offset]);

  return sections.find((s) => s.id === activeId) ?? sections[0];
}

/**
 * Reading progress drawn as the ° of "clim": a stroke-line track and a stroke-signal arc that
 * follows the page's scroll on a soft spring, or the raw progress under reduced motion. 14 px
 * unless className sizes it; decorative, so hidden from assistive tech (label the link around it).
 */
export function ProgressDegree({ className }: { className?: string }) {
  const { scrollYProgress } = useScroll();
  const smooth = useSpring(scrollYProgress, RING_SPRING);
  const reduce = useReducedMotion();
  // one motion value either way: the reduced-motion answer (null on the server) never reaches markup
  const pathLength = useTransform(() => (reduce ? scrollYProgress.get() : smooth.get()));

  return (
    <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden className={cn("shrink-0 -rotate-90", className)}>
      <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2.5" className="stroke-line" />
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="stroke-signal"
        style={{ pathLength }}
      />
    </svg>
  );
}

/**
 * The current section's name, crossfading when it changes. Keyed by the label itself: the old one
 * pops out of layout and fades under the new one, so the width follows the new label at once.
 * Font and colour are inherited; nothing renders without a label.
 */
export function SectionLabel({ label, className, ...rest }: Omit<ComponentProps<"span">, "children"> & { label?: string }) {
  return (
    <span className={cn("relative inline-flex whitespace-nowrap", className)} {...rest}>
      <AnimatePresence initial={false} mode="popLayout">
        {label ? (
          <motion.span
            key={label}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={LABEL_CROSSFADE}
          >
            {label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
