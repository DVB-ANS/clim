"""Ranks 4-hour ETH volatility windows and says for which ones Fables' ETH/USDG keeper was live.

    uv run python scripts/fables_windows.py fetch [--data-dir DIR]   # network: Binance ETHUSDT 1m klines, SCAN_FROM to SCAN_END
    uv run python scripts/fables_windows.py run   [--data-dir DIR]   # offline: lab/out/fables-windows.json

run also reads feepoked.json, poolconfigured.json and initialize.json, written by `fables_compare.py fetch`
(FeePoked logs up to the block at SCAN_END). The scan is Binance-only RV15, the same estimator as the desk.
Windows are 240 minutes long; a window [start, end) averages the RV15 values known at the minute ends in
(start, end]; the top windows are picked greedily by mean and may not overlap.
"""

import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np

import fables_compare as fc
from clim_lab import fables as fb
from clim_lab.constants import LATENCY_SEC, SECONDS_PER_YEAR
from clim_lab.data import MinuteSeries, OUT_DIR, load_params
from clim_lab.desk import desk_reports_minutes, fee_pips_array, schedule_on_path
from clim_lab.fee import HookParams
from clim_lab.report import now_iso, write_json

SCAN_FROM = 1_782_864_000  # 2026-07-01 00:00 UTC
SCAN_END = fc.SCAN_END  # 2026-10-07 08:38 UTC (exclusive end of the last candle)
WINDOW_MIN = 240
TOP_N = 20
SHAPE_SKIP_SEC = 3_600  # keeper shape: start one hour after the current config, past the switch
RV_BINS = [0, 40, 60, 80, 100, 150, 10_000]
LAGS_MIN = [-5, -2, -1, 0, 1, 2, 5]
SCAN_FILE = "binance_1m_scan.json"
OUT_FILE = OUT_DIR / "fables-windows.json"


def cmd_fetch(data_dir: Path) -> int:
    data_dir.mkdir(parents=True, exist_ok=True)
    net = fc.Net(data_dir)
    rows: dict[int, float] = {}
    t = SCAN_FROM
    while t < SCAN_END:
        end = min(t + 1000 * 60, SCAN_END)
        url = (
            "https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1m"
            f"&startTime={t * 1000}&endTime={end * 1000 - 1}&limit=1000"
        )
        data = net.get_json(url)
        net._record(url, f"binance 1m scan rows={len(data)}")
        for k in data:
            rows[int(k[0]) // 1000] = float(k[4])
        t = end
        time.sleep(0.12)
    (data_dir / SCAN_FILE).write_text(json.dumps(sorted([k, v] for k, v in rows.items())))
    fc._merge_requests(data_dir, net.log)
    print(f"Binance 1m rows: {len(rows)} ({fc.utc(min(rows))} to {fc.utc(max(rows))}, last candle open)")
    return 0


def rv15_scan(rows: list) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, int]:
    """Forward-filled 1m closes -> (open_t, log close, rv_t = open time of the last minute, rv %/yr, gaps filled)."""
    t = np.array([r[0] for r in rows], dtype=np.int64)
    c = np.array([r[1] for r in rows], dtype=np.float64)
    grid = np.arange(t[0], t[-1] + 60, 60, dtype=np.int64)
    idx = np.searchsorted(t, grid, side="right") - 1
    gaps = int(len(grid) - len(t))
    logc = np.log(c[idx])
    lr = np.diff(logc)
    cs = np.concatenate([[0.0], np.cumsum(lr * lr)])
    j = np.arange(15, len(grid))
    rv = np.sqrt((cs[j] - cs[j - 15]) / 900.0) * math.sqrt(SECONDS_PER_YEAR) * 100.0
    return grid, logc, grid[j], rv, gaps


def top_windows(rv_t: np.ndarray, rv: np.ndarray, n: int, w: int = WINDOW_MIN) -> list[tuple[int, int, float, float, int]]:
    k = np.concatenate([[0.0], np.cumsum(rv)])
    means = (k[w:] - k[:-w]) / w
    used: list[int] = []
    out = []
    for s in np.argsort(-means, kind="stable").tolist():
        if any(abs(s - u) < w for u in used):
            continue
        used.append(s)
        seg = rv[s : s + w]
        pk = int(np.argmax(seg))
        out.append((int(rv_t[s]), int(rv_t[s + w - 1]) + 60, float(means[s]), float(seg[pk]), int(rv_t[s + pk]) + 60))
        if len(out) == n:
            break
    return out


def label(a: int, b: int) -> str:
    sa, sb = fc.utc(a), fc.utc(b)
    tail = sb[11:16] if sa[:10] == sb[:10] or sb[11:16] == "00:00" else sb[:10] + " " + sb[11:16]
    return f"{sa[:10]} {sa[11:16]}-{tail} UTC"


