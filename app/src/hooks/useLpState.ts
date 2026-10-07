"use client";

import { useCallback, useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { useStored } from "@/hooks/useStored";
import { stateViewAbi, testTokenAbi } from "@/lib/abis";
import { deployments } from "@/lib/config";
import type { PairDeployment } from "@/lib/deployments";
import { feesOwed, fullRangeTicks, saltFor } from "@/lib/liquidity";
import type { PoolName } from "@/lib/swap";

export const POOLS: PoolName[] = ["V", "S"];
const SINCE_KEY = "clim-lp-since-v1";

/** A pool's active liquidity (the user's position included) and its sqrt price. */
export type PoolLevel = { liquidity: number; sqrtP: number };
export type UserPosition = {
  liquidity: number;
  /** Exact on-chain liquidity, for a full withdrawal that never exceeds the position. */
  liquidityRaw?: bigint;
  feesUsdOnChain?: number;
  sinceSec?: number;
};
export type LpState = {
  pair?: PairDeployment;
  balances?: { tETH: number; tUSD: number };
  pools: Partial<Record<PoolName, PoolLevel>>;
  positions: Partial<Record<PoolName, UserPosition>>;
  refresh: () => void;
  /** Remembers when this browser added liquidity on-chain, for "P&L since you joined". */
  rememberSince: (pool: PoolName, t: number) => void;
};

const NO_SINCE: Record<string, number> = {};

/** Balances, pool levels and the user's positions on V and S, read on Sepolia. */
export function useLpState(): LpState {
  const { address } = useAccount();
  const chainPair = deployments.pairs.live;
  const pair = chainPair;
  const router = deployments.uniswap.poolModifyLiquidityTest;
  const tETH = deployments.tokens.tETH;
  const tUSD = deployments.tokens.tUSD;

  // On-chain reads: both pools' depth and price from StateView, with or without a wallet,
  // so the pool cards and the add quote show live numbers before connecting; then, with a wallet, its
  // positions and token balances.
  const chainPools = !!chainPair;
  const live = chainPools && !!router && !!address;
  const ticks = chainPair ? fullRangeTicks(chainPair.V.key.tickSpacing) : { tickLower: 0, tickUpper: 0 };
  const sv = { address: deployments.uniswap.stateView, abi: stateViewAbi } as const;
  const poolContracts = chainPools && chainPair
    ? POOLS.flatMap((name) => {
        const poolId = chainPair[name].poolId;
        return [
          { ...sv, functionName: "getLiquidity", args: [poolId] },
          { ...sv, functionName: "getSlot0", args: [poolId] },
        ] as const;
      })
    : [];
  const poolReads = useReadContracts({ contracts: poolContracts, query: { enabled: chainPools, refetchInterval: 12_000 } });
  const contracts = live && chainPair && router && address
    ? [
        ...POOLS.flatMap((name) => {
          const poolId = chainPair[name].poolId;
          return [
            { ...sv, functionName: "getPositionInfo", args: [poolId, router, ticks.tickLower, ticks.tickUpper, saltFor(address)] },
            { ...sv, functionName: "getFeeGrowthInside", args: [poolId, ticks.tickLower, ticks.tickUpper] },
          ] as const;
        }),
        ...(tETH && tUSD
          ? ([
              { address: tETH, abi: testTokenAbi, functionName: "balanceOf", args: [address] },
              { address: tUSD, abi: testTokenAbi, functionName: "balanceOf", args: [address] },
            ] as const)
          : []),
      ]
    : [];
  const reads = useReadContracts({ contracts, query: { enabled: live, refetchInterval: 12_000 } });

  const [since, updateSince] = useStored(SINCE_KEY, NO_SINCE);
  const rememberSince = useCallback(
    (pool: PoolName, t: number) => {
      if (address) updateSince((s) => ({ ...s, [`${address}:${pool}`]: t }));
    },
    [address, updateSince],
  );

  const state = useMemo(() => {
    const pools: Partial<Record<PoolName, PoolLevel>> = {};
    const positions: Partial<Record<PoolName, UserPosition>> = {};
    let balances: LpState["balances"];
    if (chainPools && chainPair) {
      const pr = poolReads.data ?? [];
      POOLS.forEach((name, i) => {
        const [liq, slot0] = [pr[2 * i], pr[2 * i + 1]];
        if (liq?.status === "success" && slot0?.status === "success") {
          const [sqrtPriceX96] = slot0.result as readonly [bigint, number, number, number];
          pools[name] = { liquidity: Number(liq.result as bigint), sqrtP: Number(sqrtPriceX96) / 2 ** 96 };
        }
      });
    }
    if (live && reads.data && chainPair) {
      const r = reads.data;
      POOLS.forEach((name, i) => {
        const [pos, inside] = [r[2 * i], r[2 * i + 1]];
        if (pos?.status === "success" && inside?.status === "success") {
          const [liquidity, last0, last1] = pos.result as readonly [bigint, bigint, bigint];
          const [now0, now1] = inside.result as readonly [bigint, bigint];
          if (liquidity > 0n) {
            const sqrtP = pools[name]?.sqrtP ?? 0;
            const price = sqrtP * sqrtP; // token1 per token0
            const ethUsd = chainPair.token0IsEth ? price : 1 / price;
            const f0 = Number(feesOwed(liquidity, now0, last0)) / 1e18;
            const f1 = Number(feesOwed(liquidity, now1, last1)) / 1e18;
            const feesUsd = chainPair.token0IsEth ? f0 * ethUsd + f1 : f1 * ethUsd + f0;
            positions[name] = { liquidity: Number(liquidity), liquidityRaw: liquidity, feesUsdOnChain: feesUsd, sinceSec: since[`${address}:${name}`] };
          }
        }
      });
      const b = r.slice(4);
      if (b.length === 2 && b[0]?.status === "success" && b[1]?.status === "success") {
        balances = { tETH: Number(b[0].result as bigint) / 1e18, tUSD: Number(b[1].result as bigint) / 1e18 };
      }
    }
    return { pools, positions, balances };
  }, [chainPools, poolReads.data, live, reads.data, chainPair, since, address]);

  const { refetch } = reads;
  const { refetch: refetchPools } = poolReads;
  const refresh = useCallback(() => {
    void refetch();
    void refetchPools();
  }, [refetch, refetchPools]);

  return { pair, ...state, refresh, rememberSince };
}

