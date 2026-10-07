import type { StepState, StepStatus } from "@/lib/tx";
import { StatusMark, type StatusMarkStatus } from "./StatusMark";
import { TxLink } from "./ui";

/** Wallet prompt and block wait both read as "running": the text beside the mark tells them apart. */
const MARK: Record<StepStatus, StatusMarkStatus> = { waiting: "pending", signing: "running", pending: "running", done: "done", failed: "failed" };
const TEXT: Record<StepStatus, string> = {
  waiting: "waiting",
  signing: "confirm in your wallet",
  pending: "waiting for Sepolia",
  done: "done",
  failed: "failed",
};

/**
 * The steps of a transaction flow, each with its status and hash (an Etherscan link). A status line,
 * mounted before the first step so screen readers announce its changes, says the latest step's state.
 */
export function TxSteps({ steps }: { steps: StepState[] }) {
  const say = (s: StepState) => s.note ?? TEXT[s.status];
  const now = [...steps].reverse().find((s) => s.status !== "waiting");
  return (
    <>
      <p role="status" className="sr-only">
        {now ? `${now.label}: ${say(now)}${now.error ? `. ${now.error}` : ""}` : ""}
      </p>
      {steps.length === 0 ? null : (
        <ol className="space-y-1 text-sm">
          {steps.map((s, i) => (
            <li key={`${s.label}-${i}`} className="flex flex-wrap items-center gap-2">
              {/* Decorative: the status text beside it already says it, so the mark's own role="img" label stays hidden. */}
              <span aria-hidden className="flex shrink-0">
                <StatusMark status={MARK[s.status]} />
              </span>
              <span className="font-medium">{s.label}</span>
              <span className="text-xs text-fg-subtle">{say(s)}</span>
              {s.hash ? <TxLink hash={s.hash} /> : null}
              {s.error ? <span className="text-xs text-danger">{s.error}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
