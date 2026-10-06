// Copies the ABI arrays of the clim contracts from contracts/out (forge build) to shared/abis/<Name>.json.
// Run from the repo root: `bun run --cwd shared export-abis` (after `forge build` in contracts/).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CONTRACTS = ["RiskDesk", "ClimHook", "TestToken"] as const;
const FORGE_OUT = join(import.meta.dir, "..", "..", "contracts", "out");
const ABI_DIR = join(import.meta.dir, "..", "abis");

mkdirSync(ABI_DIR, { recursive: true });
for (const name of CONTRACTS) {
  const artifact = join(FORGE_OUT, `${name}.sol`, `${name}.json`);
  if (!existsSync(artifact)) {
    throw new Error(`missing ${artifact}: run "forge build" in contracts/ first`);
  }
  const { abi } = JSON.parse(readFileSync(artifact, "utf8")) as { abi: unknown[] };
  writeFileSync(join(ABI_DIR, `${name}.json`), `${JSON.stringify(abi, null, 2)}\n`);
  console.log(`exported shared/abis/${name}.json (${abi.length} items)`);
}
