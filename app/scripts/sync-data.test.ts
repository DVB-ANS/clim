import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LAB_FILES, syncData, withMainScenarioGain } from "./sync-data.mjs";

function fakeRepo() {
  const repoRoot = mkdtempSync(join(tmpdir(), "clim-sync-"));
  const appRoot = join(repoRoot, "app");
  mkdirSync(join(appRoot, "src/fixtures/lab"), { recursive: true });
  writeFileSync(join(appRoot, "src/fixtures/deployments.sepolia.json"), '{"fixture":true}');
  writeFileSync(join(appRoot, "src/fixtures/params.json"), '{"fixture":true}');
  writeFileSync(join(appRoot, "src/fixtures/faq.md"), "fixture faq");
  for (const f of LAB_FILES) writeFileSync(join(appRoot, "src/fixtures/lab", f), '{"fixture":true}');
  return { repoRoot, appRoot };
}

describe("syncData", () => {
  it("falls back to fixtures when the repo files do not exist", () => {
    const { repoRoot, appRoot } = fakeRepo();
    const report = syncData({ repoRoot, appRoot });
    expect(report.every((r: { source: string }) => r.source === "fixture")).toBe(true);
    expect(readFileSync(join(appRoot, "src/generated/params.json"), "utf8")).toBe('{"fixture":true}');
    expect(readFileSync(join(appRoot, "src/generated/faq.ts"), "utf8")).toContain('export const FAQ_MD = "fixture faq";');
  });
  it("prefers the repo's shared/, lab/out and docs/faq.md", () => {
    const { repoRoot, appRoot } = fakeRepo();
    mkdirSync(join(repoRoot, "shared/deployments"), { recursive: true });
    mkdirSync(join(repoRoot, "lab/out"), { recursive: true });
    mkdirSync(join(repoRoot, "docs"), { recursive: true });
    writeFileSync(join(repoRoot, "shared/params.json"), '{"pStar":0.3}');
    writeFileSync(join(repoRoot, "lab/out/ptrade-band.json"), '{"real":true}');
    writeFileSync(join(repoRoot, "docs/faq.md"), "real faq");
    const report = syncData({ repoRoot, appRoot });
    expect(readFileSync(join(appRoot, "src/generated/params.json"), "utf8")).toBe('{"pStar":0.3}');
    expect(readFileSync(join(appRoot, "public/data/lab/ptrade-band.json"), "utf8")).toBe('{"real":true}');
    expect(readFileSync(join(appRoot, "src/generated/faq.ts"), "utf8")).toContain("real faq");
    expect(report.find((r: { file: string }) => r.file === "src/generated/sepolia.json")?.source).toBe("fixture");
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
    mkdirSync(join(repoRoot, "lab/out"), { recursive: true });
    writeFileSync(join(repoRoot, "lab/out/summary.json"), JSON.stringify(summary));
    writeFileSync(join(repoRoot, "lab/out/backtest-summary.json"), JSON.stringify(backtest));
    syncData({ repoRoot, appRoot });
    const out = JSON.parse(readFileSync(join(appRoot, "public/data/lab/summary.json"), "utf8"));
    expect(out.lpGain.mainScenarioEthPctPerYear).toBeCloseTo(0.39110205, 8);
  });
});
