"use client";

import type { ReactElement } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type LabReplay, replayRows } from "@/lib/lab";
import { extent } from "@/lib/series";
import { COLORS, utcTime } from "@/lib/theme";
import { ChartTooltip, TOOLTIP } from "./ChartTooltip";

const tick = { fontSize: 12, fill: COLORS.muted };
// legends read "Pool V, Pool S", in the order the cards name them (Recharts sorts alphabetically by default)
const vFirst = (item: { value?: unknown }) => (item.value === "Pool V" ? 0 : 1);

/** One chart of the replay, a picture to assistive tech (no keyboard layer) whose text is `text`. */
function Row({ title, text, children }: { title: string; text: string; children: ReactElement }) {
  return (
    <div>
      <div className="text-xs font-medium text-fg-muted">{title}</div>
      <div className="h-40 w-full" role="img" aria-label={text}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

export function ReplayCharts({ replay }: { replay: LabReplay }) {
  const data = replayRows(replay);
  const usd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const span = (xs: Array<number | undefined>, f: (v: number) => string) => {
    const e = extent(xs);
    return e ? `${f(e[0])} to ${f(e[1])}` : "no data";
  };
  const last = data.at(-1);
  const x = <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={utcTime} tick={tick} />;
  const tip = (
    <Tooltip
      {...TOOLTIP}
      content={
        <ChartTooltip
          only={["price", "sigmaAnnualPct", "feeVBp", "feeSBp", "arbCumVUsd", "arbCumSUsd"]}
          labelFormat={(t) => `${utcTime(Number(t))} UTC`}
          valueFormat={(v, key) =>
            key === "sigmaAnnualPct" ? `${v.toFixed(1)}%` : key.startsWith("fee") ? `${v.toFixed(2)} bp` : key.startsWith("arb") ? `${usd(v)} per $1M` : usd(v)
          }
        />
      }
    />
  );
  return (
    <div className="space-y-2">
      {replay.price ? (
        <Row title="ETH/USD" text={`ETH/USD over the replay window: ${span(data.map((r) => r.price), (v) => usd(v))}.`}>
          <LineChart accessibilityLayer={false} data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />{x}<YAxis domain={["auto", "auto"]} tick={tick} width={56} />{tip}
            <Line dataKey="price" name="ETH/USD" stroke={COLORS.ink} dot={false} strokeWidth={1.5} isAnimationActive={false} />
          </LineChart>
        </Row>
      ) : null}
      <Row title="σ from the desk (annualized %)" text={`σ from the desk over the replay: ${span(data.map((r) => r.sigmaAnnualPct), (v) => `${v.toFixed(0)}%`)} a year.`}>
        <LineChart accessibilityLayer={false} data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />{x}<YAxis unit="%" tick={tick} width={56} />{tip}
          <Line type="stepAfter" dataKey="sigmaAnnualPct" name="σ" stroke={COLORS.sigma} dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </Row>
      <Row
        title="Fee (bp): pool V follows the storm, pool S stays at V's average"
        text={`Fee over the replay: pool V ${span(data.map((r) => r.feeVBp), (v) => `${v.toFixed(1)} bp`)}, pool S fixed at ${replay.feeSBp.toFixed(2)} bp, V's average.`}
      >
        <LineChart accessibilityLayer={false} data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />{x}<YAxis unit=" bp" tick={tick} width={56} />{tip}<Legend wrapperStyle={{ fontSize: 12 }} itemSorter={vFirst} />
          <Line type="stepAfter" dataKey="feeVBp" name="Pool V" stroke={COLORS.V} dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="feeSBp" name="Pool S" stroke={COLORS.S} strokeDasharray="6 3" dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </Row>
      <Row
        title="Lost to arbitrage, cumulative, net of the fees arbitrageurs paid (USD per $1M of liquidity, lab)"
        text={last ? `Cumulative LP losses to arbitrage net of fees at the end of the lab's replay: pool V ${usd(last.arbCumVUsd)}, pool S ${usd(last.arbCumSUsd)} per $1M of liquidity.` : "No data."}
      >
        <LineChart accessibilityLayer={false} data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />{x}<YAxis tick={tick} width={56} />{tip}<Legend wrapperStyle={{ fontSize: 12 }} itemSorter={vFirst} />
          <Line dataKey="arbCumVUsd" name="Pool V" stroke={COLORS.V} dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line dataKey="arbCumSUsd" name="Pool S" stroke={COLORS.S} strokeDasharray="6 3" dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </Row>
    </div>
  );
}
