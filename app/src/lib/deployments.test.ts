import { describe, expect, it } from "vitest";
import { computePoolId, parseDeployments, parseParams } from "./deployments";

// Real Sepolia pool (Initialize log, block 0xb45c6c) used as a hashing test vector.
const REAL_KEY = {
  currency0: "0x64ee4113a00cf64caeff85cb28136dcb208a2692",
  currency1: "0x9692cd72a8ff9bfe83ed714407666974fc2a2609",
  fee: 3000,
  tickSpacing: 1,
  hooks: "0x9e63a7a3232af90d4c59886637f2575e09b61040",
} as const;
const REAL_ID = "0x203a9d9283af6b2a48fd7e84ad78308008fecfe468f294bba26776f9d7ce62a3";

const T0 = "0x1000000000000000000000000000000000000001";
const T1 = "0x2000000000000000000000000000000000000002";
const HOOK = "0x0000000000000000000000000000000000001080";
const DESK = "0x4000000000000000000000000000000000000004";
const ZERO = "0x0000000000000000000000000000000000000000";
const keyV = { currency0: T0, currency1: T1, fee: 8_388_608, tickSpacing: 60, hooks: HOOK };
const keyS = { currency0: T0, currency1: T1, fee: 1_200, tickSpacing: 60, hooks: ZERO };

// Bootstrap file of plan 04 (Task 6): infrastructure verified, everything plan 01 deploys still null.
const bootstrap = {
  chainId: 11155111,
  deployBlock: null as number | null,
  uniswap: {
    poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
    stateView: "0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C",
    poolSwapTest: "0x9B6b46e2c869aa39918Db7f52f5557FE577B6eEe",
    poolModifyLiquidityTest: "0x0C478023803a644c94c4CE1C1e7b9A087e411B0A",
  },
  cre: { mockForwarder: "0x15fC6ae953E024d975e77382eEeC56A9101f9F88", keystoneForwarder: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482" },
  tokens: { tETH: null as unknown, tUSD: null as unknown },
  riskDesks: { live: null as string | null, replay: null as string | null },
  hooks: { live: null as string | null, replay: null as string | null },
  pools: { liveV: null as unknown, liveS: null as unknown, replayV: null as unknown, replayS: null as unknown },
};

function deployedLive() {
  return {
    ...bootstrap,
    deployBlock: 9_000_000,
    tokens: { tETH: { address: T0, symbol: "tETH", decimals: 18 }, tUSD: { address: T1, symbol: "tUSD", decimals: 18 } },
    riskDesks: { live: DESK, replay: null },
    hooks: { live: HOOK, replay: null },
    pools: {
      liveV: { key: keyV, poolId: computePoolId(keyV), token0IsEth: true },
      liveS: { key: keyS, poolId: computePoolId(keyS), token0IsEth: true },
      replayV: null,
      replayS: null,
    },
    routers: { arb: "0x3000000000000000000000000000000000000003" },
  };
}

describe("computePoolId", () => {
  it("is keccak256(abi.encode(PoolKey)), checked against a real Sepolia pool", () => {
    expect(computePoolId(REAL_KEY)).toBe(REAL_ID);
  });
});

describe("parseDeployments (plan 04 schema)", () => {
  it("parses the bootstrap file: infrastructure only, no pair, so pairs.live is undefined", () => {
    const d = parseDeployments(bootstrap);
    expect(d.pairs.live).toBeUndefined();
    expect(d.uniswap.poolManager).toBe("0xE03A1074c86CFeDd5C142C4F04F1a1536e203543");
    expect(d.chainlink.mockKeystoneForwarder).toBe("0x15fC6ae953E024d975e77382eEeC56A9101f9F88");
    expect(d.routers.arb).toBeUndefined();
  });
  it("parses a deployed live pair", () => {
    const d = parseDeployments(deployedLive());
    expect(d.pairs.live).toMatchObject({ riskDesk: DESK, hook: HOOK, startBlock: 9_000_000, token0IsEth: true });
    expect(d.pairs.live?.V.key.fee).toBe(8_388_608);
    expect(d.pairs.live?.S.key.hooks).toBe(ZERO);
    expect(d.pairs.replay).toBeUndefined();
    expect(d.tokens).toEqual({ tETH: T0, tUSD: T1 });
    expect(d.routers.arb).toBe("0x3000000000000000000000000000000000000003");
  });
  it("rejects a poolId that does not hash from its key", () => {
    const bad = deployedLive();
    (bad.pools.liveS as { poolId: string }).poolId = REAL_ID;
    expect(() => parseDeployments(bad)).toThrow(/poolId mismatch for liveS/);
  });
  it("requires deployBlock once a pair is deployed", () => {
    expect(() => parseDeployments({ ...deployedLive(), deployBlock: null })).toThrow(/deployBlock/);
  });
  it("rejects a wrong chain id", () => {
    expect(() => parseDeployments({ ...bootstrap, chainId: 1 })).toThrow(/chainId/);
  });
});

describe("parseParams", () => {
  it("parses the hook parameters", () => {
    const p = parseParams({
      pStar: 0.2, etaE4: 41_760, sqrtHalfDtE6: 2_449_490, feeMinPips: 500, feeMaxPips: 15_000,
      feeSafePips: 3_000, tauKillSec: 180, decidedBy: "lab/out/pstar-decision.json",
    });
    expect(p.etaE4).toBe(41_760);
  });
  it("throws on a missing field", () => {
    expect(() => parseParams({ pStar: 0.2 })).toThrow(/params.json: etaE4/);
  });
});
