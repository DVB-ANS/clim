import type { StepState, StepStatus } from "@/lib/tx";
import { TxLink } from "./ui";

const ICON: Record<StepStatus, string> = { waiting: "○", signing: "◔", pending: "◑", done: "●", failed: "✕" };
const TEXT: Record<StepStatus, string> = {
  waiting: "waiting",
  signing: "confirm in your wallet",
  pending: "waiting for Sepolia",
  done: "done",
  failed: "failed",
};

/** The steps of a transaction flow, each with its status and hash (Etherscan link when live). */
export function TxSteps({ steps, live }: { steps: StepState[]; live: boolean }) {
  if (steps.length === 0) return null;
  return (
    <ol className="mt-3 space-y-1 text-sm">
      {steps.map((s, i) => (
        <li key={`${s.label}-${i}`} className="flex flex-wrap items-center gap-2">
          <span aria-hidden className={s.status === "failed" ? "text-danger" : "text-fg-muted"}>{ICON[s.status]}</span>
          <span className="font-medium">{s.label}</span>
          <span className="text-xs text-fg-subtle">
            {s.note ?? (!live && s.status === "signing" ? "simulated signature" : !live && s.status === "pending" ? "simulated block" : TEXT[s.status])}
          </span>
          {s.hash ? <TxLink hash={s.hash} live={live} /> : null}
          {s.error ? <span className="text-xs text-danger">{s.error}</span> : null}
        </li>
      ))}
    </ol>
  );
}
