import { describe, expect, it } from "vitest";
import { blocksSpan, grouped, niceMax, pnlSentence, relativePct, scalePct, signed, utcStamp } from "./ledger";

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
