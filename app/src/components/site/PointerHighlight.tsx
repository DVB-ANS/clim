// Pattern after Aceternity UI's Pointer Highlight (https://ui.aceternity.com/components/pointer-highlight); re-implemented, no code copied.

"use client";

import { motion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/* The box starts as a point at the frame's top-left and grows to its bottom-right. Sizes are
   percentages of the frame, so the box follows the word through font swaps and breakpoints with
   no measuring. The frame sits 0.1em outside the word, and the word keeps 0.1em of side room so
   the box clears its neighbours (the h1's trailing full stop). Every animated key is positional
   (width, height, scale): under the root MotionConfig reducedMotion="user" they all
   apply at once, with no delay, so the box simply appears. */
const box: Variants = {
  hidden: { width: "0%", height: "0%", scale: 0 },
  drawn: { width: "100%", height: "100%", scale: 1 },
};

const DRAW_S = 1;

/**
 * Marks an inline word: once it scrolls into view, and `delay` seconds later, a pink box draws itself
 * around it. Spans only (it sits inside an h1); the box is hidden from assistive tech and left out of
 * copied text.
 */
export function PointerHighlight({
  children,
  delay = 1.1,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const draw = { delay, duration: DRAW_S, ease: "easeInOut" } as const;
  return (
    <motion.span
      className={cn("relative mx-[0.1em] inline-block", className)}
      initial="hidden"
      whileInView="drawn"
      viewport={{ once: true, amount: 0.6 }}
    >
      {children}
      <span aria-hidden className="pointer-events-none absolute -inset-x-[0.1em] inset-y-0 select-none">
        <motion.span
          className="absolute left-0 top-0 origin-top-left border-2 border-pink"
          variants={box}
          transition={{ default: draw, scale: { delay, duration: 0 } }}
        />
      </span>
    </motion.span>
  );
}
