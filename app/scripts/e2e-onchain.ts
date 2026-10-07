// End-to-end check of /swap and /lp on Sepolia, by script, with the app's own call builders: the same ABIs
// (src/lib/abis.ts), deployment (src/generated/sepolia.json), PoolKeys, default amounts (0.5 tETH swapped,
// 1 tETH of liquidity), price limits, approvals (exact for a swap, +1 % for an add), salt (the wallet's
// address) and gas margin (+25 % over the estimate) as the UI, and the same decoder for the Swap event's fee.
//
// Run: npm run e2e:onchain -- <env file holding TEST_PRIVATE_KEY=0x...> [--out <summary.json>]
// The key is read from that file and never printed. Testnet key, test tokens only.
//
// Steps: TestToken.faucet() on tETH and tUSD (FaucetCooldown is decoded and skipped), a 0.5 tETH swap on
// pool V (clim) and on pool S through PoolSwapTest, each Swap.fee checked against ClimHook.quoteFee() (V,
// read in the swap's block or the one before) and S's PoolKey fee; then a 1 tETH full-range add on V and on
// S through PoolModifyLiquidityTest, the position read back from StateView, and removed.
import { readFileSync, writeFileSync } from "node:fs";
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  fallback,
  type Hex,
  http,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { climHookAbi, poolModifyLiquidityTestAbi, poolSwapTestAbi, stateViewAbi, testTokenAbi } from "@/lib/abis";
import { makeClient, rpcUrls } from "@/lib/chain";
import { deployments } from "@/lib/config";
import type { PoolKey } from "@/lib/deployments";
import { amountsForLiquidity, approvalWithMargin, fullRangeParams, fullRangeTicks, liquidityForEth, saltFor } from "@/lib/liquidity";
import { planSwap, type PoolName, swapArgs, swapResult } from "@/lib/swap";
import { receiptLogs, withGasMargin } from "@/lib/tx";

const SWAP_AMOUNT = "0.5"; // SwapForm's default
const LP_ETH = 1; // LiquidityForm's default

type TxRecord = { step: string; hash: Hex; block: number; status: string; gasUsed: string };
type Check = { check: string; ok: boolean; detail: string };

function readKey(file: string): Hex {
  const line = readFileSync(file, "utf8").split("\n").find((l) => /^\s*(export\s+)?TEST_PRIVATE_KEY\s*=/.test(l));
  const raw = line?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  const key = raw && !raw.startsWith("0x") ? `0x${raw}` : raw;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`no TEST_PRIVATE_KEY in ${file}`);
  return key as Hex;
}

