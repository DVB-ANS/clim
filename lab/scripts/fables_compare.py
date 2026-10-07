"""Fables' keeper fee vs clim's fee rule on the same ETH storms (2026-09-11 CPI, 2026-09-16 FOMC).

    uv run python scripts/fables_compare.py fetch [--data-dir DIR] [--refresh]   # network, read-only: raw logs and prices
    uv run python scripts/fables_windows.py fetch                                 # Binance 1m klines for the window scan
    uv run python scripts/fables_windows.py run                                   # lab/out/fables-windows.json
    uv run python scripts/fables_compare.py run   [--data-dir DIR]               # offline: lab/out/fables-compare.json

fetch reads Etherscan V2 (chainid 4663, Robinhood Chain) logs, the Robinhood Chain public RPC, Binance spot
klines and Coinbase candles. It never sends a transaction. The Etherscan key comes from the ETHERSCAN_API_KEY
environment variable or the ETHERSCAN_API_KEY line of contracts/.env; it is never printed, and every URL this
script records has its apikey parameter removed. Raw data stays in DIR (default lab/data/fables, gitignored);
files already there are kept unless --refresh. run reads lab/out/fables-windows.json for the window ranking.
"""

import argparse
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from clim_lab import fables as fb
from clim_lab.compare import static_fee_equal_time
from clim_lab.constants import LATENCY_SEC, REPORT_SEC
from clim_lab.data import DATA_DIR, LAB_DIR, OUT_DIR, load_1s_csv, load_params
from clim_lab.desk import block_schedule, desk_reports, fee_pips_array, log_bands, schedule_on_path
from clim_lab.fee import HookParams
from clim_lab.report import bp_per_year, now_iso, write_json
from clim_lab.sim import run_arb
from clim_lab.units import per_sqrt_s_to_annual, sqrt_half_dt_e6

# ---- facts ----
CHAIN_ID = 4663
EXPLORER = "https://robin.etherscan.io"
ETHERSCAN = "https://api.etherscan.io/v2/api"
RPC = "https://rpc.mainnet.chain.robinhood.com"
HOOK = "0x06a889870c8f83640d6816319f72e2aa579b6080"  # FablesRampETH (Sourcify full match, verified 2026-08-25)
HOOK_DEPLOY_BLOCK = 41250427  # Sourcify deployment record of the hook
POOL_ID = "0xbac3aa3b91584a53a579b3c999a56756e954e59247e497bad1d25a4334bde551"  # ETH/USDG
POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951"
FCFS_SOURCE = "https://docs.robinhood.com/chain/#predictable-transaction-ordering"

WINDOW_START = 1_789_129_800  # 2026-09-11 12:30:00 UTC (the US CPI release)
WINDOW_END = 1_789_144_200  # 2026-09-11 16:30:00 UTC
FOMC_START = 1_789_577_400  # 2026-09-16 16:50:00 UTC
FOMC_END = 1_789_591_800  # 2026-09-16 20:50:00 UTC
SCAN_END = 1_791_362_280  # 2026-10-07 08:38:00 UTC: end of the window scan; FeePoked logs are fetched up to here
WARMUP_SEC = 1_800
PRICE_START = WINDOW_START - WARMUP_SEC - 1_200  # 20 extra minutes so the first report has 16 closed minutes
PRICE_FILE = "b1s_2026-09-11.csv"
USD_PER_DEPTH_1M = 1_000_000 / 4  # depth D of a $1M full-range-equivalent pool (as in clim_lab.replay)
FLAT_PIPS = 700  # Fables' ETH/USDG flat fee since block 56022455
LAUNCH_BLOCK = 37_260_309  # earliest Fables pool Initialize found by the 2026-10-07 scout scan of PoolManager logs

EVENTS = {
    "cpi": {
        "ts": 1_789_129_800,
        "what": "US CPI for August 2026, released Friday 11 September 2026 at 08:30 ET (12:30:00 UTC)",
        "source": "https://www.bls.gov/schedule/news_release/cpi.htm",
    },
    "fomc": {
        "ts": 1_789_581_600,
        "what": "FOMC statement, released Wednesday 16 September 2026 at 2:00 p.m. EDT (18:00:00 UTC)",
        "source": "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm",
    },
}


@dataclass(frozen=True)
class Win:
    key: str
    start: int
    end: int
    price_file: str
    swaps_file: str
    block_key: str  # prefix of its start/end blocks in blocks.json
    event: str

    @property
    def price_start(self) -> int:
        return self.start - WARMUP_SEC - 1_200


WINDOWS = {
    "cpi": Win("cpi", WINDOW_START, WINDOW_END, PRICE_FILE, "swaps_window.json", "window", "cpi"),
    "fomc": Win("fomc", FOMC_START, FOMC_END, "b1s_2026-09-16.csv", "swaps_fomc.json", "fomc", "fomc"),
}

# The five highest non-overlapping 4 h mean RV15 windows since 2026-07-01 (lab/out/fables-windows.json; checked in run).
TOP_WINDOWS = [
    {"rank": 1, "label": "2026-08-19 20:07-00:07 UTC", "start": 1_787_170_020, "end": 1_787_184_420},
    {"rank": 2, "label": "2026-09-11 12:30-16:30 UTC", "start": WINDOW_START, "end": WINDOW_END},
    {"rank": 3, "label": "2026-08-22 05:07-09:07 UTC", "start": 1_787_375_220, "end": 1_787_389_620},
    {"rank": 4, "label": "2026-08-19 14:29-18:29 UTC", "start": 1_787_149_740, "end": 1_787_164_140},
    {"rank": 5, "label": "2026-08-21 20:24-2026-08-22 00:24 UTC", "start": 1_787_343_840, "end": 1_787_358_240},
]

DEFAULT_DATA = DATA_DIR / "fables"
OUT_FILE = OUT_DIR / "fables-compare.json"
WINDOWS_FILE = OUT_DIR / "fables-windows.json"


def utc(ts: int) -> str:
    return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def hms(ts: int) -> str:
    return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%H:%M:%S")


# ---- network (fetch only) ----

_APIKEY_RE = re.compile(r"([?&])apikey=[^&]*&?", re.IGNORECASE)


def redact(url: str) -> str:
    out = _APIKEY_RE.sub(lambda m: m.group(1), url)
    return out.rstrip("?&")


