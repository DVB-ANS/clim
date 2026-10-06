// Environment and CLI parsing. Bun loads bots/.env automatically when commands run from bots/.
import type { PairName } from "@clim/shared";
import type { Hex } from "viem";

type Env = Record<string, string | undefined>;

export const DEFAULT_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

export function argValue(flag: string, argv: readonly string[] = process.argv): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function hasFlag(flag: string, argv: readonly string[] = process.argv): boolean {
  return argv.includes(flag);
}

export function pairArg(argv: readonly string[] = process.argv): PairName {
  const v = argValue("--pair", argv) ?? "live";
  if (v !== "live" && v !== "replay") throw new Error(`--pair must be live or replay, got ${v}`);
  return v;
}

export function envNum(name: string, fallback: number, env: Env = process.env): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got ${raw}`);
  return n;
}

export function envStr(name: string, fallback: string, env: Env = process.env): string {
  const raw = env[name];
  return raw === undefined || raw === "" ? fallback : raw;
}

export function rpcUrl(env: Env = process.env): string {
  return envStr("SEPOLIA_RPC_URL", DEFAULT_RPC_URL, env);
}

export function privateKeyFromEnv(name: string, env: Env = process.env): Hex {
  const v = env[name];
  if (!v) throw new Error(`${name} is not set (see bots/.env.example)`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`${name} must be 0x followed by 64 hex characters`);
  return v as Hex;
}

/** One key per (role, pair) so that concurrent bots never share a nonce. */
export function botKey(role: "ARB" | "NOISE", pair: PairName, env: Env = process.env): Hex {
  return privateKeyFromEnv(`${role}_${pair.toUpperCase()}_PRIVATE_KEY`, env);
}
