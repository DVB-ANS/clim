// Builds docs/submission/out/clim.pptx from the Figma deck v2: one full-bleed PNG per slide (deck/v2/png/),
// the slide text and speaker notes (deck/v2/slides.json, live numbers from deck/v2/live.json) and the two
// demo videos dropped by the maintainer in out/video/ (demo-stage.mp4 on slide 08, demo-full.mp4 on the last slide).
//
// Usage (from docs/submission): npm run deck                 the final deck, videos required
//                               npm run deck -- --allow-missing-video   a draft without videos
//                               node deck/build-deck.mjs --videos <dir> --out <file.pptx>
//
// Videos are copied as they are when they fit the size budget, otherwise re-encoded (H.264 + AAC, faststart)
// so that the whole .pptx stays under MAX_DECK_MB: Google Drive does not preview larger files.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import pptxgen from "pptxgenjs";
import { P, REPO_ROOT, SUBMISSION_DIR } from "../src/paths.mjs";

export const V2_DIR = path.join(SUBMISSION_DIR, "deck/v2");
export const MAX_DECK_MB = 95; // under Drive's 100 MB preview limit, with margin for the pptx container
const SLIDE_W = 13.333; // LAYOUT_WIDE, inches
const SLIDE_H = 7.5;
const PX = SLIDE_W / 1920; // the Figma frames are 1920 x 1080
const AUDIO_KBPS = 128;

export function loadManifest(dir = V2_DIR) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "slides.json"), "utf8"));
  const live = JSON.parse(fs.readFileSync(path.join(dir, "live.json"), "utf8"));
  if (!Number.isInteger(live.seq) || !live.readUtc) throw new Error("deck/v2/live.json needs an integer seq and a readUtc string");
  const fill = (s) => s.replaceAll("{{LIVE_SEQ}}", live.seq.toLocaleString("en-US")).replaceAll("{{LIVE_SEQ_READ}}", live.readUtc);
  const slides = manifest.slides.map((s) => ({ ...s, text: fill(s.text), notes: fill(s.notes), pngPath: path.join(dir, "png", s.png) }));
  const missing = slides.filter((s) => !fs.existsSync(s.pngPath)).map((s) => s.png);
  if (missing.length) throw new Error(`slide images missing in ${path.join(dir, "png")}: ${missing.join(", ")}`);
  const left = slides.flatMap((s) => [s.text, s.notes]).filter((t) => t.includes("{{"));
  if (left.length) throw new Error(`unfilled token in the deck text: ${left[0].slice(0, 80)}`);
  return slides;
}

function probe(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,pix_fmt", "-of", "json", file], { encoding: "utf8" });
  const j = JSON.parse(out);
  const video = j.streams.find((s) => s.codec_type === "video");
  return { duration: Number(j.format.duration), video, hasAudio: j.streams.some((s) => s.codec_type === "audio") };
}

const mb = (file) => fs.statSync(file).size / 1e6;

// Re-encodes `src` to fit `budgetMb` (or copies it when it already fits and plays everywhere). Returns the file to embed.
export function fitVideo(src, budgetMb, outFile) {
  const info = probe(src);
  if (!info.video) throw new Error(`${src} has no video stream`);
  const playable = info.video.codec_name === "h264" && info.video.pix_fmt === "yuv420p";
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  if (playable && mb(src) <= budgetMb) {
    execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", "-i", src, "-c", "copy", "-movflags", "+faststart", outFile]);
    return outFile;
  }
  const audioKbps = info.hasAudio ? AUDIO_KBPS : 0;
  const videoKbps = Math.max(300, Math.floor((budgetMb * 8000 * 0.97) / info.duration - audioKbps));
  const args = ["-nostdin", "-y", "-v", "error", "-i", src,
    "-vf", "scale='min(1920,iw)':-2", "-c:v", "libx264", "-preset", "medium", "-b:v", `${videoKbps}k`,
    "-maxrate", `${Math.round(videoKbps * 1.5)}k`, "-bufsize", `${videoKbps * 2}k`, "-pix_fmt", "yuv420p", "-r", "30"];
  if (info.hasAudio) args.push("-c:a", "aac", "-b:a", `${AUDIO_KBPS}k`); else args.push("-an");
  args.push("-movflags", "+faststart", outFile);
  execFileSync("ffmpeg", args);
  return outFile;
}

