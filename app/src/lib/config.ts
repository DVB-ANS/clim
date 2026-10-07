import rawParams from "@/generated/params.json";
import rawDeployments from "@/generated/sepolia.json";
import { parseDeployments, parseParams } from "./deployments";

// src/generated/* is written by `npm run sync` from shared/ only: the app reads Ethereum Sepolia, never mock data.
export const deployments = parseDeployments(rawDeployments);
export const params = parseParams(rawParams);

if (!deployments.pairs.live) throw new Error("src/generated/sepolia.json has no live pair: run npm run sync");
/** The live pair (pool V and its static twin S), guaranteed by the check above. */
export const livePair = deployments.pairs.live;

export const EXPLORER = "https://sepolia.etherscan.io";
