import rawParams from "@/generated/params.json";
import rawDeployments from "@/generated/sepolia.json";
import { type Pair, parseDeployments, parseParams } from "./deployments";

// src/generated/* is written by `npm run sync` from shared/ (or from src/fixtures/ until shared/ exists).
export const deployments = parseDeployments(rawDeployments);
export const params = parseParams(rawParams);

export const EXPLORER = "https://sepolia.etherscan.io";

export type DataSource = "mock" | "sepolia";

/** Mock until the pair is deployed; NEXT_PUBLIC_CLIM_SOURCE=mock forces mock data. */
export function dataSource(pair: Pair, forced: string | undefined = process.env.NEXT_PUBLIC_CLIM_SOURCE): DataSource {
  if (forced === "mock") return "mock";
  return deployments.pairs[pair] ? "sepolia" : "mock";
}
