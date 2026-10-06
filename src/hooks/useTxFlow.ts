"use client";

import { useCallback, useState } from "react";
import type { RawLog } from "@/lib/encode";
import { errorText, type FlowStep, type StepState } from "@/lib/tx";

/** Runs transaction steps in order (real or simulated) and exposes their states for <TxSteps>. */
export function useTxFlow() {
  const [steps, setSteps] = useState<StepState[]>([]);
  const [running, setRunning] = useState(false);

  const start = useCallback(async (defs: FlowStep[]): Promise<RawLog[] | undefined> => {
    const patch = (i: number, p: Partial<StepState>) => setSteps((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
    setRunning(true);
    setSteps(defs.map((d) => ({ label: d.label, status: "waiting" })));
    let last: RawLog[] | undefined;
    for (let i = 0; i < defs.length; i++) {
      patch(i, { status: "signing" });
      try {
        const out = await defs[i].run(
          (hash) => patch(i, { status: "pending", hash }),
          (note) => patch(i, { note }),
        );
        if (out) last = out;
        patch(i, { status: "done" });
      } catch (e) {
        patch(i, { status: "failed", error: errorText(e) });
        setRunning(false);
        return undefined;
      }
    }
    setRunning(false);
    return last;
  }, []);

  const reset = useCallback(() => setSteps([]), []);
  return { steps, running, start, reset };
}
