// Fails if any tracked file contains a secret value from a local .env file. Usage: node src/scan-secrets.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./paths.mjs";
import { loadSecrets, findSecrets } from "./evidence.mjs";

const secrets = loadSecrets(REPO_ROOT);
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
console.log(leaks ? `${leaks} tracked file(s) contain .env secrets` : `no .env secret in ${files.length} tracked files (${secrets.length} secret values checked)`);
process.exit(leaks ? 1 : 0);
