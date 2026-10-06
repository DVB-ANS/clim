"use client";

import type { ReactElement } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type LabReplay, replayRows } from "@/lib/lab";
import { COLORS, utcTime } from "@/lib/theme";

const tick = { fontSize: 11, fill: COLORS.muted };

function Row({ title, children }: { title: string; children: ReactElement }) {
  return (
    <div>
      <div className="text-xs font-medium text-fg-muted">{title}</div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

export function ReplayCharts({ replay }: { replay: LabReplay }) {
  const data = replayRows(replay);
  const x = <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={utcTime} tick={tick} />;
  const tip = <Tooltip labelFormatter={(t) => `${utcTime(Number(t))} UTC`} formatter={(v) => Number(v).toFixed(2)} />;
  return (
    <div className="space-y-2">
      {replay.price ? (
        <Row title="ETH/USD">
          <LineChart data={data} syncId="replay" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={COLORS.grid} vertical={false} />{x}<YAxis domain={["auto", "auto"]} tick={tick} width={56} />{tip}
            <Line dataKey="price" name="ETH/USD" stroke={COLORS.ink} dot={false} strokeWidth={1.5} isAnimationActive={false} />
          </LineChart>
        </Row>
      ) : null}
      <Row title="σ from the desk (annualised %)">
        <LineChart data={data} syncId="replay" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />{x}<YAxis unit="%" tick={tick} width={56} />{tip}
          <Line type="stepAfter" dataKey="sigmaAnnualPct" name="σ" stroke={COLORS.sigma} dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </Row>
      <Row title="Fee (bp): V follows the storm, S is static at the same time-average">
        <LineChart data={data} syncId="replay" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />{x}<YAxis unit=" bp" tick={tick} width={56} />{tip}<Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="stepAfter" dataKey="feeVBp" name="V (clim)" stroke={COLORS.V} dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="feeSBp" name="S (static)" stroke={COLORS.S} strokeDasharray="6 3" dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </Row>
      <Row title="Cumulative ARB: LP losses to arbitrage net of fees (USD)">
        <LineChart data={data} syncId="replay" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={COLORS.grid} vertical={false} />{x}<YAxis tick={tick} width={56} />{tip}<Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="arbCumVUsd" name="V (clim)" stroke={COLORS.V} dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line dataKey="arbCumSUsd" name="S (static)" stroke={COLORS.S} dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </Row>
    </div>
  );
}
