import { describe, expect, it } from "vitest";
import { replayWindowNote, roundPct, signedPct, usdPerMillion } from "./labText";

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

  it("puts the replay window in the context of the rolling windows, in the README's words", () => {
    const r = { arbChangeRangePct: [-18.366445, 3.1499447] as [number, number], windowsMedianPct: -2.1181905, windowsBetterCount: 66, windowsCount: 92, windowsBeatingChosenCount: 0 };
    expect(replayWindowNote(r)).toBe(
      "Picked during design at an earlier setting, around the sharpest rise in volatility: at this P* no rolling 4 h window of the storm does better (best -18.4%); median -2.1%; 66 of 92 windows beat the fixed pool.",
    );
    expect(replayWindowNote(r)).not.toMatch(/most favou?rable/);
    expect(replayWindowNote({ ...r, windowsBeatingChosenCount: 3 })).toContain("3 of the 92 rolling 4 h windows of the storm did better");
    expect(replayWindowNote({})).toBeNull();
  });
});
