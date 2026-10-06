// Adapted from ObsidianUI "Split Showcase" (https://www.obsidianui.dev/docs/split-showcase, github.com/Atharvsinh-codez/ObsidianUI). Copyright (c) 2026 ObsidianUI. MIT License — full text in THIRD_PARTY_NOTICES.md.

"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId, useState, useSyncExternalStore } from "react";
import type { FocusEvent, PointerEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One pool's half of PoolsVersus: a title and a subtitle, the stat rows (a label over its value, set in
 * Inter Tight tabular figures), then an optional note and optional actions (real next/link elements).
 * Give both halves the same labels in the same order so the rows read across.
 */
export type PoolHalf = {
  title: string;
  subtitle: string;
  rows: { label: string; value: ReactNode }[];
  actions?: ReactNode;
  note?: ReactNode;
};

type Side = "v" | "s";

// Tailwind's sm breakpoint: from here the halves sit side by side, below it they stack
const SIDE_BY_SIDE = "(min-width: 40rem)";
const subscribeToWidth = (onChange: () => void) => {
  const query = window.matchMedia(SIDE_BY_SIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const isSideBySide = () => window.matchMedia(SIDE_BY_SIDE).matches;

const SPRING = { type: "spring", stiffness: 350, damping: 24 } as const;

/**
 * Pool V and its static twin S as two halves joined at a dotted seam (ObsidianUI's Split Showcase).
 * Hovering a half, or moving focus into it, springs it outward from the seam while the seam fades.
 * Side by side from sm, stacked with a horizontal seam below. Data-agnostic: the caller passes the rows.
 */
export function PoolsVersus({ v, s, className }: { v: PoolHalf; s: PoolHalf; className?: string }) {
  const [hovered, setHovered] = useState<Side | null>(null);
  const [focused, setFocused] = useState<Side | null>(null);
  const active = hovered ?? focused;

  // On the static grid cell, not on the moving half: a half springing out from under the pointer would
  // otherwise leave and re-enter in a loop at the seam.
  const cellProps = (side: Side) => ({
    onPointerEnter: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "touch") setHovered(side);
    },
    onPointerLeave: () => setHovered(null),
    // keyboard focus only: a link focused by a click (cmd-click, a new tab) would hold the half out
    // after the pointer has left
    onFocusCapture: (e: FocusEvent<HTMLDivElement>) => {
      if (e.target.matches(":focus-visible")) setFocused(side);
    },
    onBlurCapture: (e: FocusEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setFocused(null);
    },
  });

  const seam = cn("dotted-divider pointer-events-none absolute z-10 transition-opacity duration-250 ease-out", active ? "opacity-0" : "opacity-100");

  return (
    <div className={cn("relative grid grid-cols-1 sm:grid-cols-2", className)}>
      <div className="relative min-w-0" {...cellProps("v")}>
        <Half side="v" half={v} active={active === "v"} />
      </div>
      <div className="relative min-w-0" {...cellProps("s")}>
        {/* the seams sit on S's leading edge, so they follow V's height when stacked; dots in the axis
            grey, as .dotted-divider's hairline grey would vanish on the wash */}
        <div aria-hidden className={cn(seam, "inset-y-8 left-0 hidden w-1.5 -translate-x-1/2 [--clim-line:var(--clim-muted)] sm:block")} />
        <div aria-hidden className={cn(seam, "inset-x-6 top-0 h-1.5 -translate-y-1/2 [--clim-line:var(--clim-muted)] sm:hidden")} />
        <Half side="s" half={s} active={active === "s"} />
      </div>
    </div>
  );
}

function Half({ side, half, active }: { side: Side; half: PoolHalf; active: boolean }) {
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  // the server and hydration see side by side; it only matters once a half is active
  const sideBySide = useSyncExternalStore(subscribeToWidth, isSideBySide, () => true);
  // gated inside the values, never in the markup: every half renders at rest until a visitor acts
  const lift = active && !reduceMotion;
  const out = side === "v" ? -12 : 12;

  return (
    <motion.article
      aria-labelledby={titleId}
      animate={{ x: lift && sideBySide ? out : 0, y: lift && !sideBySide ? out : 0, scale: lift ? 0.98 : 1 }}
      transition={SPRING}
      className={cn(
        "relative flex h-full flex-col p-6 text-fg transition-[border-radius,box-shadow,border-color] duration-300 sm:p-8",
        side === "v" ? "border border-transparent bg-wash" : "border border-dashed border-line bg-surface-2",
        active
          ? "z-10 rounded-lg shadow-[var(--clim-shadow-lift)]"
          : side === "v"
            ? "rounded-t-lg sm:rounded-r-none sm:rounded-bl-lg"
            : "rounded-b-lg border-t-0 sm:rounded-l-none sm:rounded-tr-lg sm:border-t sm:border-l-0",
      )}
    >
      <h3 id={titleId} className="flex items-center gap-2.5 font-display text-[22px] font-normal leading-tight tracking-[-0.01em]">
        {/* the pool's series on every chart: V solid blue, S dashed grey */}
        <span aria-hidden className={side === "v" ? "h-0.5 w-4 shrink-0 rounded-full bg-v" : "w-4 shrink-0 border-t-2 border-dashed border-t-s"} />
        {half.title}
      </h3>
      <p className="mt-1 pl-[26px] text-sm text-fg-muted">{half.subtitle}</p>

      <dl className="mt-6 grid gap-x-8 gap-y-5 lg:grid-cols-2">
        {half.rows.map((row) => (
          <div key={row.label} className="min-w-0">
            <dt className="text-[13px] text-fg-muted">{row.label}</dt>
            <dd className="mt-1 font-display text-[22px] leading-tight tracking-[-0.01em] tabular-nums">{row.value}</dd>
          </div>
        ))}
      </dl>

      {half.note || half.actions ? (
        <div className="mt-auto pt-6">
          {half.note ? <div className="text-sm leading-relaxed text-fg-muted">{half.note}</div> : null}
          {half.actions ? <div className={cn("flex flex-wrap items-center gap-3", half.note ? "mt-4" : null)}>{half.actions}</div> : null}
        </div>
      ) : null}
    </motion.article>
  );
}
