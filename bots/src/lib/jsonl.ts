// Append-only JSON-lines logs under bots/out/ (bigints serialised as decimal strings).
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { BaseError, ContractFunctionRevertedError } from "viem";

export const OUT_DIR = join(import.meta.dir, "..", "..", "out");

export function toJsonLine(record: Record<string, unknown>): string {
  return `${JSON.stringify(record, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v))}\n`;
}

export function appendJsonl(file: string, record: Record<string, unknown>): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, toJsonLine(record));
}

/** Compact error text for logs: the decoded revert name when there is one, else the first line of the message. */
export function shortError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      return `reverted: ${revert.data?.errorName ?? revert.reason ?? revert.signature ?? revert.raw ?? "unknown"}`;
    }
    return e.shortMessage;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return msg.split("\n")[0] ?? msg;
}
