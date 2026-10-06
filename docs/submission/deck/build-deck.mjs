// Builds docs/submission/out/clim.pptx. Usage: node deck/build-deck.mjs [--out <file.pptx>] [--allow-missing-video]
import fs from "node:fs";
import path from "node:path";
import pptxgen from "pptxgenjs";
import { P, REPO_ROOT } from "../src/paths.mjs";
import { loadDeckData } from "./data.mjs";
import { defineLayouts } from "./style.mjs";
import { addSlides } from "./slides.mjs";

export async function buildDeck(files, outFile, { allowMissingVideo = false } = {}) {
  const data = loadDeckData(files);
  if (!allowMissingVideo && (!data.video.stage || !data.video.full)) {
    throw new Error("demo-stage.mp4 or demo-full.mp4 missing in out/video: run scripts/build-video.sh, or pass --allow-missing-video for a draft");
  }
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = "clim · storm insurance for Uniswap LPs";
  pres.author = data.team.map((m) => m.name).join(", ");
  pres.company = "clim";
  pres.theme = { headFontFace: "Calibri", bodyFontFace: "Calibri" };
  defineLayouts(pres);
  addSlides(pres, data);
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true }); // out/ is gitignored: absent on a clean clone
  await pres.writeFile({ fileName: outFile });
  return outFile;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf("--out");
  const out = i >= 0 ? path.resolve(process.argv[i + 1]) : path.join(P.outDir, "clim.pptx");
  const files = {
    params: P.params,
    backtest: P.backtest,
    replay: P.replay,
    validation: P.validation,
    links: P.links,
    team: P.team,
    videoStage: path.join(P.videoDir, "demo-stage.mp4"),
    videoFull: path.join(P.videoDir, "demo-full.mp4"),
    coverStage: path.join(P.videoDir, "cover-stage.png"),
    coverFull: path.join(P.videoDir, "cover-full.png"),
  };
  await buildDeck(files, out, { allowMissingVideo: process.argv.includes("--allow-missing-video") });
  console.log(`wrote ${path.relative(REPO_ROOT, out)}`);
}
