import { FeeMode } from "./feeMath";

// Chart and status colours: one colour per entity, the same on every chart (Chainlink Blue for V,
// gray dashed for S, Uniswap pink for sigma). The values are the design tokens of
// src/app/globals.css; this file maps roles to them, so the DA changes there without touching components.
export const COLORS = {
  V: "var(--clim-v)", // clim pool (dynamic fee), categorical slot 1
  S: "var(--clim-s)", // static twin pool, slot 2
  sigma: "var(--clim-sigma)", // desk volatility, slot 3
  pink: "var(--clim-pink)", // brand pink marks (live dots), not a data series
  muted: "var(--clim-muted)", // axes, captions on the dark CRE box
  mutedLine: "var(--clim-muted-line)", // secondary chart lines (DVOL, reported sigma): 3:1 or more on white and surface-2
  grid: "var(--clim-grid)",
  band: "var(--clim-band)", // P_trade simulated band (sequential blue step 100)
  ink: "var(--clim-ink)", // neutral series: predicted P_trade, ETH/USD price
  blind: "var(--clim-blind)", // blind-mode shading: a light fill with a solid edge, so a short spell still shows
  surface: "var(--clim-surface)", // ring around highlighted dots
} as const;

/** A chart label's ground: a surface-coloured stroke painted under the glyphs, so a series crossing the label does not cut its text. */
export const LABEL_HALO = { paintOrder: "stroke", stroke: COLORS.surface, strokeWidth: 3, strokeLinejoin: "round" } as const;

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

/** Colours set on top of lightTheme's: its modalTextSecondary, rgba(60, 66, 66, 0.6), is 3.3:1 on the white modal; fg-subtle is 5.2:1. */
export const WALLET_COLORS = {
  modalTextSecondary: "var(--clim-fg-subtle)",
} as const;
