import { describe, expect, it } from "vitest";
import { deployments } from "./config";
import { contractGroups, poolRows, sourcifyAddress } from "./contracts";

describe("the contracts list (synced Sepolia deployment)", () => {
  const groups = contractGroups(deployments);
  const rows = groups.flatMap((g) => g.rows);

  it("links clim's own six contracts to Sourcify, and only those", () => {
    const verified = rows.filter((r) => r.verified).map((r) => r.name);
    if (deployments.fixture) return;
    expect(verified).toEqual(["RiskDesk (live)", "ClimHook (live)", "RiskDesk (replay)", "ClimHook (replay)", "tETH", "tUSD"]);
    expect(sourcifyAddress(deployments.pairs.live!.riskDesk)).toBe("https://repo.sourcify.dev/11155111/0xCDbfd6b9C0b97A8eE31706c6CDE5E54B4954334F");
  });

  it("lists the Uniswap routers, StateView, the PoolManager and the mock forwarder", () => {
    if (deployments.fixture) return;
    const names = rows.map((r) => r.name);
    for (const n of ["PoolManager", "StateView", "PoolSwapTest", "PoolModifyLiquidityTest", "MockKeystoneForwarder", "PoolSwapTest (arbitrage)"]) expect(names).toContain(n);
  });

  it("gives every pool its id, its fee and the transaction that initialized it", () => {
    if (deployments.fixture) return;
    const pools = poolRows(deployments, (p) => `${(p / 100).toFixed(2)} bp`);
    expect(pools.map((p) => p.fee)).toEqual([
      "dynamic: set by ClimHook on every swap",
      "5.11 bp, fixed",
      "dynamic: set by ClimHook on every swap",
      "15.03 bp, fixed",
    ]);
    for (const p of pools) expect(p.initTx).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
