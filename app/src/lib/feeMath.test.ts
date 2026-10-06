import { describe, expect, it } from "vitest";
import { FeeMode, feePips, quoteFee, type DeskState, type FeeParams } from "./feeMath";

const SQRT_HALF_DT_E6 = 2_449_490; // sqrt(12 s / 2) * 1e6 (Sepolia)

describe("feePips (TS port of ClimFeeMath.feePips)", () => {
  it("matches the design check value at P* = 10% without clamping: 48%/yr -> ceil(1921.2) = 1922 pips", () => {
    expect(feePips(85_475, 91_761, SQRT_HALF_DT_E6, 10_000, 0, 1_000_000)).toBe(1_922);
  });
  it("P* = 30% (etaE4 25,093): floor 5 bp under ~46%, 11 bp at 100%, 25 bp at 225%", () => {
    expect(feePips(81_913, 25_093, SQRT_HALF_DT_E6, 10_000, 500, 15_000)).toBe(504);
    expect(feePips(44_518, 25_093, SQRT_HALF_DT_E6, 10_000, 500, 15_000)).toBe(500);
    expect(feePips(178_072, 25_093, SQRT_HALF_DT_E6, 10_000, 500, 15_000)).toBe(1_095);
    expect(feePips(400_663, 25_093, SQRT_HALF_DT_E6, 10_000, 500, 15_000)).toBe(2_463);
  });
  it("P* = 20% (etaE4 41,760): 18 bp at 100%, 41 bp at 225%, capped at 150 bp", () => {
    expect(feePips(178_072, 41_760, SQRT_HALF_DT_E6, 10_000, 500, 15_000)).toBe(1_822);
    expect(feePips(400_663, 41_760, SQRT_HALF_DT_E6, 10_000, 500, 15_000)).toBe(4_099);
    expect(feePips(1_780_724, 41_760, SQRT_HALF_DT_E6, 10_000, 500, 15_000)).toBe(15_000);
  });
  it("k = 2 doubles the raw fee before clamping", () => {
    expect(feePips(178_072, 25_093, SQRT_HALF_DT_E6, 20_000, 500, 15_000)).toBe(2_190);
  });
  it("sigma 0 gives the floor", () => {
    expect(feePips(0, 25_093, SQRT_HALF_DT_E6, 10_000, 500, 15_000)).toBe(500);
  });
});

describe("quoteFee (TS port of ClimHook.quoteFee)", () => {
  const p: FeeParams = {
    etaE4: 41_760,
    sqrtHalfDtE6: SQRT_HALF_DT_E6,
    feeMinPips: 500,
    feeMaxPips: 15_000,
    feeSafePips: 3_000,
    tauKillSec: 180,
  };
  const fresh: DeskState = { tObs: 1_000, sigmaE9: 178_072, kE4: 10_000, flags: 0, seq: 7 };

  it("normal mode returns the formula fee", () => {
    expect(quoteFee(fresh, 1_100, p)).toEqual({ feePips: 1_822, mode: FeeMode.Normal });
  });
  it("age exactly tauKillSec is still normal", () => {
    expect(quoteFee(fresh, 1_180, p).mode).toBe(FeeMode.Normal);
  });
  it("age above tauKillSec is blind: max(fee, feeSafe)", () => {
    expect(quoteFee(fresh, 1_181, p)).toEqual({ feePips: 3_000, mode: FeeMode.Blind });
    const storm = { ...fresh, sigmaE9: 400_663 };
    expect(quoteFee(storm, 1_181, p)).toEqual({ feePips: 4_099, mode: FeeMode.Blind });
  });
  it("a desk that never reported is blind at feeSafe", () => {
    const never: DeskState = { tObs: 0, sigmaE9: 0, kE4: 0, flags: 0, seq: 0 };
    expect(quoteFee(never, 1_000, p)).toEqual({ feePips: 3_000, mode: FeeMode.Blind });
  });
  it("degraded flag (bit 0) raises the fee to at least feeSafe", () => {
    expect(quoteFee({ ...fresh, flags: 1 }, 1_100, p)).toEqual({ feePips: 3_000, mode: FeeMode.Degraded });
  });
  it("replay flag (bit 1) alone does not change the fee", () => {
    expect(quoteFee({ ...fresh, flags: 2 }, 1_100, p)).toEqual({ feePips: 1_822, mode: FeeMode.Normal });
  });
  it("a report up to 30 s in the future (MAX_SKEW) is not blind", () => {
    expect(quoteFee({ ...fresh, tObs: 1_030 }, 1_000, p).mode).toBe(FeeMode.Normal);
  });
});
