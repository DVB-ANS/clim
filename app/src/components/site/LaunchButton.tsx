// Adapted from ObsidianUI "Discover Button" (https://www.obsidianui.dev/docs/discover-button, github.com/Atharvsinh-codez/ObsidianUI). Copyright (c) 2026 ObsidianUI. MIT License — full text in THIRD_PARTY_NOTICES.md. Restyled with clim tokens, CSS moved to utilities, next/link and the launch view transition added.

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { LaunchLink, LaunchPending } from "./LaunchLink";

/* Every dimension scales with the size. The disc sits 5 px in from the pill's edge; the sweep starts
   as a circle 2 px wider than the disc all round (inset 3 px) and widens to the pill's inner width. */
const SIZE = {
  lg: {
    root: "min-h-[66px] text-[17px]",
    fill: "w-[60px]",
    disc: "ml-[5px] size-[56px] text-[22px] group-hover/launch:translate-x-[7px] group-focus-visible/launch:translate-x-[7px]",
    label: "pl-[14px] pr-[26px]",
  },
  sm: {
    root: "min-h-[44px] text-[15px]",
    fill: "w-[38px]",
    disc: "ml-[5px] size-[34px] text-[14px] group-hover/launch:translate-x-[4px] group-focus-visible/launch:translate-x-[4px]",
    label: "pl-[8px] pr-[16px]",
  },
} as const;

/* Blue first, never a pink hover: the pink stays the disc's, where the app opens from (globals.css,
   "Launch transition"). The outline contrasts with the ground the tone is made for. */
const TONE = {
  onWhite: {
    root: "bg-accent text-accent-fg focus-visible:outline-accent",
    fill: "bg-accent-strong",
    label: "",
  },
  onBlue: {
    root: "bg-surface text-accent focus-visible:outline-accent-fg",
    fill: "bg-accent",
    label: "group-hover/launch:text-accent-fg group-focus-visible/launch:text-accent-fg",
  },
} as const;

const SWEEP = "duration-480 ease-[cubic-bezier(0.65,0,0.076,1)] motion-reduce:transition-none";

/**
 * "Launch app": a pill with Uniswap's pink disc and a white arrow; on hover or keyboard focus a darker
 * blue sweeps across it from the disc. It is a LaunchLink, so the click opens /app from the disc
 * ([data-launch-dot]), and the arrow turns into a spinner while /app loads.
 * `tone="onBlue"` is the white pill for blue grounds (the closing band).
 */
export function LaunchButton({
  size = "lg",
  tone = "onWhite",
  children,
  className,
  "aria-label": ariaLabel,
}: {
  size?: keyof typeof SIZE;
  tone?: keyof typeof TONE;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const s = SIZE[size];
  const t = TONE[tone];
  return (
    <LaunchLink
      aria-label={ariaLabel}
      className={cn(
        "group/launch relative inline-flex max-w-full items-center overflow-hidden whitespace-nowrap rounded-full font-medium leading-[1.1]",
        "transition-transform duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none",
        "focus-visible:outline-2 focus-visible:outline-offset-4",
        s.root,
        t.root,
        className,
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-[3px] left-[3px] rounded-full transition-[width] group-hover/launch:w-[calc(100%-6px)] group-focus-visible/launch:w-[calc(100%-6px)]", SWEEP, s.fill, t.fill)} />
      <span aria-hidden data-launch-dot className={cn("relative grid flex-none place-items-center rounded-full bg-pink text-accent-fg transition-transform", SWEEP, s.disc)}>
        <LaunchPending>
          <svg viewBox="0 0 24 24" className="size-[1em]" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 12h14.5M13 6.5 18.5 12 13 17.5" />
          </svg>
        </LaunchPending>
      </span>
      <span className={cn("relative grow text-center transition-colors duration-320 ease-[ease] motion-reduce:transition-none", s.label, t.label)}>{children}</span>
    </LaunchLink>
  );
}
