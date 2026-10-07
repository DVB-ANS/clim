"use client";

// /swap's first two steps, beside the swap card (step 3): a wallet on Sepolia with a little gas, then the test
// tokens from TestToken.faucet() on tETH and tUSD, with the wallet's balances.
import { type ReactNode, useMemo } from "react";
import { zeroAddress } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { useChainSteps } from "@/hooks/useChainSteps";
import { useTxFlow } from "@/hooks/useTxFlow";
import { testTokenAbi } from "@/lib/abis";
import { deployments } from "@/lib/config";
import { FAUCET, GAS_FAUCETS, TEST_RUN_GAS, TEST_RUN_MAX_GWEI } from "@/lib/guide";
import { writeReadiness } from "@/lib/tx";
import { formatAmount } from "@/lib/units";
import { ActionButton } from "./ChainNote";
import { TokenIcon } from "./dex";
import { TxSteps } from "./TxSteps";
import { ExtLink } from "./ui";
import { WalletButton } from "./WalletButton";

export function SwapSteps() {
  const { address } = useAccount();
  const { tETH, tUSD } = deployments.tokens;
  const ready = useMemo(() => writeReadiness(deployments, "faucet"), []);
  const flow = useTxFlow();
  const chain = useChainSteps();
  // read only with a wallet (the zero address stands in until then, and the query stays off)
  const owner = address ?? zeroAddress;
  const reads = useReadContracts({
    contracts: [
      { address: tETH ?? zeroAddress, abi: testTokenAbi, functionName: "balanceOf", args: [owner] },
      { address: tUSD ?? zeroAddress, abi: testTokenAbi, functionName: "balanceOf", args: [owner] },
    ],
    query: { enabled: !!address && !!tETH && !!tUSD, refetchInterval: 12_000 },
  });
  const [eth, usd] = reads.data ?? [];
  const balances =
    address && eth?.status === "success" && usd?.status === "success" ? { tETH: Number(eth.result) / 1e18, tUSD: Number(usd.result) / 1e18 } : undefined;
  // our own test run: both faucets, an approve and a swap on each pool (lib/guide.ts gives the receipts)
  const cost = (TEST_RUN_GAS * TEST_RUN_MAX_GWEI) / 1e9;

  async function faucet() {
    if (!tETH || !tUSD) return;
    const { ok } = await flow.start([chain.faucet(tETH, "tETH"), chain.faucet(tUSD, "tUSD")]);
    if (ok) void reads.refetch();
  }

  return (
    <ol className="space-y-3">
      <Step n={1} title="Connect a wallet on Sepolia">
        <div className="flex min-h-11 items-center">
          <WalletButton />
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-subtle">
          Gas is paid in Sepolia ETH, from{" "}
          {GAS_FAUCETS.map((f, i) => (
            <span key={f.href}>
              {i === 0 ? null : i === GAS_FAUCETS.length - 1 ? " or " : ", "}
              <ExtLink href={f.href}>{f.name}</ExtLink>
            </span>
          ))}
          . Our own try of steps 2 and 3 cost about {cost.toFixed(4)} Sepolia ETH.
        </p>
      </Step>
      <Step id="faucet" n={2} title="Get test tokens">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {(["tETH", "tUSD"] as const).map((t) => (
            <span key={t} className="flex items-center gap-2">
              <TokenIcon symbol={t} className="size-7" />
              <span>
                <span className="block font-display text-lg leading-none tabular-nums">{balances ? formatAmount(balances[t], t === "tETH" ? 4 : 2) : "–"}</span>
                <span className="text-xs text-fg-subtle">{t}</span>
              </span>
            </span>
          ))}
          <ActionButton disabled={!ready.ok || flow.running} onClick={faucet}>
            {flow.running ? "Sending…" : "Get tETH and tUSD"}
          </ActionButton>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-subtle">
          {`${FAUCET.tETH} tETH, then ${formatAmount(FAUCET.tUSD, 0)} tUSD: two transactions, once an hour per address.`}
        </p>
        <div className="mt-2">
          <TxSteps steps={flow.steps} />
        </div>
      </Step>
      <Step n={3} title="Swap on pool V, then on pool S">
        <p className="text-sm leading-relaxed text-fg-muted">
          The same amount on each, in the swap card. Each result shows the fee you paid, read from the Swap event, with its transaction.
        </p>
      </Step>
    </ol>
  );
}

function Step({ id, n, title, children }: { id?: string; n: number; title: string; children: ReactNode }) {
  return (
    <li id={id} className="min-w-0 rounded-lg border border-line bg-surface p-5">
      <h2 className="mb-3 font-display text-lg tracking-tight">
        <span aria-hidden className="mr-2 text-v">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </li>
  );
}
