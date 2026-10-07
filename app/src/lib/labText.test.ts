import { describe, expect, it } from "vitest";
import { lessMore, replayWindowNote, replayWindowsSpread, roundPct, signedPct, usdPerMillion } from "./labText";

describe("lab numbers as judges read them", () => {
  it("rounds the lab's 8 significant digits", () => {
    expect(signedPct(0.70240233)).toBe("+0.70%");
    expect(signedPct(-0.0981486)).toBe("-0.10%");
    expect(signedPct(-2.1181905, 1)).toBe("-2.1%");
    expect(roundPct(52.87945)).toBe("53%");
    expect(roundPct(103.34705)).toBe("103%");
  });

  it("turns % of capital per year into dollars per $1M of liquidity", () => {
    expect(usdPerMillion(0.39)).toBe("$3,900");
    expect(usdPerMillion(-0.0981486)).toBe("-$981");
    expect(usdPerMillion(0.70240233)).toBe("$7,024");
  });

  it("puts the replay window in the context of the storm's other windows, in plain words", () => {
    const r = { arbChangeRangePct: [-18.366445, 3.1499447] as [number, number], windowsMedianPct: -2.1181905, windowsBetterCount: 66, windowsCount: 92, windowsBeatingChosenCount: 0 };
    expect(replayWindowNote(r)).toBe(
      "We chose this window while designing clim, around the sharpest rise in volatility. None of the storm's 92 four-hour windows does better (best: 18.4% less); the median is 2.1% less, and V lost less in 66 of 92.",
    );
    expect(replayWindowNote(r)).not.toMatch(/most favou?rable|P\*|:16|earlier setting/);
    expect(replayWindowNote({ ...r, windowsBeatingChosenCount: 3 })).toContain("3 of the storm's 92 four-hour windows did better");
    expect(replayWindowNote({})).toBeNull();
  });

  it("gives the /replay lead the spread, not only the chosen window", () => {
    const r = { windowsMedianPct: -2.1181905, windowsBetterCount: 66, windowsCount: 92 };
    expect(replayWindowsSpread(r)).toBe("Over the storm's 92 four-hour windows the median is 2.1% less, and V lost less in 66 of them");
    expect(replayWindowsSpread({ ...r, windowsMedianPct: 0.01 })).toContain("the median shows no change");
    expect(replayWindowsSpread({})).toBeNull();
  });

  it("says a V-against-S change in words, with no sign to contradict", () => {
    expect(lessMore(-18.631183)).toBe("18.6% less");
    expect(lessMore(3.1499447)).toBe("3.1% more");
    expect(lessMore(0.04)).toBe("no change");
    expect(lessMore(-18.366445)).toBe("18.4% less");
  });
});
