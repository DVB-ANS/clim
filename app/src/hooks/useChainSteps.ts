"use client";

import type { Address, Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { poolModifyLiquidityTestAbi, poolSwapTestAbi, testTokenAbi } from "@/lib/abis";
import type { PoolKey } from "@/lib/deployments";
import { type SwapPlan, swapArgs } from "@/lib/swap";
import { type FlowStep, receiptLogs, withGasMargin } from "@/lib/tx";

export type LiquidityParams = { tickLower: number; tickUpper: number; liquidityDelta: bigint; salt: Hex };

/**
 * Real Sepolia writes (wagmi): one FlowStep per transaction, the receipt read back as RawLogs. Every write
 * is pinned to Sepolia (chainId), so if the wallet moves to another network between two steps of one flow,
 * the next step fails with a chain mismatch instead of sending a transaction there.
 */
export function useChainSteps() {
  const client = usePublicClient();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  async function mined(hash: Hex) {
    if (!client) throw new Error("No Sepolia RPC client");
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Transaction reverted (${hash})`);
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    return receiptLogs(receipt, Number(block.timestamp));
  }

  return {
    approve(token: Address, symbol: string, spender: Address, amount: bigint): FlowStep {
      return {
        label: `Approve ${symbol}`,
        run: async (onHash, onNote) => {
          if (client && address) {
            const allowance = await client.readContract({ address: token, abi: testTokenAbi, functionName: "allowance", args: [address, spender] });
            if (allowance >= amount) {
              onNote("already approved");
              return;
            }
          }
          const hash = await writeContractAsync({ address: token, abi: testTokenAbi, functionName: "approve", args: [spender, amount], chainId: sepolia.id });
          onHash(hash);
          await mined(hash);
        },
      };
    },
    swap(router: Address, plan: SwapPlan): FlowStep {
      return {
        label: `Swap on pool ${plan.pool}`,
        run: async (onHash) => {
          const call = { address: router, abi: poolSwapTestAbi, functionName: "swap", args: swapArgs(plan) } as const;
          const gas = client && address ? withGasMargin(await client.estimateContractGas({ ...call, account: address })) : undefined;
          const hash = await writeContractAsync({ ...call, gas, chainId: sepolia.id });
          onHash(hash);
          return mined(hash);
        },
      };
    },
    faucet(token: Address, symbol: string): FlowStep {
      return {
        label: `Faucet ${symbol}`,
        run: async (onHash) => {
          const hash = await writeContractAsync({ address: token, abi: testTokenAbi, functionName: "faucet", chainId: sepolia.id });
          onHash(hash);
          await mined(hash);
        },
      };
    },
    modifyLiquidity(router: Address, key: PoolKey, params: LiquidityParams, label: string): FlowStep {
      return {
        label,
        run: async (onHash) => {
          const call = { address: router, abi: poolModifyLiquidityTestAbi, functionName: "modifyLiquidity", args: [key, params, "0x"] } as const;
          const gas = client && address ? withGasMargin(await client.estimateContractGas({ ...call, account: address })) : undefined;
          const hash = await writeContractAsync({ ...call, gas, chainId: sepolia.id });
          onHash(hash);
          return mined(hash);
        },
      };
    },
  };
}
