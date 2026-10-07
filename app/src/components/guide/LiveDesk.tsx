"use client";

// /app for a first visit (a Chainlink developer, often without a wallet): the desk now in one strip, then
// three moves, see it (the weather chart), verify it on Etherscan (one line per claim, from lib/guide.ts's
// verifyRows) and try it (wallet, test tokens, a swap on each pool, on /swap). One read of the live pair feeds
// all of it. The section ids (#start, #watch, #verify, #try) render on the server, so the landing's and the
// deck's links land on them while the chain loads.
import Link from "next/link";
import { type ReactNode, useMemo } from "react";
import { type ClimData, POLL_MS, useClimData } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import { GAS_FAUCETS, silentNote, stormProof, type VerifyRow, verifyRows } from "@/lib/guide";
import { formatAge, formatBp, pipsToBp, sigmaE9ToAnnualPct } from "@/lib/units";
import { AnimatedCounter } from "../AnimatedCounter";
import { ExtLink, ModeBadge } from "../ui";
import { WalletButton } from "../WalletButton";
import { WeatherChart } from "../WeatherChart";

/** Where each claim shows on the explorer, in a few words: the row's title says what, this says where to look. */
const WHERE: Record<VerifyRow["id"], string> = {
  report: "Logs tab: RiskReported, then ReportProcessed true",
  quote: "Read Contract tab: quoteFee() and state(), no wallet needed",
  swaps: "Logs tab: the Swap event's fee, in pips (100 pips = 1 bp)",
  storm: "The peak report, then the next swap on pool V",
  refused: "Logs tab: ReportProcessed false, no RiskReported",
  source: "Contract tab: the verified source",
  workflow: "GitHub: the workflow that writes every report",
};

const bp = (pips: number) => formatBp(pipsToBp(pips), 2);

const buttonCls =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-5 text-[15px] font-medium text-accent-fg transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function LiveDesk() {
  const data = useClimData("live");
  const proof = useMemo(
    () => (data.pair ? stormProof(data.reports, data.swaps, data.pair.V.poolId, params) : undefined),
    [data.reports, data.swaps, data.pair],
  );
  const rows = verifyRows(data, params, proof);
  const silent = silentNote(data.reports, data.nowSec, params);

  return (
    <div className="space-y-10">
      <section id="start" aria-label="The desk now" className="space-y-3">
        {silent ? (
          <p role="note" className="rounded-md bg-notice-bg px-4 py-3 text-sm leading-relaxed text-notice-fg">
            {silent}
          </p>
        ) : null}
        <LiveStrip data={data} />
      </section>

      <Move id="watch" n={1} title="See it" tag="No wallet">
        {data.status === "ready" ? (
          <WeatherChart
            id="watch-weather"
            data={data}
            initialWindow="All"
            level={3}
            subtitle="Top: ETH volatility from the CRE desk. Bottom: pool V's fee (line), the fees swaps really paid (dots) and pool S's fixed fee (dashed)."
          />
        ) : (
          <Loading data={data} className="h-[420px]" />
        )}
      </Move>

      <Move id="verify" n={2} title="Verify it on Etherscan" tag="No wallet">
        {data.status === "ready" ? (
          <ul role="list" className="divide-y divide-line rounded-lg border border-line bg-surface">
            {rows.map((r) => (
              <VerifyLine key={r.id} row={r} />
            ))}
          </ul>
        ) : (
          <Loading data={data} className="h-[360px]" />
        )}
      </Move>

      <Move id="try" n={3} title="Try it yourself" tag="Wallet on Sepolia">
        <ol className="grid gap-3 md:grid-cols-3">
          <TryStep n="a" title="Connect a wallet">
            <div className="flex min-h-11 items-center">
              <WalletButton />
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-subtle">
              Gas in Sepolia ETH:{" "}
              {GAS_FAUCETS.slice(0, 2).map((f, i) => (
                <span key={f.href}>
                  {i > 0 ? " or " : null}
                  <ExtLink href={f.href}>{f.name}</ExtLink>
                </span>
              ))}
              .
            </p>
          </TryStep>
          <TryStep n="b" title="Get test tokens">
            <Link className={buttonCls} href="/swap#faucet">
              Get tETH and tUSD
            </Link>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-subtle">From our faucet, once an hour per address.</p>
          </TryStep>
          <TryStep n="c" title="Swap on V, then on S">
            <Link className={buttonCls} href="/swap">
              Open Swap
            </Link>
            <p className="mt-3 text-[13px] leading-relaxed text-fg-subtle">Compare the fee each swap paid, read from its Swap event.</p>
          </TryStep>
        </ol>
      </Move>
    </div>
  );
}

