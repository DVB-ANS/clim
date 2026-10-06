"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { stormParticles, stormPositions } from "@/lib/desk";
import { canvasTokens } from "./canvasTokens";

/** What the desk says at the moment of launch, shown while the app opens (no fake waiting). */
export type BootValues = { block?: number; seq?: number; sources?: number; sigmaPct?: number; feeBp?: number; mode?: string; simulated: boolean };

const LaunchContext = createContext<(boot: BootValues) => void>(() => {});
export const useLaunch = () => useContext(LaunchContext);

const PARTICLES = stormParticles(1400, 7);
const ZOOM_MS = 1000;

/**
 * "Launch app": Ventriloc's Brass page transition. The storm zooms into its eye while the boot lines
 * name the live block, report and quote, then /app opens and the panel fades out. Lives in the root
 * layout so it survives the navigation.
 */
export function LaunchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [boot, setBoot] = useState<BootValues | null>(null);
  const [leaving, setLeaving] = useState(false);

  const launch = useCallback(
    (b: BootValues) => {
      router.prefetch("/app");
      setLeaving(false);
      setBoot(b);
    },
    [router],
  );

  // Once /app is on screen, fade the panel out.
  useEffect(() => {
    if (!boot || path !== "/app") return;
    const fade = setTimeout(() => setLeaving(true), 120);
    const done = setTimeout(() => setBoot(null), 520);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [boot, path]);

  return (
    <LaunchContext.Provider value={launch}>
      {children}
      {boot ? <LaunchOverlay boot={boot} leaving={leaving} onOpen={() => router.push("/app")} /> : null}
    </LaunchContext.Provider>
  );
}

function LaunchOverlay({ boot, leaving, onOpen }: { boot: BootValues; leaving: boolean; onOpen: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState(0);
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
    const lines = [setTimeout(() => setStep(1), 120), setTimeout(() => setStep(2), 380), setTimeout(() => setStep(3), 640)];
    const go = setTimeout(open, reduce ? 300 : ZOOM_MS);
    const c = ref.current;
    const g = c?.getContext("2d");
    let raf = 0;
    if (c && g && !reduce) {
      const k = canvasTokens(c);
      const t0 = performance.now();
      const draw = (now: number) => {
        const p = Math.min(1, (now - t0) / ZOOM_MS);
        const e = p * p * (3 - 2 * p);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        g.clearRect(0, 0, w, h);
        const R = Math.min(w, h) * 0.42 * (1 + 7 * e * e), cx = w * 0.62, cy = h * 0.45;
        for (const [x, y, r] of stormPositions(PARTICLES, e * 2.4, 1.2)) {
          const px = cx + x * R, py = cy + y * R;
          if (px < -8 || py < -8 || px > w + 8 || py > h + 8) continue;
          const s = (2 + 5 * e * (1 - r)) * dpr;
          g.fillStyle = r < 0.2 ? k.ember : k.ivory;
          g.globalAlpha = r < 0.2 ? 0.95 : 0.75 - 0.3 * e;
          g.fillRect(px, py, s, s);
        }
        g.globalAlpha = 1;
        if (p < 1) raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    }
    return () => {
      lines.forEach(clearTimeout);
      clearTimeout(go);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  const fmt = (x: number | undefined, d: number) => (x === undefined ? "…" : x.toFixed(d));
  const rows = [
    `Connecting to Ethereum Sepolia${boot.block ? ` · block ${boot.block.toLocaleString("en-US")}` : ""}`,
    `RiskDesk.state() · report #${boot.seq ?? "…"} · ${boot.sources ?? "…"}/4 venues · σ ${fmt(boot.sigmaPct, 1)} %/yr`,
    `ClimHook.quoteFee() · ${fmt(boot.feeBp, 2)} bp · ${boot.mode ?? "…"}${boot.simulated ? " · simulated" : ""}`,
  ];
  return (
    <div
      role="status"
      aria-live="polite"
      onClick={open}
      className={`fixed inset-0 z-[100] cursor-pointer bg-brass text-surface transition-opacity duration-300 ${leaving ? "opacity-0" : "opacity-100"}`}
    >
      <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />
      <div className="absolute bottom-[12vh] left-4 right-4 mx-auto max-w-6xl md:left-8">
        <p className="font-display text-[40px] leading-none tracking-[-0.03em]">
          clim<span className="text-ember">°</span>
        </p>
        <ol className="mt-6 space-y-1.5 text-[15px] md:text-[17px]">
          {rows.map((r, i) => (
            <li key={r} className={`tabular-nums transition-all duration-300 ${step > i ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}>
              {r}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
