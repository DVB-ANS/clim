import { describe, expect, it } from "vitest";
import { FeeMode } from "./feeMath";
import { blocksSpan, feeRegimes, grouped, niceMax, pnlCaveat, pnlSentence, relativePct, scalePct, signed, spanLabel, utcClock, utcDay, utcSpan, utcStamp } from "./ledger";

describe("niceMax: the end of the volatility scale", () => {
  it("is the smallest step at least 1.1 times the largest reading", () => {
    expect(niceMax(47.5)).toBe(75); // 52.25 needs 75
    expect(niceMax(45)).toBe(50); // 49.5 fits under 50
    expect(niceMax(21.5)).toBe(25);
    expect(niceMax(90)).toBe(100); // 99
    expect(niceMax(91)).toBe(150); // 100.1
    expect(niceMax(295.7)).toBe(500);
    expect(niceMax(1_000)).toBe(1_500); // the desk's ceiling, 1,000% a year
  });
  it("falls back to the first step without a reading, and rounds up past the last step", () => {
    expect(niceMax(Number.NaN)).toBe(25);
    expect(niceMax(0)).toBe(25);
    expect(niceMax(-3)).toBe(25);
    expect(niceMax(1_400)).toBe(2_000);
  });
  it("places a reading on the scale, inside the track", () => {
    expect(scalePct(37.5, 75)).toBe(50);
    expect(scalePct(120, 75)).toBe(100);
    expect(scalePct(Number.NaN, 75)).toBe(0);
  });
});

describe("signed: the ledger's amounts", () => {
  it("writes a plus or a true minus sign, with en-US grouping", () => {
    expect(signed(971.4)).toBe("+971");
    expect(signed(-409.2)).toBe("−409");
    expect(signed(-1_234_567)).toBe("−1,234,567");
    expect(signed(47.06, 1)).toBe("+47.1");
  });
  it("writes a bare 0 when the amount rounds to zero, and n/a when there is none", () => {
    expect(signed(0)).toBe("0");
    expect(signed(-0.4)).toBe("0");
    expect(signed(0.04, 1)).toBe("0.0");
    expect(signed(Number.NaN)).toBe("n/a");
  });
  it("groups unsigned activity amounts", () => {
    expect(grouped(5_277_839.4)).toBe("5,277,839");
  });
});

describe("the P&L headline", () => {
  const since = Date.UTC(2026, 9, 7, 14, 5) / 1000;
  it("stamps a time in UTC with the day and month", () => {
    expect(utcStamp(since)).toBe("14:05 UTC on 7 Oct");
  });
  it("compares V with S in % of S's hedged P&L", () => {
    expect(relativePct(561, 514)).toBeCloseTo(9.144, 3);
    expect(relativePct(5, 0)).toBeNaN();
    expect(pnlSentence({ vNet: 561, sNet: 514, sinceSec: since, replay: false, fairFee: true })).toBe(
      "Since 14:05 UTC on 7 Oct, pool V's hedged LP earned 9.1% more than pool S's, with average fees within 10% of each other.",
    );
    expect(pnlSentence({ vNet: 480, sNet: 514, replay: true, fairFee: true })).toBe(
      "Over the replay window, pool V's hedged LP earned 6.6% less than pool S's, with average fees within 10% of each other.",
    );
  });
  it("drops the % when S's P&L is not positive, and says when the fees differ", () => {
    expect(pnlSentence({ vNet: 20, sNet: -10, sinceSec: since, replay: false, fairFee: false })).toBe(
      "Since 14:05 UTC on 7 Oct, pool V's hedged LP earned more than pool S's, but their average fees differ by more than 10%, so the lab's backtest at equal fee is the reference.",
    );
    expect(pnlSentence({ vNet: -19_330, sNet: -24_221, replay: true, fairFee: true })).toBe(
      "Over the replay window, pool V's hedged LP lost 20.2% less than pool S's, with average fees within 10% of each other.",
    );
    expect(pnlSentence({ vNet: 514.2, sNet: 514, replay: true, fairFee: true })).toBe(
      "Over the replay window, pool V's hedged LP earned the same as pool S's, with average fees within 10% of each other.",
    );
  });
});

