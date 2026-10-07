import band from "../../public/data/lab/ptrade-band.json";
import fables from "../../public/data/lab/fables-storm-2026-10-07.json";
import replay from "../../public/data/lab/replay-2026-02-04.json";
import summary from "../../public/data/lab/summary.json";
import { parseFablesStorm } from "./fables";
import { parsePTradeBand, parseReplay, parseSummary } from "./lab";

// public/data/lab/* is written by `npm run sync` from lab/out (real files only).
// The same files are served at /data/lab/*.json so anyone can download the numbers behind the charts.
// Server components only: importing this module in a client component would ship the replay to the browser.
export const labSummary = parseSummary(summary);
export const labReplay = parseReplay(replay);
export const labBand = parsePTradeBand(band);
export const fablesStorm = parseFablesStorm(fables);