def read_key() -> str:
    key = os.environ.get("ETHERSCAN_API_KEY", "").strip()
    if key:
        return key
    env = LAB_DIR.parent / "contracts" / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("ETHERSCAN_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("ETHERSCAN_API_KEY not set (env or contracts/.env)")


class Net:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.log: list[dict] = []
        self._key: str | None = None

    def _record(self, url: str, note: str) -> None:
        row = {"at": now_iso(), "url": redact(url), "note": note}
        self.log.append(row)
        with open(self.data_dir / "requests.txt", "a") as f:
            f.write(f"{row['at']}\t{row['url']}\t{note}\n")

    def get_json(self, url: str, data: bytes | None = None, tries: int = 6):
        last = ""
        for k in range(tries):
            try:
                req = urllib.request.Request(url, data=data, headers={"User-Agent": "clim-lab/0.1", "Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=30) as r:
                    return json.loads(r.read())
            except urllib.error.HTTPError as e:
                last = f"HTTP {e.code}"
            except Exception as e:  # noqa: BLE001 - network errors, retried
                last = type(e).__name__
            time.sleep(1.5 * (k + 1))
        raise RuntimeError(f"request failed after {tries} tries ({last}): {redact(url)}")

    def etherscan(self, params: dict, note: str):
        if self._key is None:
            self._key = read_key()
        q = urllib.parse.urlencode({"chainid": CHAIN_ID, **params})
        url = f"{ETHERSCAN}?{q}&apikey={self._key}"
        for k in range(8):
            time.sleep(0.4)
            doc = self.get_json(url)
            res = doc.get("result")
            if doc.get("status") == "1" or (doc.get("message", "").startswith("No ") and res == []):
                self._record(url, f"{note}; rows={len(res) if isinstance(res, list) else 1}")
                return res
            if isinstance(res, str) and "rate limit" in res.lower():
                time.sleep(1.0 + k)
                continue
            if doc.get("jsonrpc") and "result" in doc:  # proxy module
                self._record(url, note)
                return res
            raise RuntimeError(f"Etherscan error for {redact(url)}: {doc.get('message')} {str(res)[:200]}")
        raise RuntimeError(f"Etherscan rate limit persists: {redact(url)}")

    def rpc(self, method: str, params: list, note: str):
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
        for k in range(8):
            try:
                doc = self.get_json(RPC, data=body, tries=2)
                if "result" in doc:
                    self._record(f"{RPC} {method} {json.dumps(params)}", note)
                    return doc["result"]
            except RuntimeError:
                pass
            time.sleep(1.0 + k)  # 429 or transient error
        raise RuntimeError(f"RPC {method} failed")

    def block_by_time(self, ts: int, closest: str) -> int:
        try:
            res = self.etherscan(
                {"module": "block", "action": "getblocknobytime", "timestamp": ts, "closest": closest},
                f"block {closest} {utc(ts)}",
            )
            return int(res)
        except RuntimeError:
            return self._bisect_block(ts, closest)

    def _bisect_block(self, ts: int, closest: str) -> int:
        def bt(n: int) -> int:
            return int(self.rpc("eth_getBlockByNumber", [hex(n), False], f"bisect block {n}")["timestamp"], 16)

        lo, hi = 1, int(self.rpc("eth_blockNumber", [], "latest block"), 16)
        if closest == "before":  # last block with timestamp <= ts
            while lo < hi:
                mid = (lo + hi + 1) // 2
                lo, hi = (mid, hi) if bt(mid) <= ts else (lo, mid - 1)
            return lo
        while lo < hi:  # first block with timestamp >= ts
            mid = (lo + hi) // 2
            lo, hi = (lo, mid) if bt(mid) >= ts else (mid + 1, hi)
        return lo

    def logs(self, address: str, topic0: str, topic1: str, from_block: int, to_block, note: str) -> list[dict]:
        """All matching logs, paging by block cursor (1000 rows per request)."""
        out: dict[tuple, dict] = {}
        cursor = from_block
        while True:
            res = self.etherscan(
                {
                    "module": "logs", "action": "getLogs", "address": address,
                    "fromBlock": cursor, "toBlock": to_block,
                    "topic0": topic0, "topic0_1_opr": "and", "topic1": topic1,
                    "page": 1, "offset": 1000,
                },
                note,
            )
            for r in res:
                out[(r["transactionHash"], r["logIndex"], r["data"], r["topics"][0])] = r
            if len(res) < 1000:
                break
            last = fb.hex_int(res[-1]["blockNumber"])
            if last <= cursor:
                raise RuntimeError("more than 1000 logs in one block")
            cursor = last  # re-read the last block whole; duplicates collapse in `out`
        rows = list(out.values())
        rows.sort(key=lambda r: (fb.hex_int(r["blockNumber"]), fb.hex_int(r["transactionIndex"]), fb.hex_int(r["logIndex"])))
        return rows


def fetch_binance_1s(net: Net, start: int, end: int) -> list[tuple[int, float]]:
    rows: dict[int, float] = {}
    t = start
    while t < end:
        url = (
            "https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1s"
            f"&startTime={t * 1000}&endTime={(min(t + 1000, end)) * 1000 - 1}&limit=1000"
        )
        data = net.get_json(url)
        net._record(url, f"binance 1s rows={len(data)}")
        for k in data:
            rows[int(k[0]) // 1000] = float(k[4])
        t += 1000
        time.sleep(0.15)
    return sorted(rows.items())


def fetch_binance_1m(net: Net, start: int, end: int) -> list:
    url = (
        "https://api.binance.com/api/v3/klines?symbol=ETHUSDT&interval=1m"
        f"&startTime={start * 1000}&endTime={end * 1000 - 1}&limit=1000"
    )
    data = net.get_json(url)
    net._record(url, f"binance 1m rows={len(data)}")
    return [[int(k[0]) // 1000, float(k[4])] for k in data]


def fetch_coinbase_1m(net: Net, start: int, end: int, product: str = "ETH-USD") -> list:
    url = (
        f"https://api.coinbase.com/api/v3/brokerage/market/products/{product}/candles"
        f"?granularity=ONE_MINUTE&start={start}&end={end}&limit=350"
    )
    data = net.get_json(url)
    rows = sorted([[int(c["start"]), float(c["close"])] for c in data["candles"]])
    net._record(url, f"coinbase {product} 1m rows={len(rows)}")
    return rows


def _merge_requests(data_dir: Path, rows: list) -> None:
    f = data_dir / "requests.json"
    old = json.loads(f.read_text()) if f.exists() else []
    f.write_text(json.dumps(old + rows))


def cmd_fetch(data_dir: Path, only_launch: bool = False, refresh: bool = False) -> int:
    data_dir.mkdir(parents=True, exist_ok=True)
    net = Net(data_dir)

    def have(name: str) -> bool:
        return not refresh and (data_dir / name).exists()

    def save(name: str, obj) -> None:
        (data_dir / name).write_text(json.dumps(obj))

    def load(name: str):
        return json.loads((data_dir / name).read_text())

    # The first Initialize the scout found on the PoolManager (2026-08-15): logs and timestamp of that one block.
    if not have("launch.json"):
        launch_logs = net.rpc(
            "eth_getLogs",
            [{"address": POOL_MANAGER, "fromBlock": hex(LAUNCH_BLOCK), "toBlock": hex(LAUNCH_BLOCK), "topics": [fb.INITIALIZE_TOPIC]}],
            "Initialize logs in the launch block",
        )
        launch_block = net.rpc("eth_getBlockByNumber", [hex(LAUNCH_BLOCK), False], "launch block timestamp")
        launch = {"logs": launch_logs, "timestamp": launch_block["timestamp"], "hooks": {}}
        for lg in launch_logs:
            hook = "0x" + lg["data"][2 + 2 * 64 + 24 : 2 + 3 * 64]  # Initialize data: fee, tickSpacing, hooks, ...
            url = f"https://sourcify.dev/server/v2/contract/{CHAIN_ID}/{hook}?fields=compilation,deployment"
            doc = net.get_json(url)
            net._record(url, "Sourcify: launch-block hook")
            launch["hooks"][hook] = {"name": doc.get("compilation", {}).get("fullyQualifiedName"), "match": doc.get("match"), "url": url}
        save("launch.json", launch)
    if only_launch:
        _merge_requests(data_dir, net.log)
        return 0

    blocks = load("blocks.json") if have("blocks.json") else {}
    wanted = {"scanEnd": (SCAN_END, "before")}
    for w in WINDOWS.values():
        wanted[f"{w.block_key}Start"] = (w.start, "after")
        wanted[f"{w.block_key}End"] = (w.end, "before")
    for w in TOP_WINDOWS:
        if w["rank"] in (3, 5):
            wanted[f"top{w['rank']}Start"] = (w["start"], "after")
            wanted[f"top{w['rank']}End"] = (w["end"], "before")
    for k, (ts, closest) in wanted.items():
        if k not in blocks:
            blocks[k] = net.block_by_time(ts, closest)
    save("blocks.json", blocks)
    print(f"blocks: {blocks}")

    for name, addr, topic in (
        ("poolconfigured.json", HOOK, fb.POOL_CONFIGURED_TOPIC),
        ("pokecleared.json", HOOK, fb.POKE_CLEARED_TOPIC),
        ("initialize.json", POOL_MANAGER, fb.INITIALIZE_TOPIC),
    ):
        if not have(name):
            save(name, net.logs(addr, topic, POOL_ID, HOOK_DEPLOY_BLOCK, blocks["scanEnd"], name))
    if not have("feepoked.json") or blocks.get("feePokedToBlock") != blocks["scanEnd"]:
        save("feepoked.json", net.logs(HOOK, fb.FEE_POKED_TOPIC, POOL_ID, HOOK_DEPLOY_BLOCK, blocks["scanEnd"], "FeePoked"))
        blocks["feePokedToBlock"] = blocks["scanEnd"]
        save("blocks.json", blocks)
    pokes = load("feepoked.json")
    print(f"FeePoked logs up to the scan end: {len(pokes)}")

    for w in WINDOWS.values():
        if not have(w.swaps_file):
            save(w.swaps_file, net.logs(POOL_MANAGER, fb.SWAP_TOPIC, POOL_ID, blocks[f"{w.block_key}Start"], blocks[f"{w.block_key}End"], f"Swap {w.key}"))
        print(f"Swap logs in {w.key}: {len(load(w.swaps_file))}")
    for r in (3, 5):
        if not have(f"swaps_top{r}.json"):
            save(f"swaps_top{r}.json", net.logs(POOL_MANAGER, fb.SWAP_TOPIC, POOL_ID, blocks[f"top{r}Start"], blocks[f"top{r}End"], f"Swap top{r}"))

    senders = load("poke_senders.json") if have("poke_senders.json") else {}
    for p in pokes:
        t = fb.hex_int(p["timeStamp"])
        if any(w.start - 7_200 <= t < w.end for w in WINDOWS.values()) and p["transactionHash"] not in senders:
            tx = net.rpc("eth_getTransactionByHash", [p["transactionHash"]], "poke sender")
            senders[p["transactionHash"]] = tx["from"].lower()
            time.sleep(0.05)
    save("poke_senders.json", senders)
    codes = load("keeper_code.json") if have("keeper_code.json") else {}
    for a in sorted(set(senders.values())):
        if a not in codes:
            codes[a] = {"code": net.rpc("eth_getCode", [a, "latest"], "keeper code"), "at": now_iso()}
    save("keeper_code.json", codes)

    for w in WINDOWS.values():
        if not have(w.price_file):
            rows = fetch_binance_1s(net, w.price_start, w.end)
            with open(data_dir / w.price_file, "w") as f:
                for ts, c in rows:
                    f.write(f"{ts},{c}\n")
            print(f"Binance 1s rows for {w.key}: {len(rows)}")
    if not have("binance_1m_top_windows.json"):
        save("binance_1m_top_windows.json", {str(w["rank"]): fetch_binance_1m(net, w["start"] - 16 * 60, w["end"]) for w in TOP_WINDOWS})
    if not have("coinbase_1m_window.json"):
        save("coinbase_1m_window.json", fetch_coinbase_1m(net, WINDOW_START - 16 * 60, WINDOW_END))
    if not have("coinbase_usdtusd_1m_window.json"):
        save("coinbase_usdtusd_1m_window.json", fetch_coinbase_1m(net, WINDOW_START - 1_800, WINDOW_END + 1_800, "USDT-USD"))

    _merge_requests(data_dir, net.log)
    if net._key:
        for f in data_dir.iterdir():
            if f.is_file() and net._key in f.read_text(errors="ignore"):
                raise SystemExit(f"refusing: key found in {f.name}")
    print(f"wrote raw data to {data_dir} ({len(net.log)} new requests)")
    return 0


# ---- offline analysis ----


def load_cache(data_dir: Path) -> dict:
    def j(name):
        return json.loads((data_dir / name).read_text())

    def opt(name):
        return j(name) if (data_dir / name).exists() else None

    by_window = {
        k: fb.sorted_events([fb.decode_swap_fee(r) for r in j(w.swaps_file)])
        for k, w in WINDOWS.items()
        if (data_dir / w.swaps_file).exists()
    }
    return {
        "blocks": j("blocks.json"),
        "configs": fb.sorted_events([fb.decode_poolconfigured(r) for r in j("poolconfigured.json")]),
        "clears": j("pokecleared.json"),
        "init": j("initialize.json"),
        "pokes": fb.sorted_events([fb.decode_feepoked(r) for r in j("feepoked.json")]),
        "swaps": by_window["cpi"],
        "swapsByWindow": by_window,
        "swapsTop": {r: [fb.decode_swap_fee(x) for x in j(f"swaps_top{r}.json")] for r in (3, 5)},
        "senders": j("poke_senders.json"),
        "keeperCode": opt("keeper_code.json"),
        "b1m": j("binance_1m_top_windows.json"),
        "cb1m": j("coinbase_1m_window.json"),
        "usdt1m": opt("coinbase_usdtusd_1m_window.json"),
        "requests": j("requests.json"),
        "launch": opt("launch.json"),
    }


def _clears_t(d: dict) -> np.ndarray:
    return np.array([fb.hex_int(r["timeStamp"]) for r in d["clears"]], dtype=np.int64)


def swap_check(d: dict, swaps: list | None = None) -> dict:
    sw = d["swaps"] if swaps is None else swaps
    t = np.array([s.t for s in sw], dtype=np.int64)
    keys = np.array([s.key for s in sw], dtype=np.int64)
    rebuilt = fb.keeper_fee_at(t, d["pokes"], d["configs"], _clears_t(d), query_keys=keys)
    charged = np.array([s.fee_pips for s in sw], dtype=np.int64)
    bad = np.nonzero(rebuilt != charged)[0]
    return {
        "swaps": len(sw),
        "matched": int(len(sw) - len(bad)),
        "mismatches": [
            {"block": sw[i].block, "tx": sw[i].tx, "chargedPips": int(charged[i]), "rebuiltPips": int(rebuilt[i])}
            for i in bad[:50]
        ],
        "meanChargedBp": float(charged.mean()) / 100 if len(sw) else None,
        "minChargedBp": float(charged.min()) / 100 if len(sw) else None,
        "maxChargedBp": float(charged.max()) / 100 if len(sw) else None,
        "firstBlock": sw[0].block if sw else None,
        "lastBlock": sw[-1].block if sw else None,
        "method": "Swap.fee (last data word) of every PoolManager Swap log on the pool vs the rule rebuilt from "
        "FeePoked/PoolConfigured at the swap's place in the chain (block, transactionIndex, logIndex). State reads at "
        "past blocks are not available (no archive RPC: the public RPC serves no historical state and the Etherscan "
        "proxy eth_call ignores the block tag); Swap.fee is the fee each swap actually paid.",
    }


def rv15_minutes(rows: list, t_obs: np.ndarray) -> np.ndarray:
    """RV15 (%/yr) from [[open_ts, close], ...] 1-minute candles, at each t_obs on a minute boundary."""
    ts = np.array([r[0] for r in rows], dtype=np.int64)
    px = np.array([r[1] for r in rows], dtype=np.float64)
    close_t = ts + 60
    grid = np.arange(close_t[0], close_t[-1] + 60, 60)
    idx = np.searchsorted(close_t, grid, side="right") - 1  # forward-fill missing candles
    logp = np.log(px[idx])
    pos = (np.asarray(t_obs) - grid[0]) // 60
    win = pos[:, None] - np.arange(15, -1, -1)[None, :]
    if win.min() < 0:
        raise ValueError("not enough minutes for RV15")
    r = np.diff(logp[win], axis=1)
    return 100.0 * np.sqrt((r * r).sum(axis=1) / 900.0) * math.sqrt(31_536_000)


def rv15_from_series(series, t_obs: np.ndarray) -> np.ndarray:
    """Raw RV15 (%/yr) from a 1 s series at minute boundaries t_obs (minute close = 1 s close at second m-1)."""
    idx = (t_obs // 60 * 60)[:, None] - 1 - 60 * np.arange(15, -1, -1)[None, :] - series.t0
    r = np.diff(series.logp[idx], axis=1)
    return 100.0 * per_sqrt_s_to_annual(1.0) * np.sqrt((r * r).sum(axis=1) / 900)


def bp(pips) -> float:
    return float(pips) / 100.0


def pct(v: float) -> str:
    return f"{v:+.1f} %"


def usd(v: float) -> str:
    return f"-${-v:.2f}" if v < 0 else f"${v:.2f}"


def cfg_at(cfgs: list, t: int):
    return [c for c in cfgs if c.t <= t][-1]


def policy_stats(fee: np.ndarray, sched, cap_pips: int | None, seconds: float) -> dict:
    sig = sched.sigma_e9.astype(np.float64)
    q25, q75 = np.quantile(sig, [0.25, 0.75])
    top, low = sig >= q75, sig <= q25
    dyn = run_arb(sched.x, log_bands(fee))
    static = static_fee_equal_time(fee)
    sta = run_arb(sched.x, float(log_bands(np.array([static]))[0]))
    const = bool(np.all(fee == fee[0]))
    return {
        "meanFeeBp": bp(fee.mean()),
        "minFeeBp": bp(fee.min()),
        "maxFeeBp": bp(fee.max()),
        "pctTimeAtCap": None if cap_pips is None else 100.0 * float(np.mean(fee >= cap_pips)),
        "meanFeeTopQuartileSigmaBp": bp(fee[top].mean()),
        "meanFeeBottomQuartileSigmaBp": bp(fee[low].mean()),
        "corrFeeSigma": None if const else float(np.corrcoef(fee.astype(np.float64), sig)[0, 1]),
        "arbUsd": dyn.arb * USD_PER_DEPTH_1M,
        "arbFeesUsd": dyn.arb_fees * USD_PER_DEPTH_1M,
        "arbBpOfTvlPerYear": bp_per_year(dyn.arb * USD_PER_DEPTH_1M, 1e6, seconds),
        "pTrade": dyn.p_trade,
        "staticSameMeanBp": bp(static),
        "arbStaticSameMeanUsd": sta.arb * USD_PER_DEPTH_1M,
        "arbChangeVsStaticPct": 100.0 * (dyn.arb / sta.arb - 1.0),
    }


def equal_mean_k(sigma_e9: np.ndarray, params: HookParams, target_pips: float) -> int:
    lo, hi = 1, 400_000
    while lo < hi:  # smallest k with mean fee >= target
        mid = (lo + hi) // 2
        if fee_pips_array(sigma_e9, params, mid).mean() >= target_pips:
            hi = mid
        else:
            lo = mid + 1
    cands = [k for k in (lo - 1, lo) if k >= 1]
    return min(cands, key=lambda k: abs(fee_pips_array(sigma_e9, params, k).mean() - target_pips))


def vs_static_pct(x: np.ndarray, fee: np.ndarray) -> float:
    dyn = run_arb(x, log_bands(fee)).arb
    sta = run_arb(x, float(log_bands(np.array([fee.mean()]))[0])).arb
    return 100.0 * (dyn / sta - 1.0)


def equal_mean(sched, keeper: np.ndarray, clim: HookParams, clim_fb: HookParams) -> tuple[dict, dict]:
    """clim rescaled (lab-only k) to the keeper's time-average fee: uncapped (5-150 bp) and inside Fables' bounds."""
    target = float(keeper.mean())
    rk = run_arb(sched.x, log_bands(keeper))
    arb_k = rk.arb * USD_PER_DEPTH_1M
    k1 = equal_mean_k(sched.sigma_e9, clim, target)
    f1 = fee_pips_array(sched.sigma_e9, clim, k1)
    r1 = run_arb(sched.x, log_bands(f1))
    k2 = equal_mean_k(sched.sigma_e9, clim_fb, target)
    f2 = fee_pips_array(sched.sigma_e9, clim_fb, k2)
    r2 = run_arb(sched.x, log_bands(f2))
    out = {
        "kE4": k1,
        "meanFeeBp": bp(f1.mean()),
        "keeperMeanFeeBp": bp(target),
        "arbKeeperUsd": arb_k,
        "arbClimUsd": r1.arb * USD_PER_DEPTH_1M,
        "diffPct": 100.0 * (r1.arb / rk.arb - 1.0),
        "climMinFeeBp": bp(f1.min()),
        "climMaxFeeBp": bp(f1.max()),
        "corrFeeSigma": float(np.corrcoef(f1.astype(np.float64), sched.sigma_e9.astype(np.float64))[0, 1]),
        "inFablesBounds": {
            "kE4": k2,
            "floorBp": bp(clim_fb.fee_min_pips),
            "capBp": bp(clim_fb.fee_max_pips),
            "meanFeeBp": bp(f2.mean()),
            "pctTimeAtCap": 100.0 * float(np.mean(f2 >= clim_fb.fee_max_pips)),
            "arbClimUsd": r2.arb * USD_PER_DEPTH_1M,
            "diffPct": 100.0 * (r2.arb / rk.arb - 1.0),
        },
        "label": "lab-only rescale: k is immutable in a deployed clim hook. diffPct > 0: clim's rule loses more to "
        "arbitrage than the keeper at the same average fee; diffPct < 0: it loses less",
    }
    return out, {"keeper": keeper, "climK": f1, "rk": rk, "rc": r1}


def run_grid(series, reports, d: dict, start: int, end: int, block_sec: int, clim: HookParams, clim_fb: HookParams) -> dict:
    sched = block_schedule(series, reports, start=start, end=end, block_sec=block_sec, latency_sec=LATENCY_SEC)
    seconds = float(len(sched) * block_sec)
    keeper = fb.keeper_fee_at(sched.t, d["pokes"], d["configs"], _clears_t(d))
    cap_keeper = cfg_at(d["configs"], start).cap_pips
    fees = {
        "fablesKeeper": (keeper, cap_keeper),
        "clim": (fee_pips_array(sched.sigma_e9, clim), clim.fee_max_pips),
        "climFablesBounds": (fee_pips_array(sched.sigma_e9, clim_fb), clim_fb.fee_max_pips),
        "flat7": (np.full(len(sched), FLAT_PIPS, dtype=np.int64), None),
    }
    policies = {k: policy_stats(f, sched, cap, seconds) for k, (f, cap) in fees.items()}
    eq, paths = equal_mean(sched, keeper, clim, clim_fb)
    return {
        "blockSec": block_sec,
        "blocks": len(sched),
        "firstBlockTs": int(sched.t[0]),
        "lastBlockTs": int(sched.t[-1]),
        "climParams": {"etaE4": clim.eta_e4, "sqrtHalfDtE6": clim.sqrt_half_dt_e6, "feeMinPips": clim.fee_min_pips, "feeMaxPips": clim.fee_max_pips},
        "climFablesBoundsParams": {"etaE4": clim_fb.eta_e4, "sqrtHalfDtE6": clim_fb.sqrt_half_dt_e6, "feeMinPips": clim_fb.fee_min_pips, "feeMaxPips": clim_fb.fee_max_pips},
        "policies": policies,
        "equalMean": eq,
        "_sched": sched,
        "_paths": paths,
    }


def sensitivity_row(series, reports, d, label, start, end, block_sec, delay, clim, clim_fb, event_ts) -> dict:
    pokes = fb.delay_pokes(d["pokes"], delay) if delay else d["pokes"]
    sched = block_schedule(series, reports, start=start, end=end, block_sec=block_sec, latency_sec=LATENCY_SEC)
    keeper = fb.keeper_fee_at(sched.t, pokes, d["configs"], _clears_t(d))
    clim_f = fee_pips_array(sched.sigma_e9, clim)
    eq, _ = equal_mean(sched, keeper, clim, clim_fb)
    return {
        "label": label,
        "blockSec": block_sec,
        "startUtc": utc(int(sched.t[0])),
        "endUtc": utc(end),
        "keeperDelaySec": delay,
        "windowIncludesEvent": bool(sched.t[0] <= event_ts < end),
        "blocks": len(sched),
        "keeperMeanFeeBp": bp(keeper.mean()),
        "climMeanFeeBp": bp(clim_f.mean()),
        "keeperArbVsStaticPct": vs_static_pct(sched.x, keeper),
        "climArbVsStaticPct": vs_static_pct(sched.x, clim_f),
        "arbKeeperUsd": eq["arbKeeperUsd"],
        "arbClimEqualMeanUsd": eq["arbClimUsd"],
        "equalMeanDiffPct": eq["diffPct"],
        "equalMeanInFablesBoundsDiffPct": eq["inFablesBounds"]["diffPct"],
        "kE4": eq["kE4"],
        "kE4InFablesBounds": eq["inFablesBounds"]["kE4"],
    }


def per_block_gap(paths: dict, sched, n: int = 5) -> dict:
    gap = (paths["rc"].arb_by_block - paths["rk"].arb_by_block) * USD_PER_DEPTH_1M
    rows = []
    for i in np.argsort(-gap)[:n].tolist():
        rows.append({
            "timeUtc": utc(int(sched.t[i])),
            "ethMovePctSincePrevBlock": 100.0 * (math.exp(float(sched.x[i] - sched.x[i - 1])) - 1.0) if i else 0.0,
            "keeperFeeBp": bp(paths["keeper"][i]),
            "climEqualMeanFeeBp": bp(paths["climK"][i]),
            "arbKeeperUsd": float(paths["rk"].arb_by_block[i] * USD_PER_DEPTH_1M),
            "arbClimEqualMeanUsd": float(paths["rc"].arb_by_block[i] * USD_PER_DEPTH_1M),
            "gapUsd": float(gap[i]),
        })
    return {
        "totalGapUsd": float(gap.sum()),
        "topBlocks": rows,
        "note": "ARB per block of the keeper and of clim rescaled to the keeper's average fee (12 s grid); "
        "gapUsd > 0 where clim loses more. Per-block ARB depends on each pool's own path, so this splits the gap on this path only.",
    }


def event_concentration(grid: dict, event_ts: int, before: int = 60, after: int = 900) -> dict:
    """How much of the equal-average ARB gap (clim minus keeper) falls in [event - 1 min, event + 15 min)."""
    paths, sched = grid["_paths"], grid["_sched"]
    gap = (paths["rc"].arb_by_block - paths["rk"].arb_by_block) * USD_PER_DEPTH_1M
    near = (sched.t >= event_ts - before) & (sched.t < event_ts + after)
    return {
        "blockSec": grid["blockSec"],
        "fromUtc": utc(event_ts - before),
        "toUtc": utc(event_ts + after),
        "arbKeeperUsd": paths["rk"].arb * USD_PER_DEPTH_1M,
        "arbClimEqualMeanUsd": paths["rc"].arb * USD_PER_DEPTH_1M,
        "totalGapUsd": float(gap.sum()),
        "gapNearEventUsd": float(gap[near].sum()),
        "gapRestOfWindowUsd": float(gap[~near].sum()),
    }


def minute_view(series, reports, d: dict, params: HookParams, start: int, end: int):
    tm = np.arange(start, end, 60, dtype=np.int64)
    msched = schedule_on_path(tm, series.at(tm), reports, LATENCY_SEC)
    if len(msched) != len(tm):
        raise ValueError("minute grid starts before the first effective report")
    keeper_m = fb.keeper_fee_at(tm, d["pokes"], d["configs"], _clears_t(d))
    clim_m = fee_pips_array(msched.sigma_e9, params)
    return tm, msched, keeper_m, clim_m


def cap_pokes(series, in_win: list, cap: int, tm, msched, clim_m, end: int) -> list:
    out = []
    for p in in_win:
        if p.fee_pips < cap:
            continue
        i = int(np.searchsorted(tm, p.t, side="right") - 1)
        out.append({
            "timeUtc": utc(p.t), "block": p.block, "tx": p.tx,
            "climSigmaAnnualPctAtPoke": 100.0 * per_sqrt_s_to_annual(float(msched.sigma_e9[i]) / 1e9),
            "climFeeBpAtPoke": bp(clim_m[i]),
            "climFeeBp3MinLater": bp(clim_m[min(i + 3, len(tm) - 1)]),
            "ethUsd30sBefore": round(float(np.exp(series.at(p.t - 30))), 2),
            "ethUsdAtPoke": round(float(np.exp(series.at(p.t))), 2),
            "ethUsd60sAfter": round(float(np.exp(series.at(min(p.t + 60, end - 1)))), 2),
        })
    return out


def usdt_check(d: dict, series, start: int, end: int) -> dict:
    out: dict = {"usdgUsd": "not checked"}
    if d["usdt1m"]:
        c = np.array([r[1] for r in d["usdt1m"] if start <= r[0] < end])
        out["coinbaseUsdtUsd1m"] = {
            "source": "Coinbase USDT-USD 1-minute candles (close)",
            "minutes": len(c), "min": float(c.min()), "median": float(np.median(c)), "max": float(c.max()),
        }
    cb = [(r[0], r[1]) for r in d["cb1m"] if start <= r[0] < end]
    ratio = np.array([c / math.exp(float(series.at(t0 + 59))) for t0, c in cb])
    out["impliedUsdtUsd"] = {
        "source": "Coinbase ETH-USD / Binance ETHUSDT 1-minute closes (close-timing noise included)",
        "minutes": len(ratio), "min": float(ratio.min()), "median": float(np.median(ratio)), "max": float(ratio.max()),
    }
    return out


def window_ranking(wdoc: dict, start: int) -> dict | None:
    best = None
    for w in wdoc["topWindows"]:
        ov = min(w["endTs"], start + 14_400) - max(w["startTs"], start)
        if ov > 0 and (best is None or ov > best[0]):
            best = (ov, w)
    return best[1] if best else None


def analyse_window(w: Win, data_dir: Path, d: dict, params: HookParams, rows: list, dt1: bool) -> dict:
    """Everything both windows share: swap check, pokes, minute series, the 12 s (and 1 s) grids, sensitivity rows."""
    series = load_1s_csv(data_dir / w.price_file)
    reports = desk_reports(series, start=w.start - WARMUP_SEC, end=w.end)
    cfg = cfg_at(d["configs"], w.start)
    floor_eff = max(cfg.floor_pips, cfg.flat_pips * (10_000 - fb.MAX_POKE_DISCOUNT_BPS) // 10_000)
    clim12_fb = HookParams(params.p_star, params.eta_e4, params.sqrt_half_dt_e6, fee_min_pips=floor_eff, fee_max_pips=cfg.cap_pips)
    clim1 = HookParams.from_pstar(params.p_star, 1)
    clim1_fb = HookParams(clim1.p_star, clim1.eta_e4, clim1.sqrt_half_dt_e6, fee_min_pips=floor_eff, fee_max_pips=cfg.cap_pips)
    grids = {"dt12": run_grid(series, reports, d, w.start, w.end, 12, params, clim12_fb)}
    if dt1:
        grids["dt1"] = run_grid(series, reports, d, w.start, w.end, 1, clim1, clim1_fb)
    tm, msched, keeper_m, clim_m = minute_view(series, reports, d, params, w.start, w.end)
    in_win = [p for p in d["pokes"] if w.start <= p.t < w.end]
    before = [p for p in d["pokes"] if p.t < w.start][-1]
    sens = []
    for label, start, block_sec, delay in rows:
        p, pfb = (params, clim12_fb) if block_sec == 12 else (clim1, clim1_fb)
        sens.append(sensitivity_row(series, reports, d, label, start, w.end, block_sec, delay, p, pfb, EVENTS[w.event]["ts"]))
    t_obs = np.arange(w.start + 60, w.end + 1, 60, dtype=np.int64)
    rv = rv15_from_series(series, t_obs)
    conc = [event_concentration(g, EVENTS[w.event]["ts"]) for g in grids.values()]
    return {
        "eventConcentration": conc,
        "w": w, "series": series, "reports": reports, "cfg": cfg, "grids": grids, "clim1": clim1,
        "tm": tm, "msched": msched, "keeperM": keeper_m, "climM": clim_m,
        "inWin": in_win, "before": before, "sens": sens, "rv": rv, "tObs": t_obs,
        "swapCheck": swap_check(d, d["swapsByWindow"][w.key]),
        "capPokes": cap_pokes(series, in_win, cfg.cap_pips, tm, msched, clim_m, w.end),
    }


def strip(run: dict) -> dict:
    return {k: v for k, v in run.items() if not k.startswith("_")}


def pokes_json(in_win: list) -> list:
    return [
        {"block": p.block, "timeUtc": utc(p.t), "feePips": p.fee_pips, "expiryTs": p.expiry, "ttlSec": p.expiry - p.t, "tx": p.tx}
        for p in in_win
    ]


def keeper_minutes(a: dict) -> dict:
    km, tm = a["keeperM"], a["tm"]
    at_cap = np.nonzero(km >= a["cfg"].cap_pips)[0]
    return {
        "meanBp": bp(km.mean()),
        "minBp": bp(km.min()),
        "maxBp": bp(km.max()),
        "minutesAtCap": int(len(at_cap)),
        "firstAtCapUtc": utc(int(tm[at_cap[0]])) if len(at_cap) else None,
    }


def cmd_run(data_dir: Path) -> int:
    if not WINDOWS_FILE.exists():
        raise SystemExit(f"{WINDOWS_FILE} missing: run scripts/fables_windows.py run first")
    wdoc = json.loads(WINDOWS_FILE.read_text())
    scan_top = [(w["startTs"], w["endTs"]) for w in wdoc["topWindows"][:5]]
    if scan_top != [(w["start"], w["end"]) for w in TOP_WINDOWS]:
        raise SystemExit("TOP_WINDOWS no longer matches the first five windows of lab/out/fables-windows.json")

    d = load_cache(data_dir)
    params = HookParams.from_json(load_params())
    cfgs = d["configs"]
    cpi_ts, fomc_ts = EVENTS["cpi"]["ts"], EVENTS["fomc"]["ts"]

    rows_cpi = [
        ("as measured", WINDOW_START, 12, 0),
        ("keeper pokes 12 s late", WINDOW_START, 12, 12),
        ("keeper pokes 30 s late", WINDOW_START, 12, 30),
        ("keeper pokes 60 s late", WINDOW_START, 12, 60),
        ("window starts 12:30:24, after the 12:30:12 block", WINDOW_START + 24, 12, 0),
        ("window starts 12:45", WINDOW_START + 900, 12, 0),
        ("window starts 13:00", WINDOW_START + 1_800, 12, 0),
        ("as measured", WINDOW_START, 1, 0),
        ("keeper pokes 30 s late", WINDOW_START, 1, 30),
        ("window starts 12:30:24", WINDOW_START + 24, 1, 0),
        ("window starts 12:45", WINDOW_START + 900, 1, 0),
    ]
    rows_fomc = [
        ("as measured", FOMC_START, 12, 0),
        ("keeper pokes 12 s late", FOMC_START, 12, 12),
        ("keeper pokes 30 s late", FOMC_START, 12, 30),
        ("as measured", FOMC_START, 1, 0),
        ("keeper pokes 30 s late", FOMC_START, 1, 30),
    ]
    A = analyse_window(WINDOWS["cpi"], data_dir, d, params, rows_cpi, dt1=True)
    B = analyse_window(WINDOWS["fomc"], data_dir, d, params, rows_fomc, dt1=True)
    series, chk = A["series"], A["swapCheck"]
    dt12, dt1 = A["grids"]["dt12"], A["grids"]["dt1"]
    in_win, pb = A["inWin"], A["before"]
    senders = sorted({d["senders"][p.tx] for p in in_win + B["inWin"] if p.tx in d["senders"]})
    keeper_addr = senders[0] if len(senders) == 1 else senders
    codes = d["keeperCode"] or {}
    keeper_is_eoa = all(codes.get(a, {}).get("code") == "0x" for a in senders) if codes else None
    breakdown = per_block_gap(dt12["_paths"], dt12["_sched"])
    event_block = next((r for r in breakdown["topBlocks"] if r["timeUtc"] == utc(cpi_ts + 12)), None)

    # raw block time: measured from the block numbers at the window bounds
    nb = d["blocks"]["windowEnd"] - d["blocks"]["windowStart"]
    sec_per_block = (WINDOW_END - WINDOW_START) / nb
    raw = HookParams(params.p_star, params.eta_e4, sqrt_half_dt_e6(sec_per_block))
    raw_fee = fee_pips_array(dt1["_sched"].sigma_e9, raw)
    floor_sigma_e9 = params.fee_min_pips * 10**17 / (raw.eta_e4 * raw.sqrt_half_dt_e6 * 10_000)
    floor_pct = 100.0 * per_sqrt_s_to_annual(floor_sigma_e9 / 1e9)

    rv_b1s, t_obs = A["rv"], A["tObs"]
    rv_cb = rv15_minutes(d["cb1m"], t_obs)
    usdt = usdt_check(d, series, WINDOW_START, WINDOW_END)

    top = []
    for w in TOP_WINDOWS:
        to = np.arange(w["start"] + 60, w["end"] + 1, 60, dtype=np.int64)
        rv = rv15_minutes(d["b1m"][str(w["rank"])], to)
        top.append({**w, "meanRv15": float(rv.mean()), "peakRv15": float(rv.max()), "peakAtUtc": utc(int(to[int(rv.argmax())]))})
    init = d["init"][0]
    init_block, init_t = fb.hex_int(init["blockNumber"]), fb.hex_int(init["timeStamp"])
    first_poke = d["pokes"][0]
    other = []
    for w in top:
        if w["rank"] == 2:
            continue
        if w["end"] <= init_t:
            fact = (
                f"Predates the ETH/USDG pool: the pool was initialized at block {init_block} "
                f"({utc(init_t)}, tx {init['transactionHash']})."
            )
        else:
            n_pokes = sum(1 for p in d["pokes"] if w["start"] - 72 * 3600 <= p.t < w["end"])
            sw = d["swapsTop"].get(w["rank"], [])
            fees = sorted({s.fee_pips for s in sw})
            cfg = cfg_at(cfgs, w["start"])
            fact = (
                f"Predates the keeper: {n_pokes} FeePoked logs from 72 h before the window to its end (the first FeePoked "
                f"is at block {first_poke.block}, {utc(first_poke.t)}); config {cfg.floor_pips}/{cfg.flat_pips}/{cfg.cap_pips} pips "
                f"(floor/flat/cap); {len(sw)} swaps in the window, charged fee(s) {fees} pips."
            )
        other.append({"rank": w["rank"], "label": w["label"], "meanRv15": round(w["meanRv15"], 1), "peakRv15": round(w["peakRv15"], 1), "fact": fact})
    main = next(w for w in top if w["rank"] == 2)

    scan = wdoc["scan"]
    r_cpi, r_fomc = window_ranking(wdoc, WINDOW_START), window_ranking(wdoc, FOMC_START)
    cur = cfgs[-1]
    cur_cfg = f"{cur.floor_pips}/{cur.flat_pips}/{cur.cap_pips}"
    fomc_rank_cur = 1 + sum(
        1 for w in wdoc["topWindows"]
        if w["state"] == "keeperLive" and w.get("config") == cur_cfg and w["meanRv15"] > r_fomc["meanRv15"] and w["startTs"] != r_cpi["startTs"]
    )
    why_cpi = (
        f"Highest 4 h mean Binance RV15 since the ETH/USDG keeper's first poke ({utc(first_poke.t)}) and rank "
        f"{r_cpi['rank']} since {scan['fromUtc'][:10]} ({main['meanRv15']:.1f} %/yr mean, peak {main['peakRv15']:.1f} at "
        f"{main['peakAtUtc']}), in a scan of Binance ETHUSDT 1-minute closes from {scan['fromUtc']} through "
        f"{scan['lastCandleOpenUtc']} (last candle open; lab/scripts/fables_windows.py, lab/out/fables-windows.json). "
        f"The keeper was live and the current config ({cur_cfg} pips) applied. It starts at the US CPI release (12:30:00 UTC)."
    )
    why_fomc = (
        f"The same scan's window {r_fomc['label']} ({r_fomc['meanRv15']:.2f} %/yr mean) is rank {r_fomc['rank']} overall and rank "
        f"{fomc_rank_cur} among keeper-live windows under the current {cur_cfg} config other than 2026-09-11 (the higher "
        "2026-09-04 window ran under the previous config). This study uses 16:50-20:50 UTC, the window the out-of-sample "
        "check ran on: one minute later, the same storm. It contains the FOMC statement at 18:00:00 UTC."
    )

    pol12 = dt12["policies"]
    eq12, eq1 = dt12["equalMean"], dt1["equalMean"]
    b12 = B["grids"]["dt12"]
    beq = b12["equalMean"]
    shape = wdoc["keeperShape"]

    def row(rows, label, block_sec=12):
        return next(r for r in rows if r["label"].startswith(label) and r["blockSec"] == block_sec)

    flip = [r for r in A["sens"] if r["blockSec"] == 12 and (r["keeperDelaySec"] == 30 or not r["windowIncludesEvent"])]
    flip_lo = min(-r["equalMeanDiffPct"] for r in flip)
    flip_hi = max(-r["equalMeanDiffPct"] for r in flip)
    after = [r for r in A["sens"] if r["blockSec"] == 12 and not r["windowIncludesEvent"]]
    late30_a, late30_a1 = row(A["sens"], "keeper pokes 30 s late"), row(A["sens"], "keeper pokes 30 s late", 1)
    late12_a = row(A["sens"], "keeper pokes 12 s late")
    late30_b, late30_b1 = row(B["sens"], "keeper pokes 30 s late"), row(B["sens"], "keeper pokes 30 s late", 1)
    late12_b = row(B["sens"], "keeper pokes 12 s late")
    beq1 = B["grids"]["dt1"]["equalMean"]
    conc_a12 = next(c for c in A["eventConcentration"] if c["blockSec"] == 12)
    conc_b1 = next(c for c in B["eventConcentration"] if c["blockSec"] == 1)
    cap_a = A["capPokes"][0]
    cap_b = B["capPokes"][0] if B["capPokes"] else None
    near_b = B["keeperM"][(B["tm"] >= fomc_ts - 60) & (B["tm"] < fomc_ts + 900)] / 100.0

    results = {
        "headline": (
            f"On 2026-09-11 12:30-16:30 UTC, Fables' keeper fee (measured on-chain; it matches all {chk['swaps']:,} swaps) "
            f"averaged {pol12['fablesKeeper']['meanFeeBp']:.1f} bp and sat at its 60 bp cap {pol12['fablesKeeper']['pctTimeAtCap']:.0f} % "
            f"of the time. At the same average fee, the lab's arbitrage model has clim's rule (12 s blocks) losing "
            f"{eq12['diffPct']:.1f} % more to arbitrage than the keeper's fee path. The keeper's edge is its 60 bp cap poke in "
            f"the same second as the US CPI release (12:30:00 UTC): the gap comes entirely from the next 15 minutes. Delay its "
            f"pokes by 30 s, or start the window after the 12:30:12 block, and clim's rule loses {flip_lo:.0f} to {flip_hi:.0f} % "
            "less than the keeper at the same average fee."
        ),
        "measured": (
            f"Keeper fee rebuilt from {len(in_win)} FeePoked logs in the window (and the poke live at its start) with the hook's "
            f"verified rule; it matches the fee paid by {chk['matched']} of {chk['swaps']} swaps. Mean {pol12['fablesKeeper']['meanFeeBp']:.2f} bp, "
            f"range {pol12['fablesKeeper']['minFeeBp']:.2f} to {pol12['fablesKeeper']['maxFeeBp']:.0f} bp."
        ),
        "atActualFeeLevels": (
            f"The keeper charged {pol12['fablesKeeper']['meanFeeBp'] / pol12['clim']['meanFeeBp']:.1f} times clim's modelled 12 s fee "
            f"({pol12['fablesKeeper']['meanFeeBp']:.1f} vs {pol12['clim']['meanFeeBp']:.1f} bp). With no volume response in the model a higher "
            f"fee always lowers ARB (${pol12['fablesKeeper']['arbUsd']:.2f} vs ${pol12['clim']['arbUsd']:.2f} per $1M), so this row cannot say "
            "which fee is better for LPs once traders react."
        ),
        "equalAverageFee": (
            f"Lab-only rescale of clim's k to the keeper's mean: 12 s grid, clim loses {pct(eq12['diffPct'])} vs the keeper "
            f"({pct(eq12['inFablesBounds']['diffPct'])} inside Fables' 3.5-60 bp bounds); 1 s grid, {pct(eq1['diffPct'])} "
            f"({pct(eq1['inFablesBounds']['diffPct'])} inside the bounds). Positive: clim loses more."
        ),
        "whatDrivesIt": (
            f"At {hms(cpi_ts)} UTC the keeper poked its cap (tx {cap_a['tx']}) while clim's desk read "
            f"{cap_a['climSigmaAnnualPctAtPoke']:.0f} %/yr and charged {cap_a['climFeeBpAtPoke']:.2f} bp; ETH fell from "
            f"{cap_a['ethUsdAtPoke']} to {cap_a['ethUsd60sAfter']} within a minute, and clim's fee reached {cap_a['climFeeBp3MinLater']:.2f} bp "
            f"three minutes later. On the equal-average 12 s path the {hms(cpi_ts + 12)} block alone costs clim "
            f"${event_block['arbClimEqualMeanUsd']:.2f} against ${event_block['arbKeeperUsd']:.2f} for the keeper; "
            f"{usd(conc_a12['gapNearEventUsd'])} of gap falls between 12:29 and 12:45 and {usd(conc_a12['gapRestOfWindowUsd'])} "
            f"over the rest of the window (total {usd(conc_a12['totalGapUsd'])}): outside those minutes clim's rule loses less. clim's backward-looking 15-minute RV, 30 s "
            "reports and 12 s latency cannot anticipate a scheduled jump."
        ),
        "sensitivity": (
            "Differences in ARB at equal average fee, clim vs keeper (negative: clim loses less). "
            f"Keeper pokes 30 s late: {pct(late30_a['equalMeanDiffPct'])} at 12 s, {pct(late30_a1['equalMeanDiffPct'])} at 1 s. "
            f"12 s late: {pct(late12_a['equalMeanDiffPct'])} (the 12:30:00 cap poke still covers the 12:30:12 block). "
            f"Window starting after the print (12:30:24, 12:45, 13:00): {', '.join(pct(r['equalMeanDiffPct']) for r in after)}. "
            f"Clamped to Fables' 3.5-60 bp bounds, the difference is {pct(late30_a['equalMeanInFablesBoundsDiffPct'])} with the keeper "
            f"30 s late but {', '.join(pct(r['equalMeanInFablesBoundsDiffPct']) for r in after)} on the later starts: inside those bounds "
            "clim's shape does not beat the keeper's even without the print."
        ),
        "secondWindow": (
            f"2026-09-16 16:50-20:50 UTC (FOMC statement at 18:00 UTC): keeper mean {b12['policies']['fablesKeeper']['meanFeeBp']:.1f} bp "
            f"vs clim {b12['policies']['clim']['meanFeeBp']:.1f} bp (12 s); the rebuilt fee matches {B['swapCheck']['matched']} of "
            f"{B['swapCheck']['swaps']} swaps. "
            + (f"The keeper poked its cap at {cap_b['timeUtc'][11:19]} UTC, one minute before the statement, and held "
               f"{near_b.min():.0f} to {near_b.max():.0f} bp through the next 15 minutes. " if cap_b else "")
            + f"At the same average fee clim loses {pct(beq['diffPct'])} at 12 s ({pct(late12_b['equalMeanDiffPct'])} with the keeper "
            f"12 s late, {pct(late30_b['equalMeanDiffPct'])} 30 s late) and {pct(beq1['diffPct'])} at 1 s, where the 30 s delay does "
            f"not change the sign ({pct(late30_b1['equalMeanDiffPct'])}) because the cap was already in place before the statement; "
            f"at 1 s, ${conc_b1['gapNearEventUsd']:.2f} of the ${conc_b1['totalGapUsd']:.2f} gap falls between 17:59 and 18:15."
        ),
        "deployedAsIs": (
            f"Deployed as-is on Robinhood Chain ({sec_per_block:.4f} s blocks), clim's shipped rule would charge its 5 bp floor "
            f"all window ({100.0 * float(np.mean(raw_fee > params.fee_min_pips)):.0f} % of the time above it), below Fables' 7 bp flat fee. "
            "The 12 s and 1 s runs are modelling choices; the right effective block time for a first-come, first-served L2 is unknown."
        ),
        "keeperShape": (
            f"The keeper's fee follows volatility: over {shape['days']:.0f} days under its current config its fee correlates "
            f"{shape['corrFeeRv15']:.2f} with Binance RV15, with a median of {shape['bins'][0]['keeperMedianBp']:.0f} bp below 40 %/yr, "
            f"{shape['bins'][3]['keeperMedianBp']:.1f} bp at 80-100 %/yr and its 60 bp cap above 150 %/yr. It pokes mostly on minute "
            "boundaries from one externally owned account. Its logic is off-chain and unknown; its cap pokes coincided with the CPI "
            "release and came one minute before the FOMC statement, so its cap was in place when each scheduled release hit."
        ),
        "doesNotShow": (
            "Fables LPs' realized losses (not measured), anything about traders' response to fees, or what clim would do on "
            "Robinhood Chain: the clim line is the lab's re-implementation of the desk on Binance-only prices, not CRE output, "
            "and the result rests on two 4 h windows."
        ),
    }

    launch_fact = None
    launch_caveat = (
        f"Launch date: the research note's 2026-08-17 is the registry date. The ETH/USDG pool was initialized at block "
        f"{init_block} ({utc(init_t)})."
    )
    if d["launch"] and d["launch"]["logs"]:
        lg = d["launch"]["logs"][0]
        hook, info = next(iter(d["launch"]["hooks"].items()))
        lt = int(d["launch"]["timestamp"], 16)
        launch_fact = {
            "block": LAUNCH_BLOCK, "timeUtc": utc(lt), "tx": lg["transactionHash"], "poolId": lg["topics"][1],
            "hooks": hook, "hooksContract": info["name"], "sourcify": info["url"],
        }
        launch_caveat = (
            f"Launch date: Fables was live on-chain by {utc(lt)} (PoolManager Initialize at block {LAUNCH_BLOCK}, tx "
            f"{lg['transactionHash']}, hooks {hook} = {info['name']} on Sourcify; earliest per the 2026-10-07 scout scan of PoolManager logs, "
            f"not re-scanned by this script). The research note's 2026-08-17 is the registry date. The ETH/USDG pool was initialized at "
            f"block {init_block} ({utc(init_t)})."
        )
    cb_usdt = usdt.get("coinbaseUsdtUsd1m")
    usdt_text = (
        f"Coinbase USDT-USD 1-minute closes stayed within {cb_usdt['min']:.5f}-{cb_usdt['max']:.5f} (median {cb_usdt['median']:.5f}) "
        if cb_usdt else ""
    )
    imp = usdt["impliedUsdtUsd"]
    caveats = [
        "The Fables fee is measured; clim's fee is a model result. The Fables fee is rebuilt from FeePoked and PoolConfigured "
        f"logs and matches the fee paid by {chk['matched']} of {chk['swaps']} swaps in the window ({B['swapCheck']['matched']} of "
        f"{B['swapCheck']['swaps']} on 2026-09-16). clim's desk did not exist on 2026-09-11 and never ran on Robinhood Chain: the "
        "clim line is the lab's Python re-implementation of the desk (RV15 on Binance-only 1 s ETHUSDT prices, RiskDesk envelope, "
        f"30 s reports, 12 s latency), not CRE output, standing in for the live four-venue median (Coinbase RV15 mean on this window: "
        f"{rv_cb.mean():.1f} %/yr vs Binance {rv_b1s.mean():.1f} %/yr). CRE lists Robinhood Chain as Robinhood Testnet only "
        "(CRE docs as of 2026-09-18, README Roadmap), so neither clim nor CRE runs on Robinhood Chain mainnet today.",
        f"Block time: clim's shipped parameters assume 12 s blocks (Ethereum); Robinhood Chain ran at {sec_per_block:.4f} s per block in "
        f"this window. Deployed as-is on Robinhood Chain, clim would charge its 5 bp floor throughout, below Fables' flat 7 bp: the "
        f"formula leaves the floor only above {floor_pct:.0f} %/yr and the window peaked at {rv_b1s.max():.0f} %/yr "
        f"(mean fee {bp(raw_fee.mean()):.2f} bp). The 12 s and 1 s runs are modelling choices; the right effective block time for a "
        "first-come, first-served L2 is unknown. No row here says clim would protect Fables LPs better.",
        "ARB model limits: myopic, gas-free arbitrageur, fixed blocks, fee charged on the input, full-range-equivalent depth. "
        "The 1.29 to 1.33 observed-to-model ARB ratio (lab/out/summary.json modelSeverityRatio) was measured on 12 s backtests of "
        "Binance data and does not transfer to Robinhood Chain's 0.1 s first-come, first-served blocks. No retail flow and no volume "
        f"response to fees, so a higher fee always lowers ARB: at actual fee levels (keeper {pol12['fablesKeeper']['meanFeeBp']:.1f} bp "
        f"vs clim {pol12['clim']['meanFeeBp']:.1f} bp mean on the 12 s grid) ARB favours the higher fee and cannot say which policy is "
        "better for LPs or traders. Only the equal-average rows (arbChangeVsStaticPct, equalMean, sensitivity) compare the shape of the policies.",
        f"The 2026-09-11 result is driven by one scheduled event: the {EVENTS['cpi']['what']}, per {EVENTS['cpi']['source']}. The keeper's cap poke "
        f"{cap_a['tx']} has block timestamp {hms(cpi_ts)} while clim read {cap_a['climSigmaAnnualPctAtPoke']:.0f} %/yr "
        f"({cap_a['climFeeBpAtPoke']:.2f} bp). Delaying the keeper's pokes by 30 s, or starting the window after 12:30:12, reverses "
        "the sign of the equal-average comparison (sensitivity). On 2026-09-16 the keeper's cap was in place a minute before the "
        "FOMC statement, so at 1 s a 30 s delay does not reverse it (secondWindow.sensitivity). clim's backward-looking 15-minute RV, 30 s reports and 12 s latency "
        "cannot anticipate a scheduled jump: that is a design limit of the rule, not of the data.",
        f"The keeper's logic is off-chain and unknown. We observe only its outputs: pokes from one externally owned account "
        f"({keeper_addr}, eth_getCode = 0x), mostly on minute boundaries, with the TTLs listed in pokesInWindow. Its fee tracks "
        f"volatility (corr {shape['corrFeeRv15']:.2f} with Binance RV15 over {shape['days']:.0f} days, lab/out/fables-windows.json "
        "keeperShape), and its cap pokes coincided with the CPI release and came one minute before the FOMC statement "
        f"({EVENTS['fomc']['source']}). We make no claim about what it targets.",
        f"Robinhood Chain orders transactions first-come, first-served by arrival at the sequencer, with no fee priority ({FCFS_SOURCE}), "
        "so its arbitrage dynamics differ from Ethereum's.",
        "Two 4 h windows, not a statistical result. The ARB model ran on 2026-09-11 and 2026-09-16 only; on the other keeper-live "
        "windows only the fee levels were compared (lab/out/fables-windows.json topWindows).",
        "Fables LPs' realized losses are not measured: no pool-price-vs-CEX analysis was done.",
        f"Pool and price pairs differ: the pool is ETH/USDG, the price is Binance ETHUSDT. On this window {usdt_text}and the implied "
        f"USDT/USD from Coinbase ETH-USD over Binance ETHUSDT minute closes had median {imp['median']:.5f} (range {imp['min']:.5f}-"
        f"{imp['max']:.5f}, close-timing noise included); log returns are unaffected at this level. USDG/USD was not checked.",
        launch_caveat,
        "corrFeeSigma for clim is close to 1 by construction: its fee is a clamped linear function of the sigma it reads, "
        "and the quartiles and correlations use that same sigma (RV15 as the hook reads it). For the keeper it measures how "
        "closely its pokes track that RV15.",
    ]

    rq = d["requests"]
    fomc_minutes = {
        "t": B["tm"].tolist(),
        "sigmaAnnualPct": [100.0 * per_sqrt_s_to_annual(s / 1e9) for s in B["msched"].sigma_e9.tolist()],
        "feeFablesBp": [bp(v) for v in B["keeperM"].tolist()],
        "feeClimBp": [bp(v) for v in B["climM"].tolist()],
    }
    doc = {
        "schema": "clim.lab.fables-compare/1",
        "generatedAt": now_iso(),
        "results": results,
        "events": {k: {**v, "timeUtc": utc(v["ts"])} for k, v in EVENTS.items()},
        "window": {
            "startUtc": utc(WINDOW_START),
            "endUtc": utc(WINDOW_END),
            "startTs": WINDOW_START,
            "endTs": WINDOW_END,
            "startBlock": d["blocks"]["windowStart"],
            "endBlock": d["blocks"]["windowEnd"],
            "meanRv15BinancePctYr": float(rv_b1s.mean()),
            "peakRv15BinancePctYr": float(rv_b1s.max()),
            "peakRv15BinanceAtUtc": utc(int(t_obs[int(rv_b1s.argmax())])),
            "meanRv15CoinbasePctYr": float(rv_cb.mean()),
            "peakRv15CoinbasePctYr": float(rv_cb.max()),
            "meanRv15Binance1mPctYr": main["meanRv15"],
            "whyChosen": why_cpi,
            "rv15Convention": "RV15 at t = sqrt(sum of the 15 squared 1-minute log returns of the 16 minute closes up to t / 900 s), annualized over 365 days; t on minute boundaries in (start, end]",
            "otherTopWindows": other,
        },
        "fables": {
            "chainId": CHAIN_ID,
            "poolId": POOL_ID,
            "pair": "ETH/USDG",
            "hook": HOOK,
            "hookContract": "FablesRampETH (Sourcify full match; rule in src/base/FablesBaseHook.sol _resolveFee, src/FablesRamp.sol _autonomousFee)",
            "poolManager": POOL_MANAGER,
            "keeper": keeper_addr,
            "keeperIsEoa": keeper_is_eoa,
            "keeperCheck": f"sender of all {sum(1 for p in in_win + B['inWin'] if p.tx in d['senders'])} FeePoked transactions in the two windows (eth_getTransactionByHash on {RPC}); eth_getCode of the sender returns 0x",
            "explorer": EXPLORER,
            "poolInitialized": {"block": init_block, "timeUtc": utc(init_t), "tx": init["transactionHash"]},
            "firstFeePoked": {"block": first_poke.block, "timeUtc": utc(first_poke.t), "tx": first_poke.tx},
            "launch": launch_fact,
            "pokeClearedLogs": len(d["clears"]),
            "configs": [
                {"block": c.block, "timeUtc": utc(c.t), "floorPips": c.floor_pips, "flatPips": c.flat_pips, "capPips": c.cap_pips, "tx": c.tx}
                for c in cfgs
            ],
            "rule": (
                "fee = flat; if a poke is live (expiry > block.timestamp): fee = max(pokeFee, floorPips, flat * 5000 / 10000); "
                "fee = min(fee, cap). Pokes apply from their block; events ordered by (block, transactionIndex, logIndex)."
            ),
            "pokeBeforeWindow": {
                "block": pb.block, "timeUtc": utc(pb.t), "feePips": pb.fee_pips, "expiryTs": pb.expiry,
                "expiryUtc": utc(pb.expiry), "liveAtStart": pb.expiry > WINDOW_START, "tx": pb.tx,
            },
            "pokesInWindowCount": len(in_win),
            "pokesInWindow": pokes_json(in_win),
            "capPokes": A["capPokes"],
            "keeperFeeMinuteGrid": keeper_minutes(A),
            "swapCheck": chk,
        },
        "price": {
            "source": "Binance spot ETHUSDT 1s klines (close), forward-filled",
            "span": [utc(PRICE_START), utc(WINDOW_END)],
            "coinbaseCrossCheck": {
                "source": "Coinbase ETH-USD 1-minute candles (close)",
                "meanRv15PctYr": float(rv_cb.mean()),
                "binanceMeanRv15PctYr": float(rv_b1s.mean()),
                "corrRv15": float(np.corrcoef(rv_cb, rv_b1s)[0, 1]),
            },
            "stablecoinCheck": usdt,
            "requests": [r["url"] for r in rq if "binance" in r["url"] or "coinbase" in r["url"]],
        },
        "chainRequests": [f"{r['url']}  [{r['note']}]" for r in rq if "binance" not in r["url"] and "coinbase" not in r["url"]],
        "assumptions": {
            "reportSec": REPORT_SEC,
            "latencySec": LATENCY_SEC,
            "warmupSec": WARMUP_SEC,
            "climParams": "shared/params.json: P* = 0.3, etaE4 25093, sqrtHalfDtE6 2449490 (12 s), 5-150 bp; dt1 run: HookParams.from_pstar(0.3, 1) (sqrtHalfDtE6 707107)",
            "climFablesBounds": "same eta and block time, floor 350 pips (the keeper's effective floor max(100, 700/2)) and cap 6000 pips (Fables' cap)",
            "climLine": "the lab's Python re-implementation of the desk on Binance-only 1 s prices, not CRE output",
            "keeperOnGrid": "keeper_fee_at(block timestamps): the rule evaluated at each model block",
            "keeperDelayed": "sensitivity only: every FeePoked applied `keeperDelaySec` later (clim_lab.fables.delay_pokes)",
            "arbModel": "clim_lab.sim.run_arb: myopic gas-free arbitrageur to the edge of the no-trade band g = -ln(1 - fee) each block; same price path sched.x for every policy",
            "depthUnit": "USD per $1M full-range-equivalent",
            "arbChangeVsStatic": "ARB of the policy vs a static fee at that policy's own time-average (clim_lab.compare.static_fee_equal_time)",
        },
        "minutes": {
            "t": A["tm"].tolist(),
            "ethUsd": [round(float(v), 2) for v in np.exp(series.at(A["tm"]))],
            "sigmaAnnualPct": [100.0 * per_sqrt_s_to_annual(s / 1e9) for s in A["msched"].sigma_e9.tolist()],
            "feeFablesBp": [bp(v) for v in A["keeperM"].tolist()],
            "feeClimBp": [bp(v) for v in A["climM"].tolist()],
            "feeFlatBp": bp(FLAT_PIPS),
            "sigmaNote": "sigma the clim hook would read at t (model): RV15 from Binance 1 s minute closes, 30 s reports, RiskDesk envelope, 12 s latency",
        },
        "runs": {"dt12": strip(dt12), "dt1": strip(dt1)},
        "sensitivity": {
            "note": "Main window. equalMeanDiffPct: ARB of clim rescaled to the keeper's average fee vs the keeper's ARB "
            "(> 0: clim loses more). InFablesBounds: clim clamped to the keeper's effective 3.5-60 bp range before rescaling.",
            "rows": A["sens"],
        },
        "perBlockBreakdown": breakdown,
        "eventConcentration": {
            "note": "Share of the equal-average ARB gap (clim rescaled minus keeper, > 0: clim loses more) that falls "
            "between one minute before and fifteen minutes after the scheduled release",
            "cpi": A["eventConcentration"],
            "fomc": B["eventConcentration"],
        },
        "secondWindow": {
            "label": "2026-09-16 16:50-20:50 UTC (FOMC)",
            "startUtc": utc(FOMC_START),
            "endUtc": utc(FOMC_END),
            "startTs": FOMC_START,
            "endTs": FOMC_END,
            "startBlock": d["blocks"]["fomcStart"],
            "endBlock": d["blocks"]["fomcEnd"],
            "whyChosen": why_fomc,
            "meanRv15BinancePctYr": float(B["rv"].mean()),
            "peakRv15BinancePctYr": float(B["rv"].max()),
            "peakRv15BinanceAtUtc": utc(int(B["tObs"][int(B["rv"].argmax())])),
            "config": f"{B['cfg'].floor_pips}/{B['cfg'].flat_pips}/{B['cfg'].cap_pips}",
            "pokesInWindowCount": len(B["inWin"]),
            "pokesInWindow": pokes_json(B["inWin"]),
            "capPokes": B["capPokes"],
            "keeperFeeMinuteGrid": keeper_minutes(B),
            "swapCheck": B["swapCheck"],
            "runs": {"dt12": strip(b12), "dt1": strip(B["grids"]["dt1"])},
            "sensitivity": B["sens"],
            "perBlockBreakdown": per_block_gap(b12["_paths"], b12["_sched"]),
            "eventConcentration": B["eventConcentration"],
            "minutes": fomc_minutes,
        },
        "rawBlockTime": {
            "secPerBlock": sec_per_block,
            "source": f"(window end - start seconds) / (block {d['blocks']['windowEnd']} - block {d['blocks']['windowStart']}), blocks from Etherscan getblocknobytime",
            "sqrtHalfDtE6": raw.sqrt_half_dt_e6,
            "climFloorBindsBelowPctYr": floor_pct,
            "climMeanFeeBp": bp(raw_fee.mean()),
            "climMaxFeeBp": bp(raw_fee.max()),
            "pctTimeAboveFloor": 100.0 * float(np.mean(raw_fee > params.fee_min_pips)),
            "note": "fee only, no ARB run; sigma path of the 1 s grid. Deployed as-is on Robinhood Chain, clim would charge 5 bp throughout, below Fables' flat 7 bp.",
        },
        "caveats": caveats,
    }
    text = json.dumps(doc)
    if "apikey" in text.lower():
        raise SystemExit("refusing to write: 'apikey' in output")
    if "naive" in text.lower():
        raise SystemExit("refusing to write: banned word in the output (the keeper follows volatility, see keeperShape)")
    write_json(OUT_FILE, doc)

    print(f"swaps {chk['swaps']}, matched {chk['matched']}, mismatches {len(chk['mismatches'])}; fomc {B['swapCheck']['matched']}/{B['swapCheck']['swaps']}")
    print(f"pokes in window {len(in_win)}; keeper {senders} eoa={keeper_is_eoa}")
    for name, run in (("cpi dt12", dt12), ("cpi dt1", dt1), ("fomc dt12", b12)):
        for k, p in run["policies"].items():
            print(
                f"[{name}] {k:17s} mean {p['meanFeeBp']:6.2f} bp  min {p['minFeeBp']:6.2f}  max {p['maxFeeBp']:6.2f}  "
                f"cap% {p['pctTimeAtCap'] if p['pctTimeAtCap'] is not None else float('nan'):5.1f}  "
                f"ARB ${p['arbUsd']:8.2f}  vs static {p['arbChangeVsStaticPct']:+6.1f}%  pTrade {p['pTrade']:.3f}"
            )
        e = run["equalMean"]
        print(f"[{name}] equal mean: kE4 {e['kE4']}  ARB keeper ${e['arbKeeperUsd']:.2f} clim ${e['arbClimUsd']:.2f} ({e['diffPct']:+.1f}%), in Fables bounds {e['inFablesBounds']['diffPct']:+.1f}%")
    for r in A["sens"] + B["sens"]:
        print(f"  sens {r['startUtc']} dt{r['blockSec']:<2} delay {r['keeperDelaySec']:>2}s  keeper {r['keeperMeanFeeBp']:5.2f} vsStatic {r['keeperArbVsStaticPct']:+6.1f}%  clim {r['climMeanFeeBp']:5.2f} vsStatic {r['climArbVsStaticPct']:+6.1f}%  equal-mean {r['equalMeanDiffPct']:+6.1f}%  in bounds {r['equalMeanInFablesBoundsDiffPct']:+6.1f}%  {r['label']}")
    print(f"per-block: total gap ${breakdown['totalGapUsd']:.2f}; top {breakdown['topBlocks'][0]}")
    print(f"raw block time {sec_per_block:.4f} s: floor binds below {floor_pct:.0f} %/yr, clim mean {bp(raw_fee.mean()):.2f} bp")
    print(f"wrote {OUT_FILE}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("cmd", choices=["fetch", "run"])
    ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA)
    ap.add_argument("--only-launch", action="store_true", help="fetch: only the launch-block check")
    ap.add_argument("--refresh", action="store_true", help="fetch: re-download files already in the data dir")
    a = ap.parse_args()
    return cmd_fetch(a.data_dir, a.only_launch, a.refresh) if a.cmd == "fetch" else cmd_run(a.data_dir)


if __name__ == "__main__":
    sys.exit(main())
