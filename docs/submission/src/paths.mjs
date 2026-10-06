// Every file the submission tooling reads or writes, resolved from the repo root.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SUBMISSION_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(SUBMISSION_DIR, "..", "..");

export const P = {
  deployments: path.join(REPO_ROOT, "shared/deployments/sepolia.json"),
  params: path.join(REPO_ROOT, "shared/params.json"),
  backtest: path.join(REPO_ROOT, "lab/out/backtest-summary.json"),
  replay: path.join(REPO_ROOT, "lab/out/replay-2026-02-04.json"),
  validation: path.join(REPO_ROOT, "lab/out/validation.json"),
  links: path.join(SUBMISSION_DIR, "links.json"),
  team: path.join(SUBMISSION_DIR, "team.json"),
  evidence: path.join(REPO_ROOT, "docs/evidence/cre-reports-sepolia.json"),
  evidenceDir: path.join(REPO_ROOT, "docs/evidence"),
  readme: path.join(REPO_ROOT, "README.md"),
  outDir: path.join(SUBMISSION_DIR, "out"),
  videoDir: path.join(SUBMISSION_DIR, "out/video"),
};
