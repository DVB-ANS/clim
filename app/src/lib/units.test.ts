import { describe, expect, it } from "vitest";
import {
  annualPctToSigmaE9,
  dvolE2ToPct,
  ethUsdToTick,
  formatAge,
  formatAmount,
  formatBp,
  formatPct,
  formatTusd,
  formatTusdCents,
  pipsToBp,
  shortHash,
  sigmaE9ToAnnualPct,
  tickToEthUsd,
} from "./units";

describe("sigma conversions", () => {
  it("48%/yr is sigmaE9 85,475 (design check value)", () => {
    expect(annualPctToSigmaE9(48)).toBe(85_475);
    expect(sigmaE9ToAnnualPct(85_475)).toBeCloseTo(48, 3);
  });
  it("10%/yr is sigmaE9 17,807 (RiskDesk SIGMA_MIN_E9)", () => {
    expect(annualPctToSigmaE9(10)).toBe(17_807);
  });
});

describe("fee units", () => {
  it("1 bp = 100 pips", () => {
    expect(pipsToBp(1_922)).toBeCloseTo(19.22, 10);
    expect(pipsToBp(500)).toBe(5);
  });
  it("formats bp with one decimal by default", () => {
    expect(formatBp(19.22)).toBe("19.2 bp");
    expect(formatBp(5, 0)).toBe("5 bp");
  });
});

describe("other units", () => {
  it("DVOL is stored x100", () => {
    expect(dvolE2ToPct(4_825)).toBe(48.25);
  });
  it("ticks round-trip with the ETH/USD price in both pool orientations", () => {
    const t = ethUsdToTick(2_500, true);
    expect(t).toBe(78_244);
    expect(tickToEthUsd(t, true)).toBeCloseTo(2_500, -1);
    expect(ethUsdToTick(2_500, false)).toBe(-78_244);
    expect(tickToEthUsd(-78_244, false)).toBeCloseTo(2_500, -1);
  });
  it("formats percent, test dollars, age and hashes", () => {
    expect(formatPct(48.04)).toBe("48.0%");
    expect(formatTusd(1234.4)).toBe("1,234 tUSD");
    expect(formatTusd(-56.7)).toBe("-57 tUSD");
    expect(formatTusd(-0.2)).toBe("0 tUSD");
    expect(formatAge(42)).toBe("42 s");
    expect(formatAge(185)).toBe("3 min 05 s");
    expect(formatAge(7_800)).toBe("2 h 10 min");
    expect(shortHash("0x7cd1bd67280cc7c7e96c3fff4e956c708043d6091972c78c9536d7711587fe63")).toBe("0x7cd1…fe63");
  });
});

describe("amounts for /swap and /lp", () => {
  it("formats token amounts with grouping and at most the given decimals", () => {
    expect(formatAmount(25_000, 2)).toBe("25,000");
    expect(formatAmount(1.234567, 4)).toBe("1.2346");
  });
  it("formats small tUSD amounts with cents, never as US dollars", () => {
    expect(formatTusdCents(0.4249)).toBe("0.42 tUSD");
    expect(formatTusdCents(-1_234.5)).toBe("-1,234.50 tUSD");
    expect(formatTusdCents(-0.001)).toBe("0.00 tUSD");
  });
});
