import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDeck, fitVideo, loadManifest } from "../deck/build-deck.mjs";

function tinyVideo(dir, name, { seconds = 1, audio = true } = {}) {
  const out = path.join(dir, name);
  const args = ["-nostdin", "-y", "-v", "error", "-f", "lavfi", "-i", `testsrc2=size=640x360:rate=30:duration=${seconds}`];
  if (audio) args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-c:a", "aac");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-shortest", out);
  execFileSync("ffmpeg", args);
  return out;
}

function zipList(file) {
  return execFileSync("unzip", ["-Z1", file], { encoding: "utf8" }).trim().split("\n");
}

function streams(file) {
  return execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file], { encoding: "utf8" }).trim().split("\n");
}

test("the v2 manifest has 20 slides, every image, the live numbers filled in and two video slots", () => {
  const slides = loadManifest();
  assert.equal(slides.length, 20);
  for (const s of slides) {
    assert.ok(s.title && s.text && s.notes, s.png);
    assert.ok(!/\{\{/.test(s.text + s.notes), s.png);
  }
  assert.deepEqual(slides.filter((s) => s.video).map((s) => [s.png, s.video.kind]), [["10-demo.png", "stage"], ["20-a6-full-demo.png", "full"]]);
  assert.match(slides[8].text, /[\d,]+ CRE reports on the live desk, about one every 30 s \(RiskDesk seq, read /);
});

test("deck builds with 20 slides, notes carrying the slide text, and both videos with sound", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "clim-deck-"));
  const out = path.join(dir, "clim.pptx");
  const r = await buildDeck({ videos: { stage: tinyVideo(dir, "demo-stage.mp4"), full: tinyVideo(dir, "demo-full.mp4", { seconds: 2 }) }, outFile: out, work: path.join(dir, "work") });
  assert.equal(r.slides, 20);
  assert.deepEqual(r.videos, ["stage", "full"]);
  const entries = zipList(out);
  assert.equal(entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e)).length, 20);
  assert.equal(entries.filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e)).length, 20);
  assert.equal(entries.filter((e) => /^ppt\/media\/.*\.mp4$/.test(e)).length, 2);
  const notes9 = execFileSync("unzip", ["-p", out, "ppt/notesSlides/notesSlide9.xml"], { encoding: "utf8" });
  assert.match(notes9, /Slide text: Live on Sepolia since 6 October\./);
  assert.match(notes9, /Sources \(not read aloud\):/);
  assert.ok(streams(path.join(dir, "work", "demo-full.mp4")).includes("audio"));
});

test("deck refuses to build without videos unless allowed", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "clim-deck-"));
  await assert.rejects(buildDeck({ videos: {}, outFile: path.join(dir, "a.pptx") }), /demo-stage\.mp4 or demo-full\.mp4 missing/);
  const r = await buildDeck({ videos: {}, outFile: path.join(dir, "out", "b.pptx"), allowMissingVideo: true }); // a missing output folder is created
  assert.deepEqual(r.videos, []);
});

test("a video over its budget is re-encoded under it, with its sound", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "clim-deck-"));
  const src = tinyVideo(dir, "big.mp4", { seconds: 4 });
  const out = fitVideo(src, 0.2, path.join(dir, "fit.mp4"));
  assert.ok(statSync(out).size < 0.2e6 * 1.15, `${statSync(out).size} bytes`);
  assert.ok(streams(out).includes("audio"));
});
