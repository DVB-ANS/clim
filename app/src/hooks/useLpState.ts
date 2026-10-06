"use client";

import { useCallback, useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import type { TxMode } from "@/components/TxModeSwitch";
import type { ClimData } from "@/hooks/useClimData";
import { useStored } from "@/hooks/useStored";
import { stateViewAbi, testTokenAbi } from "@/lib/abis";
import { deployments } from "@/lib/config";
import type { PairDeployment } from "@/lib/deployments";
import { feesOwed, fullRangeTicks, saltFor } from "@/lib/liquidity";
import type { PoolName } from "@/lib/swap";

export const POOLS: PoolName[] = ["V", "S"];
/** Simulated faucet amounts (the real ones are set by TestToken.faucet()). */
export const MOCK_FAUCET = { tETH: 10, tUSD: 25_000 };
const MOCK_KEY = "clim-mock-lp-v1";
const SINCE_KEY = "clim-lp-since-v1";

/** A pool's active liquidity (the user's position included, simulated or not) and its sqrt price. */
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
  /** Simulated wallet, mock mode only. */
  mock: {
    faucet: () => void;
    add: (pool: PoolName, liquidity: number, eth: number, usd: number) => void;
    remove: (pool: PoolName, eth: number, usd: number) => void;
  };
  /** Remembers when this browser added liquidity on-chain, for "P&L since you joined". */
  rememberSince: (pool: PoolName, t: number) => void;
};

type MockWallet = { tETH: number; tUSD: number; positions: Partial<Record<PoolName, { liquidity: number }>> };
const EMPTY_MOCK: MockWallet = { tETH: 0, tUSD: 0, positions: {} };
const NO_SINCE: Record<string, number> = {};

/** Balances, pool levels and the user's positions on V and S, read on-chain or simulated. */
export function useLpState(mode: TxMode, data: ClimData): LpState {
  const { address } = useAccount();
  const chainPair = deployments.pairs.live;
  const pair = mode === "chain" ? chainPair : data.pair;
  const router = deployments.uniswap.poolModifyLiquidityTest;
  const tETH = deployments.tokens.tETH;
  const tUSD = deployments.tokens.tUSD;

  // Simulated wallet (localStorage, mock mode).
  const [mockWallet, updateMock] = useStored(MOCK_KEY, EMPTY_MOCK);

  // On-chain reads (chain mode): StateView for both pools, token balances.
  const live = mode === "chain" && !!chainPair && !!router && !!address;
  const ticks = chainPair ? fullRangeTicks(chainPair.V.key.tickSpacing) : { tickLower: 0, tickUpper: 0 };
  const contracts = live && chainPair && router && address
    ? [
        ...POOLS.flatMap((name) => {
          const poolId = chainPair[name].poolId;
          const sv = { address: deployments.uniswap.stateView, abi: stateViewAbi } as const;
          return [
            { ...sv, functionName: "getPositionInfo", args: [poolId, router, ticks.tickLower, ticks.tickUpper, saltFor(address)] },
            { ...sv, functionName: "getFeeGrowthInside", args: [poolId, ticks.tickLower, ticks.tickUpper] },
            { ...sv, functionName: "getLiquidity", args: [poolId] },
            { ...sv, functionName: "getSlot0", args: [poolId] },
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
    (pool: PoolName, t: number) => updateSince((s) => ({ ...s, [`${address ?? "mock"}:${pool}`]: t })),
    [address, updateSince],
  );

  const state = useMemo(() => {
    const pools: Partial<Record<PoolName, PoolLevel>> = {};
    const positions: Partial<Record<PoolName, UserPosition>> = {};
    let balances: LpState["balances"];
    if (mode === "mock") {
      for (const name of POOLS) {
        const poolId = data.pair?.[name].poolId;
        const last = poolId ? data.swaps.filter((s) => s.poolId === poolId).at(-1) : undefined;
        const p = mockWallet.positions[name];
        const mine = p && p.liquidity > 0 ? p.liquidity : 0;
        if (mine > 0) positions[name] = { liquidity: mine };
        // the simulated position joins the simulated pool, like a real one would
        if (last) pools[name] = { liquidity: Number(last.liquidity) + mine, sqrtP: Number(last.sqrtPriceX96) / 2 ** 96 };
      }
      balances = { tETH: mockWallet.tETH, tUSD: mockWallet.tUSD };
    } else if (live && reads.data && chainPair) {
      const r = reads.data;
      POOLS.forEach((name, i) => {
        const [pos, inside, liq, slot0] = [r[4 * i], r[4 * i + 1], r[4 * i + 2], r[4 * i + 3]];
        if (liq?.status === "success" && slot0?.status === "success") {
          const [sqrtPriceX96] = slot0.result as readonly [bigint, number, number, number];
          pools[name] = { liquidity: Number(liq.result as bigint), sqrtP: Number(sqrtPriceX96) / 2 ** 96 };
        }
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
      const b = r.slice(8);
      if (b.length === 2 && b[0]?.status === "success" && b[1]?.status === "success") {
        balances = { tETH: Number(b[0].result as bigint) / 1e18, tUSD: Number(b[1].result as bigint) / 1e18 };
      }
    }
    return { pools, positions, balances };
  }, [mode, data.pair, data.swaps, mockWallet, live, reads.data, chainPair, since, address]);

  const mock = useMemo(
    () => ({
      faucet: () => updateMock((w) => ({ ...w, tETH: w.tETH + MOCK_FAUCET.tETH, tUSD: w.tUSD + MOCK_FAUCET.tUSD })),
      add: (pool: PoolName, liquidity: number, eth: number, usd: number) =>
        updateMock((w) => ({
          tETH: w.tETH - eth,
          tUSD: w.tUSD - usd,
          positions: { ...w.positions, [pool]: { liquidity: (w.positions[pool]?.liquidity ?? 0) + liquidity } },
        })),
      remove: (pool: PoolName, eth: number, usd: number) =>
        updateMock((w) => ({ tETH: w.tETH + eth, tUSD: w.tUSD + usd, positions: { ...w.positions, [pool]: { liquidity: 0 } } })),
    }),
    [updateMock],
  );

  const { refetch } = reads;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { pair, ...state, refresh, mock, rememberSince };
}

