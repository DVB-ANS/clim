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

test("the manifest has 12 slides, every image, the live numbers filled in and one video slot, the stage cut on slide 10", () => {
  const slides = loadManifest();
  assert.equal(slides.length, 12);
  for (const s of slides) {
    assert.ok(s.title && s.text && s.notes, s.png);
    assert.ok(!/\{\{/.test(s.text + s.notes), s.png);
    assert.match(s.notes, /\n\nSources \(not read aloud\): /, s.png);
  }
  assert.deepEqual(slides.filter((s) => s.video).map((s) => [s.png, s.video.kind]), [["08-demo.png", "stage"]]);
  // deck v3: opening slides, the keeper and volume slides, results merged with the prediction, live merged with CRE (slide 11)
  assert.match(slides[10].text, /Live since 6 Oct: [\d,]+ CRE reports on Sepolia \(RiskDesk seq, read /);
});

test("deck builds with 12 slides, notes carrying the slide text and the sources, and the stage video with sound", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "clim-deck-"));
  const out = path.join(dir, "clim.pptx");
  const r = await buildDeck({ videos: { stage: tinyVideo(dir, "demo-stage.mp4", { seconds: 2 }) }, outFile: out, work: path.join(dir, "work") });
  assert.equal(r.slides, 12);
  assert.deepEqual(r.videos, ["stage"]);
  const entries = zipList(out);
  assert.equal(entries.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e)).length, 12);
  assert.equal(entries.filter((e) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(e)).length, 12);
  assert.equal(entries.filter((e) => /^ppt\/media\/.*\.mp4$/.test(e)).length, 1);
  const slide10Rels = execFileSync("unzip", ["-p", out, "ppt/slides/_rels/slide10.xml.rels"], { encoding: "utf8" });
  assert.match(slide10Rels, /\.mp4"/);
  for (let i = 1; i <= 12; i++) {
    const notes = execFileSync("unzip", ["-p", out, `ppt/notesSlides/notesSlide${i}.xml`], { encoding: "utf8" });
    assert.match(notes, /Slide text: /, `notes of slide ${i}`);
    assert.match(notes, /Sources \(not read aloud\):/, `notes of slide ${i}`);
  }
  const notes11 = execFileSync("unzip", ["-p", out, "ppt/notesSlides/notesSlide11.xml"], { encoding: "utf8" });
  assert.match(notes11, /Slide text: Chainlink CRE · our only partner track, by choice\. Why CRE, and our feedback\. Live since 6 Oct: [\d,]+ CRE reports/);
  assert.ok(streams(path.join(dir, "work", "demo-stage.mp4")).includes("audio"));
});

test("deck refuses to build without the stage video unless allowed", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "clim-deck-"));
  await assert.rejects(buildDeck({ videos: {}, outFile: path.join(dir, "a.pptx") }), /demo-stage\.mp4 missing/);
  await assert.rejects(buildDeck({ videos: { stage: path.join(dir, "absent.mp4") }, outFile: path.join(dir, "a.pptx") }), /demo-stage\.mp4 missing/);
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
