"use client";

import { useCallback, useState } from "react";
import type { RawLog } from "@/lib/encode";
import { errorText, type FlowStep, type StepState } from "@/lib/tx";

/** Runs transaction steps in order on Sepolia and exposes their states for <TxSteps>. */
export function useTxFlow() {
  const [steps, setSteps] = useState<StepState[]>([]);
  const [running, setRunning] = useState(false);

  /** ok = every step went through; logs = the receipt logs of the steps that return some (swaps, liquidity). */
  const start = useCallback(async (defs: FlowStep[]): Promise<{ ok: boolean; logs: RawLog[] }> => {
    const patch = (i: number, p: Partial<StepState>) => setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
    setRunning(true);
    setSteps(defs.map((d) => ({ label: d.label, status: "waiting" })));
    const logs: RawLog[] = [];
    for (let i = 0; i < defs.length; i++) {
      patch(i, { status: "signing" });
      try {
        const out = await defs[i].run(
          (hash) => patch(i, { status: "pending", hash }),
          (note) => patch(i, { note }),
        );
        if (out) logs.push(...out);
        patch(i, { status: "done" });
      } catch (e) {
        patch(i, { status: "failed", error: errorText(e) });
        setRunning(false);
        return { ok: false, logs };
      }
    }
    setRunning(false);
    return { ok: true, logs };
  }, []);

  const reset = useCallback(() => setSteps([]), []);
  return { steps, running, start, reset };
}