describe("blocksSpan", () => {
  it("says a rolling window of blocks in minutes or hours", () => {
    expect(blocksSpan(300)).toBe("about 1 h");
    expect(blocksSpan(450)).toBe("about 1.5 h");
    expect(blocksSpan(100)).toBe("about 20 min");
  });
});

describe("what sits behind the P&L headline", () => {
  // a calm start at the floor, a storm step, a blind spell at the safe fee, a degraded report, calm again
  const points = [
    { t: 0, feeVBp: 5, mode: FeeMode.Normal },
    { t: 600, feeVBp: 12.4, mode: FeeMode.Normal },
    { t: 900, feeVBp: 30, mode: FeeMode.Blind },
    { t: 1_320, feeVBp: 30, mode: FeeMode.Degraded },
    { t: 1_350, feeVBp: 5, mode: FeeMode.Normal },
  ];
  it("splits the time V's fee spent above its floor into storm, blind and degraded", () => {
    expect(feeRegimes(points, 2_000, 5)).toEqual({ stormSec: 300, blindSec: 420, degradedSec: 30 });
    expect(feeRegimes(points, 1_000, 5)).toEqual({ stormSec: 300, blindSec: 100, degradedSec: 0 }); // cut at `to`
    expect(feeRegimes([], 100, 5)).toEqual({ stormSec: 0, blindSec: 0, degradedSec: 0 });
  });
  it("rounds a span for a sentence", () => {
    expect(spanLabel(27)).toBe("27 s");
    expect(spanLabel(391)).toBe("7 min");
    expect(spanLabel(7_500)).toBe("2 h 05 min");
  });
  it("never credits the weather for a safe mode, and says the retail flow is mirrored", () => {
    const tail =
      " Every retail order also goes to both pools at once, so neither loses flow when it costs more; through a router, each order would go to the cheaper pool, which only the lab's aggregator scenario models.";
    expect(pnlCaveat({ stormSec: 0, blindSec: 391, degradedSec: 0 }, 5, 30)).toBe(
      `σ never took V's fee off its 5 bp floor in this window: V charged more only for 7 min in blind mode (the desk silent), at 30 bp or more, so the gap comes from desk outages, not from the weather.${tail}`,
    );
    expect(pnlCaveat({ stormSec: 1_800, blindSec: 391, degradedSec: 30 }, 5, 30)).toBe(
      `V's fee left its 5 bp floor for 30 min because σ rose, and sat at 30 bp or more for 7 min in blind mode (the desk silent) and 30 s in degraded mode (the venues apart): that part of V's premium came from the desk's safe modes, not from the weather.${tail}`,
    );
    expect(pnlCaveat({ stormSec: 1_800, blindSec: 0, degradedSec: 0 }, 5, 30)).toBe(
      `V's fee left its 5 bp floor for 30 min, each time because σ rose; no safe mode in this window.${tail}`,
    );
    expect(pnlCaveat({ stormSec: 0, blindSec: 0, degradedSec: 0 }, 5, 30)).toBe(`V's fee stayed at its 5 bp floor throughout: no premium is behind the gap.${tail}`);
  });
});

describe("dated UTC spans, for lists that cover several days", () => {
  // 2026-10-06T16:27:12Z and 2026-10-07T04:48:02Z
  const oct6 = Date.UTC(2026, 9, 6, 16, 27, 12) / 1000;
  const oct7 = Date.UTC(2026, 9, 7, 4, 48, 2) / 1000;

  it("gives the day and the clock to the second", () => {
    expect(utcDay(oct6)).toBe("6 Oct");
    expect(utcClock(oct6)).toBe("16:27:12");
  });

  it("names the day once within a day, twice across midnight, and says now while open", () => {
    expect(utcSpan(oct7, oct7 + 46)).toBe("7 Oct, 04:48:02 to 04:48:48 UTC");
    expect(utcSpan(oct6, oct7)).toBe("6 Oct, 16:27:12 to 7 Oct, 04:48:02 UTC");
    expect(utcSpan(oct7, oct7 + 46, true)).toBe("7 Oct, 04:48:02 UTC to now");
  });
});
