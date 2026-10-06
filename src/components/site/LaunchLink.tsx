"use client";

import Link, { useLinkStatus } from "next/link";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A real link to /app tagged with the "launch" transition type: the button blooms into the app
 * (globals.css, "Launch transition"). On click it hands its box and its rounding to that CSS, and the
 * pink wave's origin: its [data-launch-dot] element when it has one (LaunchButton's pink disc), else a
 * point at its centre. A modified click opens a new tab as usual, and browsers without view
 * transitions simply navigate.
 */
export function LaunchLink({ className, style, children, ...rest }: { className: string; style?: CSSProperties; children: ReactNode; "aria-label"?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dot = e.currentTarget.querySelector("[data-launch-dot]")?.getBoundingClientRect() ?? r;
    const radius = parseFloat(getComputedStyle(e.currentTarget).borderTopLeftRadius) || 0;
    const s = document.documentElement.style;
    s.setProperty("--launch-t", `${r.top}px`);
    s.setProperty("--launch-l", `${r.left}px`);
    s.setProperty("--launch-r", `${r.right}px`);
    s.setProperty("--launch-b", `${r.bottom}px`);
    s.setProperty("--launch-rad", `${Math.min(radius, r.height / 2)}px`);
    // the disc's own box (a point at the centre for a link without one): the pink starts as the disc
    const disc = dot === r ? { top: r.top + r.height / 2, left: r.left + r.width / 2, right: r.left + r.width / 2, bottom: r.top + r.height / 2 } : dot;
    s.setProperty("--launch-dot-t", `${disc.top}px`);
    s.setProperty("--launch-dot-l", `${disc.left}px`);
    s.setProperty("--launch-dot-r", `${disc.right}px`);
    s.setProperty("--launch-dot-b", `${disc.bottom}px`);
  };
  return (
    <Link href="/app" transitionTypes={["launch"]} onClick={onClick} className={className} style={style} {...rest}>
      {children}
    </Link>
  );
}

/**
 * Inside a LaunchLink: shows `children` (the idle mark, e.g. an arrow) until a navigation has been
 * pending for 100 ms (next dev compiling /app, a cold server), then a spinning 2 px ring in its place,
 * a still dot under reduced motion. Both layers stay mounted and only fade, so nothing shifts, and a
 * fast navigation never flashes the ring (the useLinkStatus docs' "fast navigation" pattern).
 */
export function LaunchPending({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return (
    <span className="grid place-items-center">
      <span className={cn("col-start-1 row-start-1 grid place-items-center transition-opacity duration-150", pending ? "opacity-0 delay-100" : "opacity-100")}>
        {children}
      </span>
      <span aria-hidden className={cn("col-start-1 row-start-1 grid place-items-center transition-opacity duration-150", pending ? "opacity-100 delay-100" : "opacity-0")}>
        <span className="size-[0.8em] rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin motion-reduce:hidden" />
        <span className="hidden size-[0.36em] rounded-full bg-current motion-reduce:block" />
      </span>
    </span>
  );
}
