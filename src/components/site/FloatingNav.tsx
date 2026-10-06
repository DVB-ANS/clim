// Floating pill after Aceternity UI's "Floating Navbar" (https://ui.aceternity.com/components/floating-navbar)
// and ObsidianUI's Spotlight Navigation marker (MIT): patterns only, re-implemented, no code copied.

"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { LaunchButton } from "./LaunchButton";
import { ProgressDegree, SectionLabel, useActiveSection } from "./ScrollRing";

const ITEMS = [
  { id: "problem", label: "Problem" },
  { id: "how", label: "How it works" },
  { id: "safety", label: "Safe modes" },
  { id: "pools", label: "Pools" },
  { id: "learn", label: "Learn" },
] as const;

/**
 * The landing's only top bar, absent over the hero so it stays clean: once the hero has scrolled
 * away, a solid white pill slides in with the wordmark (its degree sign fills with the reading
 * progress), the sections (a pink marker glides under the one being read; below lg, just its name)
 * and Launch app. Hidden, it is inert: out of the tab order and of the accessibility tree.
 */
export function FloatingNav() {
  const [shown, setShown] = useState(false);
  const active = useActiveSection(ITEMS);

  useEffect(() => {
    const end = document.getElementById("hero-end");
    if (!end) return;
    const io = new IntersectionObserver(([e]) => setShown(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(end);
    return () => io.disconnect();
  }, []);

  return (
    <motion.nav
      aria-label="Sections"
      inert={!shown}
      initial={false}
      animate={shown ? { y: 0, opacity: 1 } : { y: -24, opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn("fixed inset-x-0 top-4 z-50 mx-auto w-fit max-w-[calc(100%-24px)]", !shown && "pointer-events-none")}
    >
      <div className="flex items-center gap-1 rounded-full bg-surface py-1.5 pl-4 pr-1.5 shadow-[0_0_0_1px_var(--clim-line)]">
        <a
          href="#top"
          aria-label="clim, back to top"
          className="flex items-start gap-px rounded-sm pr-1 font-display text-[22px] leading-none tracking-[-0.03em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          clim
          <ProgressDegree className="mt-0.5 size-[11px]" />
        </a>
        <ul className="hidden items-center lg:flex">
          {ITEMS.map((item) => {
            const current = active?.id === item.id;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={current ? "location" : undefined}
                  className={cn(
                    "relative block rounded-full px-3 py-2 text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                    current ? "text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {item.label}
                  {current ? <motion.span layoutId="nav-marker" aria-hidden className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-pink" /> : null}
                </a>
              </li>
            );
          })}
        </ul>
        <SectionLabel label={active?.label} aria-live="off" className="px-2 text-[15px] text-fg-muted max-[359px]:hidden lg:hidden" />
        <span aria-hidden className="mx-1.5 h-6 w-px bg-line" />
        <LaunchButton size="sm">Launch app</LaunchButton>
      </div>
    </motion.nav>
  );
}
