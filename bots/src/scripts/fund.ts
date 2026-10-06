// Funding and approvals for every bot key present in bots/.env (idempotent: only tops up what is missing).
// - ETH for gas, sent from DEPLOYER_PRIVATE_KEY;
// - tETH and tUSD minted by the deployer (TestToken owner) through TestToken.mint;
// - each bot approves the router it swaps through (PoolSwapTest pulls the input with transferFrom):
//   arbitrage keys -> routers.arb (or the shared PoolSwapTest until it exists), retail keys -> the shared PoolSwapTest.
// Run it while the CRE loop is stopped if DEPLOYER_PRIVATE_KEY is also the CRE operator key (one nonce sequence).
// Usage: bun src/scripts/fund.ts
import { arbRouter, loadDeployments, requireValue, testTokenAbi, type TokenEntry } from "@clim/shared";
import { formatEther, formatUnits, maxUint256, parseEther, parseUnits, type Address, type Hex } from "viem";
import { publicClientFor, walletFor } from "../lib/chain";
import { envStr, privateKeyFromEnv } from "../lib/env";

const d = loadDeployments();
const tETH = requireValue(d.tokens.tETH, "tokens.tETH");
const tUSD = requireValue(d.tokens.tUSD, "tokens.tUSD");
const client = publicClientFor();
const deployer = walletFor(privateKeyFromEnv("DEPLOYER_PRIVATE_KEY"));
const FUND_ETH = parseEther(envStr("FUND_ETH", "0.2"));
const MIN_ETH = parseEther(envStr("FUND_MIN_ETH", "0.05"));
const MINT: Array<[TokenEntry, bigint]> = [
  [tETH, parseUnits(envStr("MINT_TETH", "1000000"), tETH.decimals)],
  [tUSD, parseUnits(envStr("MINT_TUSD", "10000000000"), tUSD.decimals)],
];
const BOT_KEYS = ["ARB_LIVE", "NOISE_LIVE", "ARB_REPLAY", "NOISE_REPLAY"] as const;

async function fundOne(name: string, key: Hex, router: Address): Promise<void> {
  const bot = walletFor(key);
  const addr = bot.account.address;
  const eth = await client.getBalance({ address: addr });
  if (eth < MIN_ETH) {
    const hash = await deployer.sendTransaction({ to: addr, value: FUND_ETH });
    await client.waitForTransactionReceipt({ hash });
    console.log(`[fund] ${name} ${addr}: sent ${formatEther(FUND_ETH)} ETH (${hash})`);
  }
  for (const [token, amount] of MINT) {
    const bal = await client.readContract({ address: token.address, abi: testTokenAbi, functionName: "balanceOf", args: [addr] });
    if (bal < amount / 2n) {
      const hash = await deployer.writeContract({ address: token.address, abi: testTokenAbi, functionName: "mint", args: [addr, amount] });
      await client.waitForTransactionReceipt({ hash });
      console.log(`[fund] ${name}: minted ${formatUnits(amount, token.decimals)} ${token.symbol} (${hash})`);
    }
    const allowance = await client.readContract({ address: token.address, abi: testTokenAbi, functionName: "allowance", args: [addr, router] });
    if (allowance < maxUint256 / 2n) {
      const hash = await bot.writeContract({ address: token.address, abi: testTokenAbi, functionName: "approve", args: [router, maxUint256] });
      await client.waitForTransactionReceipt({ hash });
      console.log(`[fund] ${name}: approved ${router} for ${token.symbol} (${hash})`);
    }
  }
  console.log(`[fund] ${name} ${addr} ready: ${formatEther(await client.getBalance({ address: addr }))} ETH`);
}

for (const name of BOT_KEYS) {
  const env = `${name}_PRIVATE_KEY`;
  if (!process.env[env]) {
    console.log(`[fund] ${env} not set: skipped`);
    continue;
  }
  const router = name.startsWith("ARB") ? arbRouter(d) : d.uniswap.poolSwapTest;
  await fundOne(name, privateKeyFromEnv(env), router);
}
console.log(`[fund] deployer ${deployer.account.address} left with ${formatEther(await client.getBalance({ address: deployer.account.address }))} ETH`);