export function posterFrame(video, outPng) {
  const at = Math.min(1, probe(video).duration / 2).toFixed(2);
  execFileSync("ffmpeg", ["-nostdin", "-y", "-v", "error", "-ss", at, "-i", video, "-frames:v", "1", outPng]);
  return `image/png;base64,${fs.readFileSync(outPng).toString("base64")}`;
}

// videos: { stage, full } source paths (or null); work: folder for the encoded copies and posters
export async function buildDeck({ videos = {}, outFile, allowMissingVideo = false, dir = V2_DIR, work = path.join(P.videoDir, "deck") } = {}) {
  const slides = loadManifest(dir);
  const have = { stage: videos.stage && fs.existsSync(videos.stage) ? videos.stage : null, full: videos.full && fs.existsSync(videos.full) ? videos.full : null };
  if (!allowMissingVideo && (!have.stage || !have.full)) {
    throw new Error(`demo-stage.mp4 or demo-full.mp4 missing in ${path.relative(REPO_ROOT, P.videoDir)}/: drop both there, or pass --allow-missing-video for a draft`);
  }
  const imagesMb = slides.reduce((a, s) => a + mb(s.pngPath), 0);
  const budget = MAX_DECK_MB - imagesMb - 1;
  const embed = {};
  if (have.stage || have.full) {
    const durs = { stage: have.stage ? probe(have.stage).duration : 0, full: have.full ? probe(have.full).duration : 0 };
    const total = durs.stage + durs.full;
    for (const kind of ["stage", "full"]) {
      if (!have[kind]) continue;
      const share = budget * (durs[kind] / total);
      const file = fitVideo(have[kind], share, path.join(work, `demo-${kind}.mp4`));
      embed[kind] = { file, cover: posterFrame(file, path.join(work, `poster-${kind}.png`)) };
    }
  }

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = "clim°: storm insurance for Uniswap v4 LPs";
  pres.author = "Sofiane Ben Taleb";
  pres.company = "DeVinci Blockchain";
  pres.subject = "TOKEN2049 Origins 2026: main track and Chainlink \"Best workflow with CRE\"";
  for (const s of slides) {
    const slide = pres.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addImage({ path: s.pngPath, x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, altText: `${s.title}. ${s.text}` });
    if (s.video && embed[s.video.kind]) {
      const v = s.video;
      slide.addMedia({ type: "video", path: embed[v.kind].file, cover: embed[v.kind].cover, x: v.x * PX, y: v.y * PX, w: v.w * PX, h: v.h * PX, objectName: `demo-${v.kind}` });
    }
    slide.addNotes(`Slide text: ${s.text}\n\n${s.notes}`);
  }
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  await pres.writeFile({ fileName: outFile });
  const size = mb(outFile);
  if (size > 100) throw new Error(`${outFile} is ${size.toFixed(1)} MB: Google Drive does not preview files over 100 MB`);
  return { outFile, slides: slides.length, videos: Object.keys(embed), sizeMb: size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? path.resolve(process.argv[i + 1]) : null; };
  const vdir = arg("--videos") ?? P.videoDir;
  const out = arg("--out") ?? path.join(P.outDir, "clim.pptx");
  const r = await buildDeck({
    videos: { stage: path.join(vdir, "demo-stage.mp4"), full: path.join(vdir, "demo-full.mp4") },
    outFile: out,
    allowMissingVideo: process.argv.includes("--allow-missing-video"),
  });
  console.log(`wrote ${path.relative(REPO_ROOT, r.outFile)}: ${r.slides} slides, videos: ${r.videos.join(", ") || "none (draft)"}, ${r.sizeMb.toFixed(1)} MB`);
}
