// Unit conventions shared with contracts/ and cre/ (see shared/src/units.ts).
// sigmaE9 = per-sqrt-second volatility x 1e9; 1 bp = 100 pips; MAX_LP_FEE = 1,000,000 pips.

export const SECONDS_PER_YEAR = 31_536_000;
export const SQRT_SECONDS_PER_YEAR = Math.sqrt(SECONDS_PER_YEAR);
export const PIPS_PER_BP = 100;
const LN_TICK_BASE = Math.log(1.0001);

export function sigmaE9ToAnnualPct(sigmaE9: number): number {
  return (sigmaE9 / 1e9) * SQRT_SECONDS_PER_YEAR * 100;
}

export function annualPctToSigmaE9(pct: number): number {
  return Math.round((pct / 100 / SQRT_SECONDS_PER_YEAR) * 1e9);
}

export function pipsToBp(pips: number): number {
  return pips / PIPS_PER_BP;
}

export function dvolE2ToPct(dvolE2: number): number {
  return dvolE2 / 100;
}

/** Pool price of token0 in token1 is 1.0001^tick (tETH and tUSD both have 18 decimals). */
export function tickToEthUsd(tick: number, token0IsEth: boolean): number {
  return Math.exp((token0IsEth ? tick : -tick) * LN_TICK_BASE);
}

export function ethUsdToTick(price: number, token0IsEth: boolean): number {
  const t = Math.round(Math.log(price) / LN_TICK_BASE);
  return token0IsEth ? t : -t;
}

export function formatBp(bp: number, digits = 1): string {
  return `${bp.toFixed(digits)} bp`;
}

export function formatPct(pct: number, digits = 1): string {
  return `${pct.toFixed(digits)}%`;
}

export function formatUsd(x: number): string {
  const s = Math.abs(x).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${x < 0 ? "-" : ""}$${s}`;
}

export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3_600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(s / 3_600)} h ${Math.floor((s % 3_600) / 60)} min`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}
