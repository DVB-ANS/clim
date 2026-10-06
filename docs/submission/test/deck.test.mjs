import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeck } from "../deck/build-deck.mjs";
import { downsample, feeSchedule } from "../deck/data.mjs";

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fx = (n) => path.join(FX, n);

function tinyVideo(dir, name) {
  const out = path.join(dir, name);
  execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=30:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
  return out;
}

function zipList(file) {
  return execFileSync("unzip", ["-Z1", file], { encoding: "utf8" }).trim().split("\n");
}

test("downsample keeps both ends and the requested size", () => {
  assert.deepEqual(downsample([1, 2, 3, 4, 5, 6, 7, 8, 9], 3), [1, 5, 9]);
  assert.deepEqual(downsample([1, 2], 5), [1, 2]);
});

test("fee schedule at P* = 30%", () => {
  const sched = feeSchedule({ etaE4: 25093, sqrtHalfDtE6: 2449490, feeMinPips: 500, feeMaxPips: 15000 });
  assert.deepEqual(sched.map((x) => x.feeBp), [5, 5.48, 8.21, 10.95, 16.42, 24.63]);
});

test("deck builds with 22 slides, notes, native charts and two embedded videos", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "clim-deck-"));
  const files = {
    params: fx("params.json"),
    backtest: fx("backtest-summary.json"),
    replay: fx("replay.json"),
    validation: fx("validation.json"),
    links: fx("links.json"),
    team: fx("team.json"),
    videoStage: tinyVideo(dir, "demo-stage.mp4"),
    videoFull: tinyVideo(dir, "demo-full.mp4"),
  };
  const out = await buildDeck(files, path.join(dir, "clim.pptx"));
  const entries = zipList(out);
  assert.equal(entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e)).length, 22);
  assert.equal(entries.filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e)).length, 22);
  assert.ok(entries.filter((e) => /^ppt\/charts\/chart\d+\.xml$/.test(e)).length >= 4);
  assert.equal(entries.filter((e) => /^ppt\/media\/.*\.mp4$/.test(e)).length, 2);
});

test("deck refuses to build without videos unless allowed", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "clim-deck-"));
  const files = { params: fx("params.json"), backtest: fx("backtest-summary.json"), replay: fx("replay.json"), validation: fx("validation.json"), links: fx("links.json"), team: fx("team.json") };
  await assert.rejects(buildDeck(files, path.join(dir, "a.pptx")), /demo-stage\.mp4 or demo-full\.mp4 missing/);
  await buildDeck(files, path.join(dir, "out", "b.pptx"), { allowMissingVideo: true }); // a missing output folder is created
});
