import { describe, expect, test } from "bun:test";
import {
  annualSigmaToSigmaE9,
  bpToPips,
  etaE4FromPStar,
  FeeMode,
  feePips,
  pipsToBp,
  pTradeFromEtaE4,
  quoteFeeMirror,
  sigmaE9ToAnnual,
  sqrtHalfDtE6FromBlockTime,
  type HookParams,
} from "../src/units";

describe("sigma conversions", () => {
  test("annual sigma -> sigmaE9 (per sqrt second * 1e9, rounded)", () => {
    expect(annualSigmaToSigmaE9(0.1)).toBe(17_807);
    expect(annualSigmaToSigmaE9(0.25)).toBe(44_518);
    expect(annualSigmaToSigmaE9(0.48)).toBe(85_475);
    expect(annualSigmaToSigmaE9(1.0)).toBe(178_072);
    expect(annualSigmaToSigmaE9(2.25)).toBe(400_663);
  });
  test("sigmaE9 -> annual sigma", () => {
    expect(sigmaE9ToAnnual(85_475)).toBeCloseTo(0.48, 5);
    expect(sigmaE9ToAnnual(17_807)).toBeCloseTo(0.1, 5);
  });
  test("rejects negative or non-finite sigma", () => {
    expect(() => annualSigmaToSigmaE9(-0.1)).toThrow(RangeError);
    expect(() => annualSigmaToSigmaE9(Number.NaN)).toThrow(RangeError);
  });
});

describe("fee units", () => {
  test("pips <-> bp (1 bp = 100 pips)", () => {
    expect(pipsToBp(1_922)).toBe(19.22);
    expect(bpToPips(5)).toBe(500);
    expect(bpToPips(19.22)).toBe(1_922);
  });
  test("eta from P* uses the fixed-block constant 0.824", () => {
    expect(etaE4FromPStar(0.2)).toBe(41_760);
    expect(etaE4FromPStar(0.3)).toBe(25_093);
    expect(pTradeFromEtaE4(41_760)).toBeCloseTo(0.2, 9);
    expect(() => etaE4FromPStar(0)).toThrow(RangeError);
    expect(() => etaE4FromPStar(1)).toThrow(RangeError);
  });
  test("sqrt(blockTime/2) * 1e6 for Sepolia 12 s blocks", () => {
    expect(sqrtHalfDtE6FromBlockTime(12)).toBe(2_449_490);
  });
});

describe("feePips mirrors ClimFeeMath.feePips (ceil, then clamp)", () => {
  const SQ = 2_449_490;
  const K1 = 10_000;
  const cases: Array<[string, number, number, number, number, number, number, number]> = [
    // label, sigmaE9, etaE4, sqrtHalfDtE6, kE4, min, max, expected
    ["48%/yr, P*=10% (old calibration), unclamped", 85_475, 91_761, SQ, K1, 0, 1_000_000, 1_922],
    ["25%/yr, P*=10% (old calibration), unclamped", 44_518, 91_761, SQ, K1, 0, 1_000_000, 1_001],
    ["100%/yr, P*=20%", 178_072, 41_760, SQ, K1, 500, 15_000, 1_822],
    ["225%/yr, P*=20%", 400_663, 41_760, SQ, K1, 500, 15_000, 4_099],
    ["100%/yr, P*=30%", 178_072, 25_093, SQ, K1, 500, 15_000, 1_095],
    ["225%/yr, P*=30%", 400_663, 25_093, SQ, K1, 500, 15_000, 2_463],
    ["46%/yr, P*=30% (just above the 5 bp floor)", 81_913, 25_093, SQ, K1, 500, 15_000, 504],
    ["27%/yr, P*=20% (raw 492 -> floor 500)", 48_080, 41_760, SQ, K1, 500, 15_000, 500],
    ["sigma 0 -> floor", 0, 41_760, SQ, K1, 500, 15_000, 500],
    ["SIGMA_MAX (1000%/yr), P*=20% (raw 18216 -> cap)", 1_780_730, 41_760, SQ, K1, 500, 15_000, 15_000],
    ["k = 2.0 doubles the raw fee", 178_072, 25_093, SQ, 20_000, 500, 15_000, 2_190],
    ["exact division: no rounding up", 10_000, 10_000, 1_000_000, 10_000, 0, 1_000_000, 10],
    ["any remainder rounds up", 10_001, 10_000, 1_000_000, 10_000, 0, 1_000_000, 11],
  ];
  for (const [label, s, e, sq, k, min, max, expected] of cases) {
    test(label, () => {
      expect(feePips(s, e, sq, k, min, max)).toBe(expected);
    });
  }
  test("rejects non-integers, negatives and min > max", () => {
    expect(() => feePips(1.5, 41_760, SQ, K1, 500, 15_000)).toThrow(RangeError);
    expect(() => feePips(-1, 41_760, SQ, K1, 500, 15_000)).toThrow(RangeError);
    expect(() => feePips(1, 41_760, SQ, K1, 15_000, 500)).toThrow(RangeError);
  });
});

