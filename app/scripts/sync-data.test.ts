import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LAB_FILES, syncData, withMainScenarioGain } from "./sync-data.mjs";

/** A repo with every file the sync reads: shared/, lab/out and docs/faq.md. */
function fakeRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), "clim-sync-"));
  const appRoot = join(repoRoot, "app");
  mkdirSync(appRoot, { recursive: true });
  mkdirSync(join(repoRoot, "shared/deployments"), { recursive: true });
  mkdirSync(join(repoRoot, "lab/out"), { recursive: true });
  mkdirSync(join(repoRoot, "docs"), { recursive: true });
  writeFileSync(join(repoRoot, "shared/deployments/sepolia.json"), '{"chainId":11155111}');
  writeFileSync(join(repoRoot, "shared/params.json"), '{"pStar":0.3}');
  for (const f of LAB_FILES) writeFileSync(join(repoRoot, "lab/out", f), '{"real":true}');
  writeFileSync(join(repoRoot, "docs/faq.md"), "real faq");
  return { repoRoot, appRoot };
}

describe("syncData", () => {
  it("throws when a repo file is missing: the app ships real data only", () => {
    const { repoRoot, appRoot } = fakeRepo();
    rmSync(join(repoRoot, "shared/params.json"));
    expect(() => syncData({ repoRoot, appRoot })).toThrow(/missing/);
  });
  it("copies the repo's shared/, lab/out and docs/faq.md", () => {
    const { repoRoot, appRoot } = fakeRepo();
    const report = syncData({ repoRoot, appRoot });
    expect(readFileSync(join(appRoot, "src/generated/params.json"), "utf8")).toBe('{"pStar":0.3}');
    expect(readFileSync(join(appRoot, "public/data/lab/ptrade-band.json"), "utf8")).toBe('{"real":true}');
    expect(readFileSync(join(appRoot, "src/generated/faq.ts"), "utf8")).toContain("real faq");
    expect(report.every((r: { source: string }) => r.source === "repo")).toBe(true);
  });
});

describe("withMainScenarioGain", () => {
  const summary = { setting: { pStar: 0.3 }, lpGain: { volatileAssetPctPerYearMax: 0.39936743, shareFromTop5WeeksPct: 52.87945 } };
  const backtest = { yearAttribution: { clim_p20: { gainVsStatic5BpYr: 27.966332 }, clim_p30: { gainVsStatic5BpYr: 39.110205 } } };

  it("adds ETH's main-scenario gain, in % a year, from the chosen policy's year attribution", () => {
    expect(withMainScenarioGain(summary, backtest).lpGain.mainScenarioEthPctPerYear).toBeCloseTo(0.39110205, 8);
  });

  it("keeps a value the lab already wrote, and changes nothing when the backtest lacks it", () => {
    const own = { ...summary, lpGain: { ...summary.lpGain, mainScenarioEthPctPerYear: 0.5 } };
    expect(withMainScenarioGain(own, backtest)).toBe(own);
    expect(withMainScenarioGain(summary, {})).toBe(summary);
  });

  it("writes it into the synced summary when lab/out has the backtest", () => {
    const { repoRoot, appRoot } = fakeRepo();
    writeFileSync(join(repoRoot, "lab/out/summary.json"), JSON.stringify(summary));
    writeFileSync(join(repoRoot, "lab/out/backtest-summary.json"), JSON.stringify(backtest));
    syncData({ repoRoot, appRoot });
    const out = JSON.parse(readFileSync(join(appRoot, "public/data/lab/summary.json"), "utf8"));
    expect(out.lpGain.mainScenarioEthPctPerYear).toBeCloseTo(0.39110205, 8);
  });
});
