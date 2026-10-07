// TypeScript port of contracts/src/libraries/ClimFeeMath.sol and ClimHook.quoteFee().
// Used to draw the theoretical curve, to rebuild the fee step series from RiskReported logs,
// and to run the app on mock data. The hook on-chain stays the source of truth.

export const FLAG_DEGRADED = 1; // bit 0, set by RiskDesk when dispBp > 25
export const FLAG_REPLAY = 2; // bit 1, set at construction on replay desks

export const FeeMode = { Normal: 0, Degraded: 1, Blind: 2 } as const;
export type FeeMode = (typeof FeeMode)[keyof typeof FeeMode];

export type FeeParams = {
  etaE4: number;
  sqrtHalfDtE6: number;
  feeMinPips: number;
  feeMaxPips: number;
  feeSafePips: number;
  tauKillSec: number;
};

export type DeskState = { tObs: number; sigmaE9: number; kE4: number; flags: number; seq: number };

export type Quote = { feePips: number; mode: FeeMode };

/** k = 1: the desk's neutral model-risk multiplier (kE4 runs from 10,000 to 20,000); this build always sends it. */
export const K_E4_NEUTRAL = 10_000;

/** sigmaE9 · etaE4 · sqrtHalfDtE6 · kE4 carries 10^(9 + 4 + 6 + 4); fees are in pips (10^-6), so the hook divides by 10^17. */
export const FEE_SCALE_EXP = 17;

const SCALE = 10n ** BigInt(FEE_SCALE_EXP);

/** fee_pips = clamp(ceil(sigmaE9 * etaE4 * sqrtHalfDtE6 * kE4 / 1e17), feeMinPips, feeMaxPips) */
export function feePips(
  sigmaE9: number,
  etaE4: number,
  sqrtHalfDtE6: number,
  kE4: number,
  feeMinPips: number,
  feeMaxPips: number,
): number {
  const num = BigInt(sigmaE9) * BigInt(etaE4) * BigInt(sqrtHalfDtE6) * BigInt(kE4);
  const raw = Number((num + SCALE - 1n) / SCALE);
  return Math.min(feeMaxPips, Math.max(feeMinPips, raw));
}

export function quoteFee(s: DeskState, nowSec: number, p: FeeParams): Quote {
  const base = feePips(s.sigmaE9, p.etaE4, p.sqrtHalfDtE6, s.kE4, p.feeMinPips, p.feeMaxPips);
  const blind = s.seq === 0 || nowSec - s.tObs > p.tauKillSec;
  if (blind) return { feePips: Math.max(base, p.feeSafePips), mode: FeeMode.Blind };
  if ((s.flags & FLAG_DEGRADED) !== 0) return { feePips: Math.max(base, p.feeSafePips), mode: FeeMode.Degraded };
  return { feePips: base, mode: FeeMode.Normal };
}