async function main() {
  const args = process.argv.slice(2);
  const keyFile = args.find((a) => !a.startsWith("--"));
  const outIdx = args.indexOf("--out");
  const outFile = outIdx >= 0 ? args[outIdx + 1] : undefined;
  if (!keyFile) throw new Error("usage: npm run e2e:onchain -- <env file with TEST_PRIVATE_KEY> [--out summary.json]");

  const pair = deployments.pairs.live;
  const { tETH, tUSD } = deployments.tokens;
  const swapRouter = deployments.uniswap.poolSwapTest;
  const lpRouter = deployments.uniswap.poolModifyLiquidityTest;
  if (!pair || !tETH || !tUSD || !lpRouter) throw new Error("src/generated/sepolia.json has no live pair: run npm run sync");

  const account = privateKeyToAccount(readKey(keyFile));
  const me = account.address;
  const pc = makeClient();
  const wc = createWalletClient({ account, chain: sepolia, transport: fallback(rpcUrls().map((u) => http(u, { timeout: 30_000 }))) });
  const txs: TxRecord[] = [];
  const checks: Check[] = [];
  const check = (name: string, ok: boolean, detail: string) => {
    checks.push({ check: name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
  };

  async function send(step: string, write: () => Promise<Hex>): Promise<TransactionReceipt> {
    const hash = await write();
    const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 180_000 });
    txs.push({ step, hash, block: Number(receipt.blockNumber), status: receipt.status, gasUsed: receipt.gasUsed.toString() });
    console.log(`tx    ${step}: ${hash} (block ${receipt.blockNumber}, ${receipt.status})`);
    if (receipt.status !== "success") throw new Error(`${step} reverted: ${hash}`);
    return receipt;
  }

  const balances = async () => {
    const [e, u, w] = await Promise.all([
      pc.readContract({ address: tETH, abi: testTokenAbi, functionName: "balanceOf", args: [me] }),
      pc.readContract({ address: tUSD, abi: testTokenAbi, functionName: "balanceOf", args: [me] }),
      pc.getBalance({ address: me }),
    ]);
    return { tETH: Number(e) / 1e18, tUSD: Number(u) / 1e18, eth: Number(w) / 1e18 };
  };
  console.log(`wallet ${me}`, await balances());

  // 1. Faucet (FaucetCard: "Get tETH and tUSD", two faucet() transactions).
  for (const [token, symbol] of [[tETH, "tETH"], [tUSD, "tUSD"]] as const) {
    try {
      const { request } = await pc.simulateContract({ account, address: token, abi: testTokenAbi, functionName: "faucet" });
      await send(`Faucet ${symbol}`, () => wc.writeContract(request));
    } catch (e) {
      const reverted = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
      if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName === "FaucetCooldown") {
        const nextAt = Number(reverted.data.args?.[0] ?? 0);
        console.log(`skip  Faucet ${symbol}: FaucetCooldown, next faucet at ${new Date(nextAt * 1000).toISOString()}`);
        check(`faucet ${symbol} cooldown decoded`, true, `FaucetCooldown(nextAt = ${nextAt})`);
      } else throw e;
    }
  }
  console.log("after faucet", await balances());

  // The UI's approve step: skip when the allowance already covers the amount, else approve exactly that amount.
  async function approve(token: Address, symbol: string, spender: Address, amount: bigint) {
    const allowance = await pc.readContract({ address: token, abi: testTokenAbi, functionName: "allowance", args: [me, spender] });
    if (allowance >= amount) {
      console.log(`skip  Approve ${symbol}: already approved`);
      return;
    }
    await send(`Approve ${symbol} for ${spender === swapRouter ? "PoolSwapTest" : "PoolModifyLiquidityTest"}`, () =>
      wc.writeContract({ address: token, abi: testTokenAbi, functionName: "approve", args: [spender, amount] }),
    );
  }

  // 2. Swaps (SwapForm: approve the input, then PoolSwapTest.swap), the fee read from the Swap event.
  for (const pool of ["V", "S"] as PoolName[]) {
    const plan = planSwap({ pair, tETH, tUSD, pool, side: "sell ETH", amount: SWAP_AMOUNT });
    await approve(plan.tokenIn, "tETH", swapRouter, plan.amountIn);
    const call = { address: swapRouter, abi: poolSwapTestAbi, functionName: "swap", args: swapArgs(plan) } as const;
    const receipt = await send(`Swap ${SWAP_AMOUNT} tETH on pool ${pool}`, async () =>
      wc.writeContract({ ...call, gas: withGasMargin(await pc.estimateContractGas({ ...call, account })) }),
    );
    const block = await pc.getBlock({ blockNumber: receipt.blockNumber });
    const swap = swapResult(receiptLogs(receipt, Number(block.timestamp)), plan.poolId);
    if (!swap) throw new Error(`no Swap event of pool ${pool} in ${receipt.transactionHash}`);
    if (pool === "V") {
      const at = async (n: bigint) => pc.readContract({ address: pair.hook, abi: climHookAbi, functionName: "quoteFee", blockNumber: n });
      const [before, same] = await Promise.all([at(receipt.blockNumber - 1n), at(receipt.blockNumber)]);
      const ok = swap.fee === before[0] || swap.fee === same[0];
      check(
        "V: Swap.fee equals ClimHook.quoteFee()",
        ok,
        `Swap.fee ${swap.fee} pips; quoteFee() ${before[0]} (mode ${before[1]}) at block ${receipt.blockNumber - 1n}, ${same[0]} (mode ${same[1]}) at block ${receipt.blockNumber}`,
      );
    } else {
      check("S: Swap.fee equals its PoolKey fee", swap.fee === pair.S.key.fee, `Swap.fee ${swap.fee} pips, PoolKey fee ${pair.S.key.fee} pips`);
    }
  }
  console.log("after swaps", await balances());

  // 3. Liquidity (LiquidityBoard: approve tETH and tUSD +1 %, full-range add with salt = the wallet, read back, remove).
  const { tickLower, tickUpper } = fullRangeTicks(pair.V.key.tickSpacing);
  const position = async (poolId: Hex) =>
    (await pc.readContract({ address: deployments.uniswap.stateView, abi: stateViewAbi, functionName: "getPositionInfo", args: [poolId, lpRouter, tickLower, tickUpper, saltFor(me)] }))[0];
  const modify = (key: PoolKey, delta: bigint, step: string) => {
    const call = { address: lpRouter, abi: poolModifyLiquidityTestAbi, functionName: "modifyLiquidity", args: [key, fullRangeParams(key.tickSpacing, delta, me), "0x"] } as const;
    return send(step, async () => wc.writeContract({ ...call, gas: withGasMargin(await pc.estimateContractGas({ ...call, account })) }));
  };

  for (const pool of ["V", "S"] as PoolName[]) {
    const { poolId, key } = pair[pool];
    const [sqrtPriceX96] = await pc.readContract({ address: deployments.uniswap.stateView, abi: stateViewAbi, functionName: "getSlot0", args: [poolId] });
    const sqrtP = Number(sqrtPriceX96) / 2 ** 96;
    const liquidity = liquidityForEth(LP_ETH * 1e18, sqrtP, tickLower, tickUpper, pair.token0IsEth);
    const { amount0, amount1 } = amountsForLiquidity(liquidity, sqrtP, tickLower, tickUpper);
    const [eth, usd] = pair.token0IsEth ? [amount0 / 1e18, amount1 / 1e18] : [amount1 / 1e18, amount0 / 1e18];
    await approve(tETH, "tETH", lpRouter, approvalWithMargin(eth));
    await approve(tUSD, "tUSD", lpRouter, approvalWithMargin(usd));
    const before = await position(poolId);
    const delta = BigInt(Math.floor(liquidity));
    await modify(key, delta, `Add ${LP_ETH} tETH of full-range liquidity to pool ${pool}`);
    const added = await position(poolId);
    check(`${pool}: position read back from StateView`, added - before === delta, `liquidity ${before} -> ${added} (added ${delta}, ≈ ${eth.toFixed(4)} tETH + ${usd.toFixed(2)} tUSD)`);
    await modify(key, -added, `Remove the liquidity from pool ${pool}`);
    const removed = await position(poolId);
    check(`${pool}: position removed`, removed === 0n, `liquidity ${added} -> ${removed}`);
  }
  console.log("after liquidity", await balances());

  const failed = checks.filter((c) => !c.ok).length;
  const summary = { wallet: me, at: new Date().toISOString(), txs, checks, failed };
  if (outFile) writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`${txs.length} transactions, all status success; ${checks.length - failed} of ${checks.length} checks pass`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof BaseError ? e.shortMessage : e instanceof Error ? e.message : e);
  process.exit(1);
});
