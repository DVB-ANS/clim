// Adapted from Rare UI "Gooey Nav" (https://rareui.com), github.com/swamimalode07/rare-ui at commit 53956741 — MIT License, Copyright (c) 2026 Swami Malode (the licence in force at that commit). Full text in THIRD_PARTY_NOTICES.md.

"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { cn } from "@/lib/cn";

// the duration picker's spring, damped so nothing overshoots
const SPRING = { type: "spring", stiffness: 200, damping: 28, mass: 1 } as const;

// the neck has thinned to nothing by the time the gap is this far open
const NECK_BREAK = 0.22;

// nominal viewBox height; the svg stretches to whatever the tile actually is
const NECK_H = 100;

const FADE_IN = "transition-colors duration-[400ms] motion-reduce:transition-none";
const FADE_OUT = "transition-colors duration-0";

// the inactive necks fill with currentColor, so BAR_TEXT must stay the same colour as BAR
const BAR = "bg-surface-2";
const BAR_TEXT = "text-surface-2";

const SIZES = {
  xs: {
    label: "gap-1 px-2 py-1.5 text-[11px] leading-4 [&_svg]:size-[11px]",
    radius: 8,
    separation: 14,
  },
  sm: {
    label: "gap-1.5 px-3.5 py-2 text-xs leading-4 [&_svg]:size-3",
    radius: 10,
    separation: 16,
  },
  md: {
    label: "gap-2 px-5 py-2.5 text-sm leading-5 [&_svg]:size-3.5",
    radius: 12,
    separation: 20,
  },
  lg: {
    label: "gap-2.5 px-6 py-3 text-base leading-6 [&_svg]:size-4",
    radius: 14,
    separation: 24,
  },
} as const;

/** Tile sizes, from 11 px to 16 px labels. */
export type GooeyNavSize = keyof typeof SIZES;

type NavItem = { label: string; href?: string; icon?: ReactNode };

/** A label alone (a button), or a label with an optional href (a link matched to the route) and icon. */
export type GooeyNavItem = string | NavItem;

const toItem = (item: GooeyNavItem): NavItem =>
  typeof item === "string" ? { label: item } : item;

/** Props of GooeyNav: a nav element's own props plus the items and the controlled/uncontrolled index. */
export type GooeyNavProps = Omit<ComponentProps<"nav">, "onChange"> & {
  items: GooeyNavItem[];
  value?: number;
  defaultValue?: number;
  onChange?: (index: number) => void;
  size?: GooeyNavSize;
  /** Any CSS colour, var() included (the gradient stops take it through style). */
  activeColor?: string;
  activeLabelColor?: string;
  separation?: number;
  radius?: number;
};

// two concave curves pinching toward the middle, drawn in the gap the tiles leave
function neckPath(gap: number, span: number) {
  // a NaN or negative span would otherwise emit a path full of NaN coordinates
  if (!Number.isFinite(gap) || !Number.isFinite(span) || gap <= 0 || span <= 0) {
    return "";
  }
  const waist = NECK_H * (1 - gap / (span * NECK_BREAK));
  if (waist <= 0) return "";
  const start = span - gap;
  const mid = start + gap / 2;
  return `M${start} 0 Q${mid} ${NECK_H - waist} ${span} 0 L${span} ${NECK_H} Q${mid} ${waist} ${start} ${NECK_H} Z`;
}

type SegmentProps = {
  gap: number;
  span: number;
  hasSeam: boolean;
  leftFill: string;
  rightFill: string;
  reduced: boolean;
  radii: Record<string, number>;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

function Segment({
  gap,
  span,
  hasSeam,
  leftFill,
  rightFill,
  reduced,
  radii,
  className,
  style,
  children,
}: SegmentProps) {
  const marginLeft = useSpring(gap, SPRING);
  const gradientId = `gooey-neck-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    if (reduced) marginLeft.jump(gap);
    else marginLeft.set(gap);
  }, [gap, marginLeft, reduced]);

  const d = useTransform(marginLeft, (g) => neckPath(g, span));

  return (
    <motion.li
      data-slot="gooey-nav-segment"
      className={cn("relative", className)}
      style={{ ...style, marginLeft }}
      initial={false}
      animate={radii}
      transition={reduced ? { duration: 0 } : SPRING}
    >
      {hasSeam && (
        <svg
          aria-hidden
          width={span}
          viewBox={`0 0 ${span} ${NECK_H}`}
          preserveAspectRatio="none"
          className={cn(
            "pointer-events-none absolute top-0 right-full h-full",
            BAR_TEXT,
          )}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="1">
              {/* the stop-color property, not the attribute: only the property resolves var() */}
              <stop offset="0" style={{ stopColor: leftFill }} />
              <stop offset="1" style={{ stopColor: rightFill }} />
            </linearGradient>
          </defs>
          <motion.path d={d} fill={`url(#${gradientId})`} />
        </svg>
      )}
      {children}
    </motion.li>
  );
}

type NavLabelProps = NavItem & {
  isActive: boolean;
  size: GooeyNavSize;
  activeLabelColor: string;
  onSelect: () => void;
};