describe("quoteFeeMirror mirrors ClimHook.quoteFee", () => {
  const p: HookParams = {
    etaE4: 41_760,
    sqrtHalfDtE6: 2_449_490,
    feeMinPips: 500,
    feeMaxPips: 15_000,
    feeSafePips: 3_000,
    tauKillSec: 180,
  };
  const t = 1_791_280_000;
  test("never reported -> blind at feeSafe", () => {
    expect(quoteFeeMirror({ tObs: 0, sigmaE9: 0, kE4: 0, flags: 0, seq: 0 }, p, t)).toEqual({ fee: 3_000, mode: FeeMode.Blind });
  });
  test("fresh report -> normal fee", () => {
    expect(quoteFeeMirror({ tObs: t - 30, sigmaE9: 178_072, kE4: 10_000, flags: 0, seq: 7 }, p, t)).toEqual({ fee: 1_822, mode: FeeMode.Normal });
  });
  test("tObs slightly in the future (allowed skew) -> normal, no underflow", () => {
    expect(quoteFeeMirror({ tObs: t + 20, sigmaE9: 178_072, kE4: 10_000, flags: 0, seq: 7 }, p, t).mode).toBe(FeeMode.Normal);
  });
  test("degraded flag -> max(fee, feeSafe)", () => {
    expect(quoteFeeMirror({ tObs: t, sigmaE9: 178_072, kE4: 10_000, flags: 1, seq: 7 }, p, t)).toEqual({ fee: 3_000, mode: FeeMode.Degraded });
    expect(quoteFeeMirror({ tObs: t, sigmaE9: 400_663, kE4: 10_000, flags: 1, seq: 7 }, p, t)).toEqual({ fee: 4_099, mode: FeeMode.Degraded });
  });
  test("replay flag alone does not change the fee", () => {
    expect(quoteFeeMirror({ tObs: t, sigmaE9: 178_072, kE4: 10_000, flags: 2, seq: 7 }, p, t)).toEqual({ fee: 1_822, mode: FeeMode.Normal });
  });
  test("stale desk: strictly more than tauKill seconds -> blind", () => {
    expect(quoteFeeMirror({ tObs: t - 180, sigmaE9: 178_072, kE4: 10_000, flags: 0, seq: 7 }, p, t).mode).toBe(FeeMode.Normal);
    expect(quoteFeeMirror({ tObs: t - 181, sigmaE9: 178_072, kE4: 10_000, flags: 0, seq: 7 }, p, t)).toEqual({ fee: 3_000, mode: FeeMode.Blind });
    expect(quoteFeeMirror({ tObs: t - 181, sigmaE9: 400_663, kE4: 10_000, flags: 1, seq: 7 }, p, t)).toEqual({ fee: 4_099, mode: FeeMode.Blind });
  });
});