/** The desk now, in four numbers: the last report, σ, pool V's fee with the hook's mode, pool S's fixed fee. */
function LiveStrip({ data }: { data: ClimData }) {
  const last = data.reports.at(-1);
  const desk = data.state?.desk;
  const q = data.state?.quote;
  const sFee = data.pair?.S.key.fee;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
      <Cell label="Last Chainlink CRE report" hint={last && desk ? `${formatAge(data.nowSec - desk.tObs)} ago · CRE simulator, 1 node` : "reading Sepolia…"}>
        {last ? `#${last.seq}` : "…"}
      </Cell>
      <Cell label="ETH volatility (σ)" hint="what the hook reads">
        {desk ? <AnimatedCounter value={sigmaE9ToAnnualPct(desk.sigmaE9)} decimals={1} suffix="%/yr" className="-my-[0.25em]" /> : "…"}
      </Cell>
      <Cell label="Pool V fee now · clim" hint={q ? <ModeBadge mode={q.mode} /> : "set on every swap"} accent>
        {q ? <AnimatedCounter value={pipsToBp(q.feePips)} decimals={2} suffix=" bp" className="-my-[0.25em]" /> : "…"}
      </Cell>
      <Cell label="Pool S fee · static twin" hint="fixed, same pair">
        {sFee !== undefined ? bp(sFee) : "…"}
      </Cell>
    </dl>
  );
}

function Cell({ label, hint, accent, children }: { label: string; hint: ReactNode; accent?: boolean; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-surface px-4 py-4 sm:px-5">
      <dt className="text-[13px] text-fg-subtle">{label}</dt>
      <dd className={`mt-1 font-display text-[28px] leading-tight tracking-tight tabular-nums sm:text-[32px] ${accent ? "text-v" : ""}`}>{children}</dd>
      <dd className="mt-1 text-xs text-fg-subtle">{hint}</dd>
    </div>
  );
}

/** One claim, one line: what is true now, where to look, and the explorer links that prove it. */
function VerifyLine({ row }: { row: VerifyRow }) {
  const links = row.links.filter((l) => l.href.startsWith("http"));
  return (
    <li className="flex flex-col gap-2 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center lg:gap-6">
      <span aria-hidden className="hidden text-v lg:block">
        ✓
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium">
          {row.title} {row.mode !== undefined ? <ModeBadge mode={row.mode} /> : null}
        </p>
        <p className="mt-0.5 text-[13px] text-fg-subtle">{WHERE[row.id]}</p>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] lg:max-w-[46%] lg:justify-end">
        {links.map((l) => (
          <ExtLink key={l.href} href={l.href}>
            {l.label}
          </ExtLink>
        ))}
      </p>
    </li>
  );
}

/** A numbered move: its number, its title and what it needs. */
function Move({ id, n, title, tag, children }: { id: string; n: number; title: string; tag: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span aria-hidden className="font-display text-[30px] leading-none text-v">
          {n}
        </span>
        <h2 id={`${id}-title`} className="font-display text-[28px] leading-tight tracking-[-0.02em]">
          {title}
        </h2>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-fg-muted">{tag}</span>
      </div>
      {children}
    </section>
  );
}

function TryStep({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="min-w-0 rounded-lg border border-line bg-surface p-5">
      <h3 className="mb-3 font-display text-lg">
        <span aria-hidden className="mr-2 text-v">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </li>
  );
}

/** The first chain read, or its failure, in the space the panel will take. */
function Loading({ data, className }: { data: ClimData; className: string }) {
  return data.status === "error" ? (
    <p className="text-sm text-danger">{`Could not reach Sepolia through the public RPCs. Retrying every ${POLL_MS / 1000} s.`}</p>
  ) : (
    <div className={`rounded-lg bg-surface-2 motion-safe:animate-pulse ${className}`}>
      <p role="status" className="p-5 text-sm text-fg-subtle">
        Reading the desk&apos;s reports and the pools&apos; swaps from Sepolia…
      </p>
    </div>
  );
}