function NavLabel({
  label,
  href,
  icon,
  isActive,
  size,
  activeLabelColor,
  onSelect,
}: NavLabelProps) {
  const props = {
    "data-slot": "gooey-nav-item",
    "data-active": isActive,
    "aria-current": isActive ? (href ? "page" : true) : undefined,
    className: cn(
      // the ring follows the tile's corners and rises above the neighbouring tiles
      "relative flex cursor-pointer items-center whitespace-nowrap rounded-[inherit] font-normal [&_svg]:shrink-0",
      "focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      isActive ? FADE_IN : FADE_OUT,
      SIZES[size].label,
      !isActive && "text-fg-muted hover:text-fg",
    ),
    style: isActive ? { color: activeLabelColor } : undefined,
    onClick: (e: MouseEvent<HTMLElement>) => {
      // a link opened in a new tab or window leaves this page where it is
      if (href && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
      onSelect();
    },
  } as const;

  return href ? (
    <Link href={href} {...props}>
      {icon}
      {label}
    </Link>
  ) : (
    <button type="button" {...props}>
      {icon}
      {label}
    </button>
  );
}

/**
 * A segmented pill nav: the selected tile splits from the group on a spring, a gooey neck stretches
 * and snaps between the tiles, and the tile fills with activeColor. Link items follow the route
 * (exact match), button items follow value/onChange. The strip scrolls sideways when it is too wide.
 */
export function GooeyNav({
  items,
  value,
  defaultValue = 0,
  onChange,
  size = "md",
  activeColor = "var(--clim-accent)",
  activeLabelColor = "var(--clim-accent-fg)",
  separation,
  radius,
  className,
  ...props
}: GooeyNavProps) {
  const pathname = usePathname();
  const reduced = useReducedMotion() ?? false;
  const scroller = useRef<HTMLDivElement>(null);
  const scrolledOnce = useRef(false);

  const routeIndex = items.findIndex((item) => toItem(item).href === pathname);
  const [uncontrolled, setUncontrolled] = useState(() =>
    routeIndex === -1 ? defaultValue : routeIndex,
  );
  const [seenRoute, setSeenRoute] = useState(routeIndex);

  // in render, not an effect: an effect here cascades renders
  if (routeIndex !== seenRoute) {
    setSeenRoute(routeIndex);
    if (routeIndex !== -1 && value === undefined) setUncontrolled(routeIndex);
  }

  // a page outside the nav (/credits) lights no tile, even after a client-side visit to one that is
  const active = value ?? (routeIndex === -1 ? -1 : uncontrolled);
  const span = separation ?? SIZES[size].separation;
  const corner = radius ?? SIZES[size].radius;

  // when the strip scrolls (a phone), keep the active tile in view
  useEffect(() => {
    const box = scroller.current;
    const tile = box?.querySelector<HTMLElement>('[data-slot="gooey-nav-item"][data-active="true"]');
    if (!box || !tile) return;
    const b = box.getBoundingClientRect();
    const t = tile.getBoundingClientRect();
    // the first pass (a page load straight onto a far tab) jumps; later ones glide unless motion is reduced
    const behavior = reduced || !scrolledOnce.current ? "auto" : "smooth";
    scrolledOnce.current = true;
    // span of slack: the gaps are still springing open
    if (t.left < b.left) box.scrollBy({ left: t.left - b.left - span, behavior });
    else if (t.right > b.right) box.scrollBy({ left: t.right - b.right + span, behavior });
  }, [active, reduced, span]);

  const open = (seam: number) =>
    seam === 0 ||
    seam === items.length ||
    seam - 1 === active ||
    seam === active;

  const fill = (i: number) => (i === active ? activeColor : "currentColor");

  return (
    <nav
      data-slot="gooey-nav"
      className={cn("inline-block max-w-full", className)}
      {...props}
    >
      {/* the padding keeps the focus ring inside the scroll box; the negative margin gives it back */}
      <div
        ref={scroller}
        onFocus={(e) => {
          // Tab onto a tile the strip has scrolled away (a phone): the browser leaves it clipped at the
          // edge, so bring it in with span of slack for the ring. Keyboard focus only: a click moves the
          // active tile, which the effect above already scrolls to.
          const box = scroller.current;
          const tile = (e.target as HTMLElement).closest<HTMLElement>('[data-slot="gooey-nav-item"]');
          if (!box || !tile || !tile.matches(":focus-visible")) return;
          const b = box.getBoundingClientRect();
          const t = tile.getBoundingClientRect();
          const behavior = reduced ? "auto" : "smooth";
          if (t.left < b.left + span) box.scrollBy({ left: t.left - b.left - span, behavior });
          else if (t.right > b.right - span) box.scrollBy({ left: t.right - b.right + span, behavior });
        }}
        className="-m-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex w-max items-center">
          {items.map((item, i) => {
            const navItem = toItem(item);
            const isActive = i === active;

            return (
              <Segment
                key={`${i}-${navItem.label}`}
                // closed seams pull in a pixel so no hairline shows through
                gap={i === 0 ? 0 : open(i) ? span : -1}
                span={span}
                hasSeam={i > 0}
                leftFill={fill(i - 1)}
                rightFill={fill(i)}
                reduced={reduced}
                radii={{
                  borderTopLeftRadius: open(i) ? corner : 0,
                  borderBottomLeftRadius: open(i) ? corner : 0,
                  borderTopRightRadius: open(i + 1) ? corner : 0,
                  borderBottomRightRadius: open(i + 1) ? corner : 0,
                }}
                className={cn(BAR, isActive ? FADE_IN : FADE_OUT)}
                style={{ backgroundColor: isActive ? activeColor : undefined }}
              >
                <NavLabel
                  {...navItem}
                  isActive={isActive}
                  size={size}
                  activeLabelColor={activeLabelColor}
                  onSelect={() => {
                    if (value === undefined) setUncontrolled(i);
                    onChange?.(i);
                  }}
                />
              </Segment>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
