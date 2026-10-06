// viem clients and the per-block reads shared by arb.ts, noise.ts and status.ts.
import {
  climHookAbi,
  ethUsdFromSqrtPriceX96,
  orientationOf,
  riskDeskAbi,
  stateViewAbi,
  testTokenAbi,
  type DeskState,
  type Deployments,
  type PairOrientation,
  type ResolvedPair,
} from "@clim/shared";
import { createPublicClient, createWalletClient, http, nonceManager, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { rpcUrl } from "./env";

export function publicClientFor(url: string = rpcUrl()) {
  return createPublicClient({ chain: sepolia, transport: http(url) });
}
export type Client = ReturnType<typeof publicClientFor>;

/** nonceManager lets one process send several transactions per block without waiting for receipts. */
export function walletFor(privateKey: Hex, url: string = rpcUrl()) {
  return createWalletClient({ account: privateKeyToAccount(privateKey, { nonceManager }), chain: sepolia, transport: http(url) });
}
export type Wallet = ReturnType<typeof walletFor>;

export type PoolState = { sqrtPriceX96: bigint; tick: number; protocolFee: number; lpFee: number; ethUsd: number };
export type PairState = {
  blockNumber: bigint | undefined;
  V: PoolState;
  S: PoolState;
  hookFee: number;
  hookMode: number;
  desk: DeskState;
};

/** One multicall (Multicall3 on Sepolia): slot0 of V and S, hook quoteFee(), RiskDesk state(). */
export async function readPairState(client: Client, d: Deployments, p: ResolvedPair, blockNumber?: bigint): Promise<PairState> {
  const [v, s, q, st] = await client.multicall({
    allowFailure: false,
    blockNumber,
    contracts: [
      { address: d.uniswap.stateView, abi: stateViewAbi, functionName: "getSlot0", args: [p.V.poolId] },
      { address: d.uniswap.stateView, abi: stateViewAbi, functionName: "getSlot0", args: [p.S.poolId] },
      { address: p.hook, abi: climHookAbi, functionName: "quoteFee" },
      { address: p.desk, abi: riskDeskAbi, functionName: "state" },
    ],
  });
  const pool = (x: typeof v, o: PairOrientation): PoolState => ({
    sqrtPriceX96: x[0],
    tick: x[1],
    protocolFee: x[2],
    lpFee: x[3],
    ethUsd: ethUsdFromSqrtPriceX96(x[0], o),
  });
  return {
    blockNumber,
    V: pool(v, orientationOf(p.V, d)),
    S: pool(s, orientationOf(p.S, d)),
    hookFee: q[0],
    hookMode: q[1],
    desk: { tObs: st[0], sigmaE9: st[1], kE4: st[2], flags: st[3], seq: st[4] },
  };
}

/** Native ETH for gas, the pair's two test tokens, and their allowances to the router the bot swaps through. */
export type Balances = { native: bigint; ethToken: bigint; usdToken: bigint; ethAllowance: bigint; usdAllowance: bigint };

export async function readBalances(client: Client, p: ResolvedPair, owner: Address, router: Address, blockNumber?: bigint): Promise<Balances> {
  const [ethToken, usdToken, ethAllowance, usdAllowance] = await client.multicall({
    allowFailure: false,
    blockNumber,
    contracts: [
      { address: p.tETH.address, abi: testTokenAbi, functionName: "balanceOf", args: [owner] },
      { address: p.tUSD.address, abi: testTokenAbi, functionName: "balanceOf", args: [owner] },
      { address: p.tETH.address, abi: testTokenAbi, functionName: "allowance", args: [owner, router] },
      { address: p.tUSD.address, abi: testTokenAbi, functionName: "allowance", args: [owner, router] },
    ],
  });
  const native = await client.getBalance({ address: owner, blockNumber });
  return { native, ethToken, usdToken, ethAllowance, usdAllowance };
}
