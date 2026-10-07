// "Try it yourself": the four steps of a first on-chain try (gas, test tokens, a swap on each pool, the
// fees compared). No hooks, so it renders in StartHere (client) and on /swap (server). Every number comes
// from lib/guide.ts (each with its source), params or the synced deployment.
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { deployments, params } from "@/lib/config";
import { FAUCET, GAS_FAUCETS, TEST_RUN_GAS, TEST_RUN_MAX_GWEI } from "@/lib/guide";
import { formatAmount, formatBp, pipsToBp } from "@/lib/units";
import { ExtLink, linkCls } from "../ui";

const bp = (pips: number) => formatBp(pipsToBp(pips), 2);

export function TrySteps({ layout = "list", here }: { layout?: "list" | "row"; here?: "swap" }) {
  const cost = (TEST_RUN_GAS * TEST_RUN_MAX_GWEI) / 1e9;
  const sFee = deployments.pairs.live?.S.key.fee;
  const steps: ReactNode[] = [
    <>
      Get a little Sepolia ETH for gas from a public faucet:{" "}
      {GAS_FAUCETS.map((f, i) => (
        <Fragment key={f.href}>
          <ExtLink href={f.href}>{f.name}</ExtLink> ({f.note})
          {i < GAS_FAUCETS.length - 2 ? ", " : i === GAS_FAUCETS.length - 2 ? " or " : ". "}
        </Fragment>
      ))}
      {`Our own test run of steps 2 and 3 used about ${(TEST_RUN_GAS / 1e6).toFixed(1)} million gas, about ${cost.toFixed(4)} Sepolia ETH at the gas price it paid.`}
    </>,
    <>
      Get test tokens on{" "}
      <Link className={linkCls} href="/lp#faucet">
        Liquidity
      </Link>
      {`: the faucet sends ${FAUCET.tETH} tETH, then ${formatAmount(FAUCET.tUSD, 0)} tUSD, in two transactions, once an hour per address.`}
    </>,
    <>
      Swap the same amount on pool V, then on pool S
      {here === "swap" ? (
        " in the swap card above."
      ) : (
        <>
          {" "}
          on{" "}
          <Link className={linkCls} href="/swap">
            Swap
          </Link>
          .
        </>
      )}
    </>,
    <>
      Compare the fee each swap paid: the result reads it from the Swap event and links the transaction.
      {sFee !== undefined ? (
        <>
          {` In calm weather pool V charges its ${bp(params.feeMinPips)} floor and pool S its fixed ${bp(sFee)}; when volatility rises, V charges more (see the storm line under `}
          <Link className={linkCls} href="/app#verify">
            Verify it on chain
          </Link>
          ).
        </>
      ) : null}
    </>,
  ];

  if (layout === "row") {
    return (
      <ol className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={i} className="min-w-0 rounded-md bg-surface p-3 leading-relaxed shadow-[0_0_0_1px_var(--clim-line)]">
            <span className="block font-display text-2xl leading-none text-v">{i + 1}</span>
            <p className="mt-2">{s}</p>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
      {steps.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ol>
  );
}
