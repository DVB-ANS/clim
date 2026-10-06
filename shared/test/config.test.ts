import { describe, expect, test } from "bun:test";
import { zeroAddress, type Address } from "viem";
import {
  arbRouter,
  isProvisional,
  loadDeployments,
  loadParams,
  orientationOf,
  parseDeployments,
  parseParams,
  poolIdFromKey,
  resolvePair,
  type PoolKey,
} from "../src/config";

const T_ETH: Address = "0x1111111111111111111111111111111111111111";
const T_USD: Address = "0x2222222222222222222222222222222222222222";
const HOOK: Address = "0x3333333333333333333333333333333333333333";
const DESK: Address = "0x4444444444444444444444444444444444444444";
const OTHER: Address = "0x5555555555555555555555555555555555555555";
const V_KEY: PoolKey = { currency0: T_ETH, currency1: T_USD, fee: 0x800000, tickSpacing: 60, hooks: HOOK };
const S_KEY: PoolKey = { currency0: T_ETH, currency1: T_USD, fee: 500, tickSpacing: 60, hooks: zeroAddress };

function fixture() {
  const base = loadDeployments();
  return {
    ...base,
    deployBlock: 9_000_000,
    deployer: OTHER, // extra key written by plan 01: ignored
    liquidity: { live: "520864665724216698412099", replay: null }, // extra key written by plan 01: ignored
    tokens: {
      tETH: { address: T_ETH, symbol: "tETH", decimals: 18 },
      tUSD: { address: T_USD, symbol: "tUSD", decimals: 18 },
    },
    riskDesks: { live: DESK, replay: null, don: null },
    hooks: { live: HOOK, replay: null },
    pools: {
      liveV: { key: V_KEY, poolId: poolIdFromKey(V_KEY), token0IsEth: true },
      liveS: { key: S_KEY, poolId: poolIdFromKey(S_KEY), token0IsEth: true },
      replayV: null,
      replayS: null,
    },
    routers: { arb: null },
  };
}

describe("poolIdFromKey = keccak256(abi.encode(PoolKey))", () => {
  test("matches cast keccak $(cast abi-encode ...)", () => {
    expect(poolIdFromKey(V_KEY)).toBe("0x4ac6664e02ef052115118798d9cd3d912b42c991fd3dd4c8b44533eb39d953b1");
  });
});

describe("shared/deployments/sepolia.json", () => {
  test("the committed file parses (Uniswap infra and CRE forwarders verified on-chain)", () => {
    const d = loadDeployments();
    expect(d.chainId).toBe(11155111);
    expect(d.uniswap.poolManager).toBe("0xE03A1074c86CFeDd5C142C4F04F1a1536e203543");
  });
  test("a fully deployed pair parses and resolves (plan 01 extra keys ignored)", () => {
    const d = parseDeployments(fixture());
    const pair = resolvePair(d, "live");
    expect(pair.hook).toBe(HOOK);
    expect(pair.desk).toBe(DESK);
    expect(pair.tETH).toEqual({ address: T_ETH, symbol: "tETH", decimals: 18 });
    expect(orientationOf(pair.V, d)).toEqual({ token0IsEth: true, decimals0: 18, decimals1: 18 });
  });
  test("resolvePair names the missing entry when the pair is not deployed", () => {
    expect(() => resolvePair(parseDeployments(fixture()), "replay")).toThrow(/replayV/);
  });
  test("the arbitrage router is routers.arb when deployed, else the shared PoolSwapTest", () => {
    const d = parseDeployments(fixture());
    expect(arbRouter(d)).toBe(d.uniswap.poolSwapTest);
    expect(arbRouter(parseDeployments({ ...fixture(), routers: { arb: OTHER } }))).toBe(OTHER);
    const { routers: _omit, ...withoutRouters } = fixture();
    expect(parseDeployments(withoutRouters).routers.arb).toBeNull();
  });
  test("accepts the DON desk", () => {
    expect(parseDeployments({ ...fixture(), riskDesks: { live: DESK, replay: null, don: OTHER } }).riskDesks.don).toBe(OTHER);
  });
  test("rejects a poolId that does not match its key", () => {
    const f = fixture();
    f.pools.liveS = { ...f.pools.liveS, poolId: f.pools.liveV.poolId };
    expect(() => parseDeployments(f)).toThrow(/poolId/);
  });
  test("rejects a wrong token0IsEth", () => {
    const f = fixture();
    f.pools.liveV = { ...f.pools.liveV, token0IsEth: false };
    expect(() => parseDeployments(f)).toThrow(/token0IsEth/);
  });
  test("rejects a pool that does not trade tETH/tUSD", () => {
    const f = fixture();
    const k = { ...S_KEY, currency1: OTHER };
    f.pools.liveS = { key: k, poolId: poolIdFromKey(k), token0IsEth: true };
    expect(() => parseDeployments(f)).toThrow(/tokens\.tETH and tokens\.tUSD/);
  });
  test("rejects a V pool without the dynamic fee flag or with another hook", () => {
    const f = fixture();
    const k = { ...V_KEY, fee: 3_000 };
    f.pools.liveV = { key: k, poolId: poolIdFromKey(k), token0IsEth: true };
    expect(() => parseDeployments(f)).toThrow(/dynamic/);
    const g = fixture();
    const k2 = { ...V_KEY, hooks: zeroAddress };
    g.pools.liveV = { key: k2, poolId: poolIdFromKey(k2), token0IsEth: true };
    expect(() => parseDeployments(g)).toThrow(/hooks/);
  });
  test("rejects unsorted currencies", () => {
    const f = fixture();
    const k = { ...S_KEY, currency0: T_USD, currency1: T_ETH };
    f.pools.liveS = { key: k, poolId: poolIdFromKey(k), token0IsEth: false };
    expect(() => parseDeployments(f)).toThrow(/sorted/);
  });
});

describe("shared/params.json", () => {
  test("the committed file parses", () => {
    const p = loadParams();
    expect(p.feeMinPips).toBeLessThanOrEqual(p.feeSafePips);
    expect(p.feeSafePips).toBeLessThanOrEqual(p.feeMaxPips);
  });
  test("etaE4 must match P* (tolerance 1); extra fields such as staticFeePips are ignored", () => {
    expect(() => parseParams({ ...loadParams(), pStar: 0.2, etaE4: 25_093 })).toThrow(/etaE4/);
    expect(parseParams({ ...loadParams(), pStar: 0.2, etaE4: 41_761, staticFeePips: 600 }).etaE4).toBe(41_761);
  });
  test("fee bounds follow the hook constructor: 0 < min <= safe <= max", () => {
    expect(() => parseParams({ ...loadParams(), feeMinPips: 0 })).toThrow(/feeMinPips/);
    expect(() => parseParams({ ...loadParams(), feeSafePips: 20_000 })).toThrow(/feeMaxPips/);
  });
  test("isProvisional flags the bootstrap file", () => {
    expect(isProvisional({ ...loadParams(), decidedBy: "PROVISIONAL x" })).toBe(true);
    expect(isProvisional({ ...loadParams(), decidedBy: "FIXTURE x" })).toBe(true);
    expect(isProvisional({ ...loadParams(), decidedBy: "lab/out/pstar-decision.json" })).toBe(false);
  });
});
