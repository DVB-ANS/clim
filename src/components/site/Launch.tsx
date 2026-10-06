"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { LcdStorm } from "./LcdStorm";

/** What the desk says at the moment of launch, shown while the app opens (no fake waiting). */
export type BootValues = { block?: number; seq?: number; sources?: number; sigmaPct?: number; feeBp?: number; mode?: string; simulated: boolean };

const LaunchContext = createContext<(boot: BootValues) => void>(() => {});
export const useLaunch = () => useContext(LaunchContext);

/** The CL-1 screen the launch zooms into: the hero card marks it with this attribute. */
export const LAUNCH_ORIGIN = "data-launch-origin";
const ZOOM_MS = 1100;
// where the storm's eye sits in an LcdStorm canvas (cx = 0.62 w, cy = 0.5 h)
const EYE = { x: 0.62, y: 0.5 };

type Origin = { left: number; top: number; width: number; height: number };

/** The CL-1 screen's box if it is on screen, else a small screen in the middle of the window. */
function originBox(): Origin {
  const el = document.querySelector(`[${LAUNCH_ORIGIN}]`);
  const r = el?.getBoundingClientRect();
  if (r && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight) return { left: r.left, top: r.top, width: r.width, height: r.height };
  const width = Math.min(360, window.innerWidth * 0.6), height = width * 0.5625;
  return { left: (window.innerWidth - width) / 2, top: (window.innerHeight - height) / 2, width, height };
}

/**
 * "Launch app": the page zooms into the CL-1's screen. A copy of the screen sits exactly over the
 * hero's, then grows around the storm's eye (a compositor transform, so it stays fluid) while the
 * desk's dark ground fills the window; the app, which wears the same dark ground, opens underneath
 * and the screen fades. Lives in the root layout so it survives the navigation.
 */
export function LaunchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [run, setRun] = useState<{ boot: BootValues; origin: Origin; sigmaPct: number } | null>(null);
  const [leaving, setLeaving] = useState(false);

  const launch = useCallback(
    (boot: BootValues) => {
      router.prefetch("/app");
      setLeaving(false);
      setRun({ boot, origin: originBox(), sigmaPct: boot.sigmaPct ?? 40 });
    },
    [router],
  );

  // Once /app is on screen, let the zoom finish its last frames, then fade the screen out.
  useEffect(() => {
    if (!run || path !== "/app") return;
    const fade = setTimeout(() => setLeaving(true), 160);
    const done = setTimeout(() => setRun(null), 700);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [run, path]);

  return (
    <LaunchContext.Provider value={launch}>
      {children}
      {run ? <LaunchZoom {...run} leaving={leaving} onOpen={() => router.push("/app")} /> : null}
    </LaunchContext.Provider>
  );
}

function LaunchZoom({ boot, origin, sigmaPct, leaving, onOpen }: { boot: BootValues; origin: Origin; sigmaPct: number; leaving: boolean; onOpen: () => void }) {
  const screen = useRef<HTMLDivElement>(null);
  const ground = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState(false);
  const opened = useRef(false);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });
  const open = useCallback(() => {
    if (!opened.current) {
      opened.current = true;
      onOpenRef.current();
    }
  }, []);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = [setTimeout(() => setLines(true), reduce ? 0 : ZOOM_MS * 0.55), setTimeout(open, reduce ? 250 : ZOOM_MS * 0.7)];
    const anims: Animation[] = [];
    if (!reduce && screen.current && ground.current) {
      const vw = window.innerWidth, vh = window.innerHeight;
      const eyeX = origin.left + EYE.x * origin.width, eyeY = origin.top + EYE.y * origin.height;
      // enough zoom for the eye wall to fill the window
      const scale = (Math.max(vw, vh) / origin.height) * 2.6;
      const easing = "cubic-bezier(0.7, 0, 0.25, 1)";
      anims.push(
        screen.current.animate(
          [
            { transform: "translate(0px, 0px) scale(1)", borderRadius: "8px" },
            { transform: `translate(${vw / 2 - eyeX}px, ${vh / 2 - eyeY}px) scale(${scale})`, borderRadius: "0px" },
          ],
          { duration: ZOOM_MS, easing, fill: "forwards" },
        ),
        ground.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ZOOM_MS * 0.6, easing: "ease-out", fill: "forwards" }),
      );
    }
    return () => {
      timers.forEach(clearTimeout);
      anims.forEach((a) => a.cancel());
    };
  }, [open, origin]);

  const fmt = (x: number | undefined, d: number) => (x === undefined ? "…" : x.toFixed(d));
  return (
    <div
      role="status"
      aria-live="polite"
      onClick={open}
      className={`fixed inset-0 z-[100] cursor-pointer transition-opacity duration-500 ${leaving ? "opacity-0" : "opacity-100"}`}
    >
      <div ref={ground} className="absolute inset-0 bg-lcd-bg opacity-0" />
      <div
        ref={screen}
        className="absolute overflow-hidden rounded-sm will-change-transform"
        style={{ left: origin.left, top: origin.top, width: origin.width, height: origin.height, transformOrigin: `${EYE.x * 100}% ${EYE.y * 100}%` }}
      >
        <LcdStorm sigmaPct={sigmaPct} className="block h-full w-full" />
      </div>
      <ol
        className={`absolute bottom-[10vh] left-1/2 w-[min(92vw,640px)] -translate-x-1/2 space-y-1 font-lcd text-[15px] font-bold text-lcd-lit transition-opacity duration-500 md:text-[17px] ${lines ? "opacity-100" : "opacity-0"}`}
      >
        <li>ENTERING THE DESK{boot.block ? ` · BLOCK ${boot.block.toLocaleString("en-US")}` : ""}</li>
        <li>
          REPORT #{boot.seq ?? "…"} · {boot.sources ?? "…"}/4 VENUES · σ {fmt(boot.sigmaPct, 1)} %/YR
        </li>
        <li>
          QUOTEFEE() {fmt(boot.feeBp, 2)} BP · {(boot.mode ?? "…").toUpperCase()}
          {boot.simulated ? " · SIMULATED" : ""}
        </li>
      </ol>
    </div>
  );
}
