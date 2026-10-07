"""Fables' keeper fee during clim's 7 October 2026 live storm, for the app's /replay page.

    uv run python scripts/fables_storm.py fetch   # network, read-only: the window's Swap logs and poke senders
    uv run python scripts/fables_storm.py run     # offline: lab/out/fables-storm-2026-10-07.json

The window is the app's LATEST_STORM_WINDOW (app/src/lib/storm.ts), 01:40 to 03:10 UTC on 7 October 2026.
FeePoked and PoolConfigured logs come from fables_compare.py's cache in lab/data/fables (fetched to 08:38 UTC
on 7 October, after the window); fetch adds the window's Swap logs on Fables' ETH/USDG pool and the sender of
each poke, through fables_compare.py's Net (Etherscan V2 on Robinhood Chain, chainid 4663; the key is never
printed). No transaction is sent. run rebuilds the fee Fables' hook resolved from the keeper's pokes
(clim_lab.fables.keeper_fee_at, the FablesRamp rule) and checks it against the fee every swap paid.
"""

import argparse
import calendar
import json
import sys

import numpy as np

import fables_compare as fc
from clim_lab import fables as fb
from clim_lab.report import now_iso, write_json

START = calendar.timegm((2026, 10, 7, 1, 40, 0))  # LATEST_STORM_WINDOW in app/src/lib/storm.ts
END = calendar.timegm((2026, 10, 7, 3, 10, 0))
SWAPS_FILE = "swaps_2026-10-07.json"
OUT_FILE = fc.OUT_DIR / "fables-storm-2026-10-07.json"


def load(name: str):
    return json.loads((fc.DEFAULT_DATA / name).read_text())


def pool_rows(rows: list[dict]) -> list[dict]:
    return [r for r in rows if r["topics"][1].lower() == fc.POOL_ID]


def pokes_and_configs():
    pokes = fb.sorted_events([fb.decode_feepoked(r) for r in pool_rows(load("feepoked.json"))])
    cfgs = fb.sorted_events([fb.decode_poolconfigured(r) for r in pool_rows(load("poolconfigured.json"))])
    clears = np.array(sorted(fb.hex_int(r["timeStamp"]) for r in pool_rows(load("pokecleared.json"))), dtype=np.int64)
    if not pokes or pokes[-1].t < END:
        raise SystemExit("the cached FeePoked logs end before the window; run fables_compare.py fetch --refresh")
    return pokes, cfgs, clears


def cmd_fetch() -> int:
    net = fc.Net(fc.DEFAULT_DATA)
    path = fc.DEFAULT_DATA / SWAPS_FILE
    if not path.exists():
        b0 = net.block_by_time(START, "after")
        b1 = net.block_by_time(END, "before")
        swaps = net.logs(fc.POOL_MANAGER, fb.SWAP_TOPIC, fc.POOL_ID, b0, b1, "Fables ETH/USDG swaps, 7 Oct storm")
        path.write_text(json.dumps({"fromBlock": b0, "toBlock": b1, "logs": swaps}))
        print(f"swaps: {len(swaps)} logs in blocks {b0}..{b1}")
    pokes, _, _ = pokes_and_configs()
    senders_path = fc.DEFAULT_DATA / "poke_senders.json"
    senders = json.loads(senders_path.read_text()) if senders_path.exists() else {}
    for p in pokes:
        if START <= p.t <= END and p.tx not in senders:
            tx = net.rpc("eth_getTransactionByHash", [p.tx], f"poke sender {p.tx[:10]}")
            senders[p.tx] = tx["from"].lower()
    senders_path.write_text(json.dumps(senders))
    print("senders: ok")
    return 0


def cmd_run() -> int:
    pokes, cfgs, clears = pokes_and_configs()
    in_win = [p for p in pokes if START <= p.t <= END]
    senders = load("poke_senders.json")
    keepers = sorted({senders[p.tx] for p in in_win})
    cfg = fc.cfg_at(cfgs, START)

    # the fee the hook resolves: at the window's start, then after each poke (a poke applies from its own second)
    times = np.array([START] + [p.t for p in in_win], dtype=np.int64)
    fees = fb.keeper_fee_at(times, pokes, cfgs, clears)
    steps = [{"t": int(times[0]), "feePips": int(fees[0])}]
    for t, f in zip(times[1:], fees[1:]):
        if int(f) != steps[-1]["feePips"]:
            steps.append({"t": int(t), "feePips": int(f)})

    doc = load(SWAPS_FILE)
    swaps = fb.sorted_events([fb.decode_swap_fee(r) for r in doc["logs"]])
    swaps = [s for s in swaps if START <= s.t <= END]
    expected = fb.keeper_fee_at(
        np.array([s.t for s in swaps], dtype=np.int64), pokes, cfgs, clears, query_keys=np.array([s.key for s in swaps], dtype=np.int64)
    )
    paid = np.array([s.fee_pips for s in swaps], dtype=np.int64)
    top = max(swaps, key=lambda s: (s.fee_pips, -s.key)) if swaps else None

    out = {
        "generatedAt": now_iso(),
        "source": "lab/scripts/fables_storm.py",
        "chain": "Robinhood Chain",
        "chainId": fc.CHAIN_ID,
        "explorer": fc.EXPLORER,
        "hook": fc.HOOK,
        "poolId": fc.POOL_ID,
        "pair": "ETH/USDG",
        "window": {"start": START, "end": END},
        "config": {"floorPips": cfg.floor_pips, "flatPips": cfg.flat_pips, "capPips": cfg.cap_pips},
        "pokeTtlSec": int(np.median([p.expiry - p.t for p in in_win])) if in_win else None,
        "keepers": keepers,
        "pokes": [{"t": p.t, "feePips": p.fee_pips, "expiry": p.expiry, "tx": p.tx} for p in in_win],
        "steps": steps,
        "swaps": {
            "n": len(swaps),
            "minPips": int(paid.min()) if len(paid) else None,
            "maxPips": int(paid.max()) if len(paid) else None,
            "aboveFlat": int((paid > cfg.flat_pips).sum()),
            "matchKeeperRule": int((paid == expected).sum()),
            "top": {"t": top.t, "feePips": top.fee_pips, "tx": top.tx} if top else None,
        },
    }
    write_json(OUT_FILE, out)
    print(
        f"pokes {len(in_win)} from {keepers}; fee {min(s['feePips'] for s in steps)}..{max(s['feePips'] for s in steps)} pips; "
        f"swaps {len(swaps)}, {out['swaps']['matchKeeperRule']} match the rule, paid {out['swaps']['minPips']}..{out['swaps']['maxPips']}"
    )
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("cmd", choices=["fetch", "run"])
    a = ap.parse_args()
    return cmd_fetch() if a.cmd == "fetch" else cmd_run()


if __name__ == "__main__":
    sys.exit(main())