def cmd_run(data_dir: Path) -> int:
    rows = json.loads((data_dir / SCAN_FILE).read_text())
    grid, logc, rv_t, rv, gaps = rv15_scan(rows)
    known = rv_t + 60  # time at which each RV15 is known (minute end)

    def j(name):
        return json.loads((data_dir / name).read_text())

    pokes = fb.sorted_events([fb.decode_feepoked(r) for r in j("feepoked.json")])
    cfgs = fb.sorted_events([fb.decode_poolconfigured(r) for r in j("poolconfigured.json")])
    init = j("initialize.json")[0]
    init_t = fb.hex_int(init["timeStamp"])
    first_poke = pokes[0]
    params = HookParams.from_json(load_params())

    # clim's rule at 12 s on the desk model fed by these 1-minute closes (envelope, 30 s reports, 12 s latency)
    minutes = MinuteSeries(grid + 60, logc)
    reports = desk_reports_minutes(minutes)

    def clim_fee_bp(tm: np.ndarray) -> np.ndarray:
        sched = schedule_on_path(tm, np.zeros(len(tm)), reports, LATENCY_SEC)
        if len(sched) != len(tm):
            raise ValueError("window starts before the first desk report")
        return fee_pips_array(sched.sigma_e9, params) / 100.0

    out_rows = []
    live_rank = 0
    for rank, (a, b, mean, peak, peak_at) in enumerate(top_windows(rv_t, rv, TOP_N), 1):
        if b <= init_t:
            state = "beforePool"
        elif a < init_t:
            state = "poolOpensInWindow"
        elif b <= first_poke.t:
            state = "poolLiveNoKeeper"
        elif a < first_poke.t:
            state = "keeperStartsInWindow"
        else:
            state = "keeperLive"
        r = {
            "rank": rank, "label": label(a, b), "startTs": a, "endTs": b, "startUtc": fc.utc(a), "endUtc": fc.utc(b),
            "meanRv15": mean, "peakRv15": peak, "peakAtUtc": fc.utc(peak_at), "state": state,
        }
        if state != "beforePool" and a >= cfgs[0].t:
            cfg = fc.cfg_at(cfgs, a)
            tm = np.arange(a, b, 60, dtype=np.int64)
            kf = fb.keeper_fee_at(tm, pokes, cfgs) / 100.0
            cf = clim_fee_bp(tm)
            r.update({
                "config": f"{cfg.floor_pips}/{cfg.flat_pips}/{cfg.cap_pips}",
                "keeperMeanFeeBp": float(kf.mean()),
                "keeperPctAtCap": 100.0 * float(np.mean(kf >= cfg.cap_pips / 100.0)),
                "climModelMeanFeeBp12s": float(cf.mean()),
                "keeperOverClim": float(kf.mean() / cf.mean()),
            })
        if state == "keeperLive":
            live_rank += 1
            r["keeperLiveRank"] = live_rank
        out_rows.append(r)

    # keeper shape under its current config: does its fee follow volatility?
    cur = cfgs[-1]
    a = (cur.t + SHAPE_SKIP_SEC) // 60 * 60
    b = min(SCAN_END, pokes[-1].t // 60 * 60 + 60)  # up to the last FeePoked before the scan end
    sel = (known >= a) & (known < b)
    tm, sig = known[sel], rv[sel]
    kf = fb.keeper_fee_at(tm, pokes, cfgs) / 100.0
    cf = clim_fee_bp(tm)
    below = kf < cur.cap_pips / 100.0
    bins = []
    for lo, hi in zip(RV_BINS[:-1], RV_BINS[1:]):
        s = (sig >= lo) & (sig < hi)
        if s.sum():
            bins.append({
                "rv15FromPctYr": lo, "rv15ToPctYr": hi if hi < 10_000 else None, "minutes": int(s.sum()),
                "keeperMedianBp": float(np.median(kf[s])), "keeperP10Bp": float(np.percentile(kf[s], 10)),
                "keeperP90Bp": float(np.percentile(kf[s], 90)), "climModelMedianBp12s": float(np.median(cf[s])),
            })
    lags = []
    for lag in LAGS_MIN:
        x, y = (kf[: len(kf) - lag], sig[lag:]) if lag >= 0 else (kf[-lag:], sig[:lag])
        lags.append({"rv15KnownMinutesLater": lag, "corr": float(np.corrcoef(x, y)[0, 1])})
    shape_pokes = [p for p in pokes if a <= p.t < b]
    ttl = sorted({p.expiry - p.t for p in shape_pokes})
    shape = {
        "fromUtc": fc.utc(a), "toUtc": fc.utc(b), "days": (b - a) / 86_400, "minutes": int(len(tm)),
        "config": f"{cur.floor_pips}/{cur.flat_pips}/{cur.cap_pips}",
        "corrFeeRv15": float(np.corrcoef(kf, sig)[0, 1]),
        "corrFeeRv15BelowCap": float(np.corrcoef(kf[below], sig[below])[0, 1]),
        "keeperMeanFeeBp": float(kf.mean()), "climModelMeanFeeBp12s": float(cf.mean()),
        "pctTimeAtFlat": 100.0 * float(np.mean(kf == cur.flat_pips / 100.0)),
        "pctTimeAtCap": 100.0 * float(np.mean(kf >= cur.cap_pips / 100.0)),
        "bins": bins,
        "leadLag": lags,
        "pokes": len(shape_pokes),
        "pctPokesOnMinuteBoundary": 100.0 * float(np.mean([p.t % 60 == 0 for p in shape_pokes])),
        "ttlSecValues": ttl[:10],
        "medianSecBetweenPokes": float(np.median(np.diff([p.t for p in shape_pokes]))),
        "lastFeePokedUtc": fc.utc(pokes[-1].t),
        "note": "from one hour after the current config to the last FeePoked before the scan end; "
        "keeper fee from its FeePoked logs on a 1-minute grid vs Binance RV15 known at the same minute end; "
        "leadLag: corr(keeper fee at t, RV15 known L minutes later), so a peak at L > 0 means the fee moves before RV15",
    }

    doc = {
        "schema": "clim.lab.fables-windows/1",
        "generatedAt": now_iso(),
        "scan": {
            "source": "Binance spot ETHUSDT 1-minute klines (close), GET https://api.binance.com/api/v3/klines",
            "fromUtc": fc.utc(int(grid[0])),
            "lastCandleOpenUtc": fc.utc(int(grid[-1])),
            "klines": len(rows),
            "gapsForwardFilled": gaps,
            "estimator": "RV15 = sqrt(sum of the 15 squared 1-minute log returns of the last 16 closes / 900 s), annualized over 365 days (%/yr); Binance only, not the desk's four-venue median",
            "windowConvention": "240-minute windows [start, end); mean of the RV15 values known at the minute ends in (start, end]; greedy non-overlapping top windows by mean; peakAtUtc is the minute end at which the peak RV15 is known",
            "climModel": "climModelMeanFeeBp12s: clim's shipped rule (12 s) on the desk model fed by these 1-minute closes (RiskDesk envelope, 30 s reports, 12 s latency)",
        },
        "fables": {
            "poolInitialized": {"block": fb.hex_int(init["blockNumber"]), "timeUtc": fc.utc(init_t), "tx": init["transactionHash"]},
            "firstFeePoked": {"block": first_poke.block, "timeUtc": fc.utc(first_poke.t), "tx": first_poke.tx},
            "configs": [{"block": c.block, "timeUtc": fc.utc(c.t), "floorPips": c.floor_pips, "flatPips": c.flat_pips, "capPips": c.cap_pips} for c in cfgs],
            "feePokedLogs": len(pokes),
        },
        "topWindows": out_rows,
        "keeperShape": shape,
    }
    write_json(OUT_FILE, doc)
    print(f"scan {doc['scan']['fromUtc']} .. {doc['scan']['lastCandleOpenUtc']} ({len(rows)} klines, {gaps} gaps filled)")
    for r in out_rows:
        extra = f" keeper {r['keeperMeanFeeBp']:5.1f} cap {r['keeperPctAtCap']:4.1f}% clim12 {r['climModelMeanFeeBp12s']:5.1f} [{r['config']}]" if "keeperMeanFeeBp" in r else ""
        print(f"{r['rank']:>2} {r['label']:<36} mean {r['meanRv15']:6.1f} peak {r['peakRv15']:6.1f} {r['state']:<20}{extra} {('#' + str(r['keeperLiveRank'])) if 'keeperLiveRank' in r else ''}")
    print(f"keeper shape {shape['fromUtc']}..{shape['toUtc']} ({shape['days']:.1f} d): corr {shape['corrFeeRv15']:.3f}, below cap {shape['corrFeeRv15BelowCap']:.3f}")
    for x in bins:
        print(f"  RV15 {x['rv15FromPctYr']}-{x['rv15ToPctYr']}: n {x['minutes']} keeper median {x['keeperMedianBp']:.1f} clim {x['climModelMedianBp12s']:.1f}")
    print(f"  lead/lag {[(x['rv15KnownMinutesLater'], round(x['corr'], 3)) for x in lags]}")
    print(f"wrote {OUT_FILE}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("cmd", choices=["fetch", "run"])
    ap.add_argument("--data-dir", type=Path, default=fc.DEFAULT_DATA)
    a = ap.parse_args()
    return cmd_fetch(a.data_dir) if a.cmd == "fetch" else cmd_run(a.data_dir)


if __name__ == "__main__":
    sys.exit(main())
