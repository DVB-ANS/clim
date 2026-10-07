"use client";

// "Start here" on /app: three ways for a first-time visitor (a judge, often with no wallet) to check
// clim, kept apart: watch it run, verify it on chain, try it with a wallet. Dashboard renders it above
// its loading branch, so #start, #watch, #verify and #try are in the server render and work as anchors
// from any page. It reads only the Dashboard's data: no second fetch.
import Link from "next/link";
import { type ReactNode, useMemo } from "react";
import { type ClimData, POLL_MS } from "@/hooks/useClimData";
import { params } from "@/lib/config";
import type { Pair } from "@/lib/deployments";
import { silentNote, stormProof, verifyRows } from "@/lib/guide";
import { ExtLink, linkCls, ModeBadge } from "../ui";
import { TrySteps } from "./TrySteps";

export function StartHere({ data, pair }: { data: ClimData; pair: Pair }) {
  const proof = useMemo(
    () => (data.pair ? stormProof(data.reports, data.swaps, data.pair.V.poolId, params) : undefined),
    [data.reports, data.swaps, data.pair],
  );
  const rows = verifyRows(data, params, proof);
  const silent = pair === "live" && data.source === "sepolia" ? silentNote(data.reports, data.nowSec, params) : undefined;

  return (
    <section id="start" aria-labelledby="start-title" className="rounded-lg bg-wash p-4 sm:p-5 lg:p-6">
      <h2 id="start-title" className="font-display text-[22px] tracking-[-0.02em]">
        Start here
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        Three ways to check clim. The first two need no wallet. To understand it first, read{" "}
        <Link className={linkCls} href="/how">
          how it works
        </Link>
        .{" "}
        <a className={linkCls} href="#dashboard">
          Skip to the live dashboard
        </a>
        .
      </p>
      {silent ? (
        <p role="note" className="mt-3 rounded-md bg-surface px-4 py-3 text-sm leading-relaxed text-notice-fg">
          {silent}
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.35fr_1fr] lg:gap-4">
        <Path id="watch" n={1} title="Watch it run" tag="No wallet">
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed marker:text-fg-subtle">
            <li>
              <a className={linkCls} href="#desk">
                Risk desk
              </a>
              {silent
                ? `: The last report from the Chainlink CRE workflow (simulator, one node): its number, its age and the volatility it carried.`
                : `: A report from the Chainlink CRE workflow (simulator, one node) lands every 30 s: its number goes up and its age starts again from zero.`}
            </li>
            <li>
              <a className={linkCls} href="#weather">
                Weather chart
              </a>
              {`: Top, ETH volatility (σ). Bottom, pool V's fee follows it; pool S's fixed fee is the dashed line, and the dots are fees that swaps really paid.`}
            </li>
            <li>
              <a className={linkCls} href="#pnl">
                Profit and loss
              </a>
              {`: Pool V against pool S, as a hedged LP sees them, from the Swap events and the desk's reports.`}
            </li>
            <li>
              <Link className={linkCls} href="/replay">
                The 4 February storm
              </Link>
              {`: A real storm, replayed on Sepolia: V's fee climbs with σ, then the result against S.`}
            </li>
          </ol>
        </Path>
        <Path id="verify" n={2} title="Verify it on chain" tag="No wallet">
          <p className="mt-3 text-sm text-fg-muted">{`Each line comes from Sepolia's logs or a contract read, with a link to check it on Etherscan. The last two link the code itself.`}</p>
          {data.source === "mock" ? (
            <Note>This build reads simulated data, so there is nothing to check on chain.</Note>
          ) : pair !== "live" ? (
            <Note>These checks read the live pair. Select Live pair below to see them.</Note>
          ) : data.status === "loading" ? (
            <Note>Reading the desk and the pools on Sepolia. The first load takes a few seconds.</Note>
          ) : data.status === "error" ? (
            <Note>{`Could not reach Sepolia through the public RPCs. Retrying every ${POLL_MS / 1000} s.`}</Note>
          ) : (
            <ul role="list" className="mt-3 space-y-3">
              {rows.map((r) => (
                <li key={r.id} className="min-w-0">
                  <p className="text-[15px] font-medium">
                    {r.title} {r.mode !== undefined ? <ModeBadge mode={r.mode} /> : null}
                  </p>
                  {/* the explanation folds away below lg, so the live panels are not four phone screens down */}
                  <p className="mt-0.5 hidden text-[13px] leading-relaxed text-fg-muted lg:block">{r.detail}</p>
                  <details className="mt-0.5 lg:hidden">
                    <summary className="inline-flex min-h-6 cursor-pointer items-center rounded-sm text-[13px] text-fg-subtle focus-visible:outline-2 focus-visible:outline-accent">
                      What Etherscan shows
                    </summary>
                    <p className="text-[13px] leading-relaxed text-fg-muted">{r.detail}</p>
                  </details>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
                    {r.links.map((l) =>
                      l.href.startsWith("http") ? (
                        <ExtLink key={l.label} href={l.href}>
                          {l.label}
                        </ExtLink>
                      ) : (
                        <a key={l.label} className={linkCls} href={l.href}>
                          {l.label}
                        </a>
                      ),
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Path>
        <Path id="try" n={3} title="Try it yourself" tag="Wallet and Sepolia ETH">
          <TrySteps layout="list" />
        </Path>
      </div>
    </section>
  );
}

/** One of the three paths: a numbered card with its title and what it needs. */
function Path({ id, n, title, tag, children }: { id: string; n: number; title: string; tag: string; children: ReactNode }) {
  return (
    <article id={id} aria-labelledby={`${id}-title`} className="min-w-0 rounded-md bg-surface p-4 shadow-[0_0_0_1px_var(--clim-line)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span aria-hidden className="font-display text-2xl leading-none text-v">
          {n}
        </span>
        <h3 id={`${id}-title`} className="font-display text-lg">
          {title}
        </h3>
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-fg-muted">{tag}</span>
      </div>
      {children}
    </article>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-sm text-fg-subtle">{children}</p>;
}
