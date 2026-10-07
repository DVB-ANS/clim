"use client";

import Link, { useLinkStatus } from "next/link";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A real link to /app tagged with the "launch" transition type: the app opens from the disc, a circle
 * growing over the held landing (globals.css, "Launch transition"). On click it hands that CSS the
 * circle's centre, its [data-launch-dot] element's when it has one (LaunchButton's pink disc), else
 * its own centre, and the reach that covers the window's farthest corner from there. A modified click
 * opens a new tab as usual, and browsers without view transitions simply navigate.
 */
export function LaunchLink({ className, style, children, ...rest }: { className: string; style?: CSSProperties; children: ReactNode; "aria-label"?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const r = (e.currentTarget.querySelector("[data-launch-dot]") ?? e.currentTarget).getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const reach = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))) + 4;
    const s = document.documentElement.style;
    s.setProperty("--launch-x", `${x}px`);
    s.setProperty("--launch-y", `${y}px`);
    s.setProperty("--launch-reach", `${reach}px`);
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
