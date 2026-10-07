// Fails if any tracked file, or any commit's patch on any ref, contains a secret value from a local .env file. Prints counts,
// never a value. Usage: node src/scan-secrets.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./paths.mjs";
import { loadSecrets, findSecrets } from "./evidence.mjs";

const secrets = loadSecrets(REPO_ROOT);

// main is public and pushed as work goes on: a value one commit added and a later one removed is still published, so scan
// every commit's patch on every ref too (merges against their first parent, so a value a merge brings in is seen; no
// textconv or external diff, so git prints every byte).
const history = execFileSync(
  "git",
  ["log", "--all", "-p", "--text", "--no-color", "--no-ext-diff", "--no-textconv", "--diff-merges=first-parent"],
  { cwd: REPO_ROOT, maxBuffer: 1e9 },
).toString("utf8");
const commits = execFileSync("git", ["rev-list", "--all", "--count"], { cwd: REPO_ROOT }).toString().trim();
const inHistory = findSecrets(history, secrets).length;
console.log(
  inHistory
    ? `LEAK in git history: ${inHistory} value(s) from a .env file (find the commit with git log --all -S <value>)`
    : `no .env secret in the patches of ${commits} commits (all refs)`,
);

const files = execFileSync("git", ["ls-files", "-z"], { cwd: REPO_ROOT }).toString().split("\0").filter(Boolean);
let leaks = 0;
for (const f of files) {
  const full = path.join(REPO_ROOT, f);
  if (!statSync(full, { throwIfNoEntry: false })?.isFile()) continue; // submodule (contracts/lib/*) or deleted in the working tree
  const buf = readFileSync(full);
  if (buf.includes(0)) continue; // binary
  const found = findSecrets(buf.toString("utf8"), secrets);
  if (found.length) {
    leaks++;
    console.log(`LEAK ${f}: ${found.length} value(s) from a .env file`);
  }
}
// The tracked-files line stays last (master plan Task 20 Step 3 reads it with tail -1); it also flags a history leak.
const tracked = leaks ? `${leaks} tracked file(s) contain .env secrets` : `no .env secret in ${files.length} tracked files (${secrets.length} secret values checked)`;
console.log(inHistory ? `${tracked}; LEAK in git history (first line)` : tracked);
process.exit(leaks || inHistory ? 1 : 0);
