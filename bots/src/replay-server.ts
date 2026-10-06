// Replay server: serves lab/out/replay-window.json at 1x real time.
//   GET /venue/<name>/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=20   plan 02 replay mode (wall-clock times)
//   GET /api/v3/ticker/price?symbol=ETHUSDT   the replay price, read by the replay arbitrageur
//   GET /api/v3/klines?symbol=ETHUSDT&interval=1m&limit=N[&startTime=ms][&endTime=ms]   Binance 1m klines (historical times)
//   GET /snapshot, GET /status       diagnostics
// Env: REPLAY_FILE (default ../lab/out/replay-window.json), REPLAY_PORT (8787),
//      REPLAY_ANCHOR_SEC (wall-clock minute at which the main window starts; default: the current minute).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { envNum, envStr } from "./lib/env";
import { handleReplayRequest, makeClock, parseReplayWindow } from "./replay/klines";

const file = envStr("REPLAY_FILE", join(import.meta.dir, "..", "..", "lab", "out", "replay-window.json"));
const port = envNum("REPLAY_PORT", 8787);
const anchor = envNum("REPLAY_ANCHOR_SEC", Math.floor(Date.now() / 60_000) * 60);
const w = parseReplayWindow(JSON.parse(readFileSync(file, "utf8")));
const clock = makeClock(w, anchor);

Bun.serve({
  port,
  hostname: "127.0.0.1",
  fetch(req) {
    const r = handleReplayRequest(w, clock, new URL(req.url), Date.now());
    return Response.json(r.body, { status: r.status, headers: { "access-control-allow-origin": "*" } });
  },
});

const mainIso = new Date(clock.mainStartHist * 1000).toISOString();
console.log(`[replay] ${w.source}: ${w.closes.length} s from ${new Date(w.startTs * 1000).toISOString()}, main start ${mainIso}`);
console.log(`[replay] anchor ${new Date(anchor * 1000).toISOString()} (REPLAY_ANCHOR_SEC=${anchor}), offset ${clock.offsetSec} s`);
console.log(`[replay] listening on http://127.0.0.1:${port} (GET /venue/<name>/api/v3/klines, /api/v3/ticker/price, /api/v3/klines, /snapshot, /status)`);
