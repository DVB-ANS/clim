import { type Address, encodeAbiParameters, getAddress, type Hex, isHex, keccak256 } from "viem";
import type { FeeParams } from "./feeMath";

export const SEPOLIA_CHAIN_ID = 11_155_111;
export type Pair = "live" | "replay";
export const PAIRS: Pair[] = ["live", "replay"];

export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
export type PoolInfo = { poolId: Hex; key: PoolKey };
export type PairDeployment = {
  riskDesk: Address;
  hook: Address;
  startBlock: number;
  token0IsEth: boolean;
  V: PoolInfo;
  S: PoolInfo;
};
export type Deployments = {
  chainId: number;
  uniswap: { poolManager: Address; stateView: Address; poolSwapTest: Address; poolModifyLiquidityTest?: Address };
  chainlink: { mockKeystoneForwarder?: Address; keystoneForwarder?: Address };
  tokens: { tETH?: Address; tUSD?: Address };
  routers: { arb?: Address };
  pairs: Partial<Record<Pair, PairDeployment>>;
};
export type Params = FeeParams & { pStar: number; decidedBy: string };

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null;
const optAddr = (x: unknown): Address | undefined => (typeof x === "string" && x.length === 42 ? getAddress(x) : undefined);

function addr(x: unknown, where: string): Address {
  const a = optAddr(x);
  if (!a) throw new Error(`deployments: ${where} is not an address`);
  return a;
}

export function computePoolId(key: { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string }): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
      [getAddress(key.currency0), getAddress(key.currency1), key.fee, key.tickSpacing, getAddress(key.hooks)],
    ),
  );
}

function parsePool(x: unknown, where: string): PoolInfo & { token0IsEth: boolean } {
  if (!isObj(x) || !isObj(x.key)) throw new Error(`deployments: ${where} missing`);
  const k = x.key;
  const key: PoolKey = {
    currency0: addr(k.currency0, `${where}.key.currency0`),
    currency1: addr(k.currency1, `${where}.key.currency1`),
    fee: Number(k.fee),
    tickSpacing: Number(k.tickSpacing),
    hooks: addr(k.hooks, `${where}.key.hooks`),
  };
  const poolId = String(x.poolId).toLowerCase() as Hex;
  if (!isHex(poolId) || poolId.length !== 66) throw new Error(`deployments: ${where}.poolId is not bytes32`);
  if (computePoolId(key) !== poolId) throw new Error(`deployments: poolId mismatch for ${where}`);
  return { poolId, key, token0IsEth: x.token0IsEth === true };
}

/** A pair is used once its desk, hook and both pools are recorded; until then it is undefined. */
function parsePair(raw: Obj, name: Pair): PairDeployment | undefined {
  const desk = isObj(raw.riskDesks) ? optAddr(raw.riskDesks[name]) : undefined;
  const hook = isObj(raw.hooks) ? optAddr(raw.hooks[name]) : undefined;
  const pools = isObj(raw.pools) ? raw.pools : {};
  if (!desk || !hook || !isObj(pools[`${name}V`]) || !isObj(pools[`${name}S`])) return undefined;
  if (typeof raw.deployBlock !== "number") throw new Error(`deployments: deployBlock must be set once ${name} is deployed`);
  const V = parsePool(pools[`${name}V`], `${name}V`);
  const S = parsePool(pools[`${name}S`], `${name}S`);
  return {
    riskDesk: desk,
    hook,
    startBlock: raw.deployBlock,
    token0IsEth: V.token0IsEth,
    V: { poolId: V.poolId, key: V.key },
    S: { poolId: S.poolId, key: S.key },
  };
}

/** Parses shared/deployments/sepolia.json in the shape fixed by plan 04 (Task 6), plus `routers.arb`. */
export function parseDeployments(raw: unknown): Deployments {
  if (!isObj(raw)) throw new Error("deployments: not an object");
  if (raw.chainId !== SEPOLIA_CHAIN_ID) throw new Error(`deployments: chainId ${String(raw.chainId)} is not Sepolia`);
  const u = isObj(raw.uniswap) ? raw.uniswap : {};
  const c = isObj(raw.cre) ? raw.cre : {};
  const t = isObj(raw.tokens) ? raw.tokens : {};
  const r = isObj(raw.routers) ? raw.routers : {};
  const tokenAddr = (x: unknown) => (isObj(x) ? optAddr(x.address) : undefined);
  const pairs: Partial<Record<Pair, PairDeployment>> = {};
  for (const name of PAIRS) {
    const parsed = parsePair(raw, name);
    if (parsed) pairs[name] = parsed;
  }
  return {
    chainId: SEPOLIA_CHAIN_ID,
    uniswap: {
      poolManager: addr(u.poolManager, "uniswap.poolManager"),
      stateView: addr(u.stateView, "uniswap.stateView"),
      poolSwapTest: addr(u.poolSwapTest, "uniswap.poolSwapTest"),
      poolModifyLiquidityTest: optAddr(u.poolModifyLiquidityTest),
    },
    chainlink: { mockKeystoneForwarder: optAddr(c.mockForwarder), keystoneForwarder: optAddr(c.keystoneForwarder) },
    tokens: { tETH: tokenAddr(t.tETH), tUSD: tokenAddr(t.tUSD) },
    routers: { arb: optAddr(r.arb) },
    pairs,
  };
}

const PARAM_FIELDS = ["pStar", "etaE4", "sqrtHalfDtE6", "feeMinPips", "feeMaxPips", "feeSafePips", "tauKillSec"] as const;

export function parseParams(raw: unknown): Params {
  if (!isObj(raw)) throw new Error("params.json: not an object");
  for (const f of PARAM_FIELDS) {
    if (typeof raw[f] !== "number" || !Number.isFinite(raw[f])) throw new Error(`params.json: ${f} must be a number`);
  }
  return {
    pStar: raw.pStar as number,
    etaE4: raw.etaE4 as number,
    sqrtHalfDtE6: raw.sqrtHalfDtE6 as number,
    feeMinPips: raw.feeMinPips as number,
    feeMaxPips: raw.feeMaxPips as number,
    feeSafePips: raw.feeSafePips as number,
    tauKillSec: raw.tauKillSec as number,
    decidedBy: String(raw.decidedBy ?? ""),
  };
}
