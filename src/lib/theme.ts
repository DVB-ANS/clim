import { FeeMode } from "./feeMath";

// Chart and status colours: one colour per entity, the same on every chart (Chainlink Blue for V,
// gray dashed for S, Uniswap pink for sigma). The values are the design tokens of
// src/app/globals.css; this file maps roles to them, so the DA changes there without touching components.
export const COLORS = {
  V: "var(--clim-v)", // clim pool (dynamic fee), categorical slot 1
  S: "var(--clim-s)", // static twin pool, slot 2
  sigma: "var(--clim-sigma)", // desk volatility, slot 3
  muted: "var(--clim-muted)", // secondary series (DVOL, reported sigma), axes
  grid: "var(--clim-grid)",
  band: "var(--clim-band)", // P_trade simulated band (sequential blue step 100)
  ink: "var(--clim-ink)", // neutral series: predicted P_trade, ETH/USD price
  blind: "var(--clim-blind)", // blind-mode shading, drawn at low opacity
  surface: "var(--clim-surface)", // ring around highlighted dots
} as const;

export const MODE_STYLE: Record<FeeMode, { label: string; icon: string; color: string }> = {
  [FeeMode.Normal]: { label: "Normal", icon: "●", color: "var(--clim-normal)" },
  [FeeMode.Degraded]: { label: "Degraded", icon: "▲", color: "var(--clim-degraded)" },
  [FeeMode.Blind]: { label: "Blind", icon: "■", color: "var(--clim-blind)" },
};

/** Deterministic UTC clock label (same on server and client, no hydration mismatch). */
export function utcTime(t: number): string {
  return new Date(t * 1000).toISOString().slice(11, 16);
}

/** RainbowKit theme options (lightTheme): the wallet modal and button follow the tokens too. */
export const WALLET_THEME = {
  accentColor: "var(--clim-accent)",
  accentColorForeground: "var(--clim-accent-fg)",
  borderRadius: "large",
  fontStack: "system",
} as const;
