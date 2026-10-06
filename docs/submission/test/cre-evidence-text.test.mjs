import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceText, MAX_CHARS } from "../src/cre-evidence-text.mjs";

test("the CRE evidence text fits Builderbase's 1,500 characters with large counts and links every proof", () => {
  const text = evidenceText({
    liveDesk: "0xCDbfd6b9C0b97A8eE31706c6CDE5E54B4954334F",
    replayDesk: "0x4b843dc3A7ec6202d2337cdeF8C67a0F10f24746",
    liveSeq: 99999,
    replaySeq: 459,
    readUtc: "2026-10-07 15:59 UTC",
    repoUrl: "https://github.com/DVB-ANS/clim",
    videoUrl: "https://drive.google.com/file/d/0123456789abcdefghijklmnopqrstuvwxyzABCD/view?usp=sharing",
  });
  assert.ok(text.length <= MAX_CHARS, `${text.length} characters`);
  assert.match(text, /99999 reports applied \(state\(\)\.seq, read 2026-10-07 15:59 UTC\)/);
  assert.match(text, /simulate --broadcast/);
  assert.match(text, /\/tree\/main\/docs\/evidence\nDemo video: https:\/\/drive/);
  assert.equal((text.match(/https:\/\/sepolia\.etherscan\.io\//g) ?? []).length, 4);
});
