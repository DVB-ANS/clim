"""Fables keeper fee rule (clim_lab.fables) and the output contract of lab/out/fables-compare.json."""

import json
import os
from pathlib import Path

import numpy as np
import pytest

from clim_lab import fables as fb
from clim_lab.data import DATA_DIR, OUT_DIR

POOL = "0xbac3aa3b91584a53a579b3c999a56756e954e59247e497bad1d25a4334bde551"


def _w(*vals: int) -> str:
    return "0x" + "".join(f"{v:064x}" for v in vals)


def _log(topic: str, data: str, t: int, block: int, txi: int = 0, li: str = "0x", tx: str = "0xabc") -> dict:
    return {
        "topics": [topic, POOL],
        "data": data,
        "timeStamp": hex(t),
        "blockNumber": hex(block),
        "transactionIndex": hex(txi),
        "logIndex": li,
        "transactionHash": tx,
    }


def _cfg(t, floor, flat, cap, block=1):
    return fb.decode_poolconfigured(_log(fb.POOL_CONFIGURED_TOPIC, _w(floor, flat, cap), t, block))


def _poke(t, fee, expiry, block=10, txi=0):
    return fb.decode_feepoked(_log(fb.FEE_POKED_TOPIC, _w(fee, expiry), t, block, txi))


def test_decode_words():
    p = _poke(1000, 1137, 8200, block=77, txi=3)
    assert (p.t, p.block, p.tx_index, p.log_index, p.fee_pips, p.expiry) == (1000, 77, 3, 0, 1137, 8200)
    c = _cfg(5, 100, 700, 6000)
    assert (c.floor_pips, c.flat_pips, c.cap_pips) == (100, 700, 6000)
    neg = (1 << 256) - 5  # int128 amounts are sign-extended words; only the last word (fee) matters
    s = fb.decode_swap_fee(_log(fb.SWAP_TOPIC, _w(neg, 3, 7, 9, neg, 700), 9, 9, 1, "0x1c"))
    assert (s.fee_pips, s.log_index) == (700, 0x1C)
    with pytest.raises(ValueError):
        fb.decode_feepoked(_log(fb.SWAP_TOPIC, _w(1, 2), 1, 1))


def test_no_poke_gives_flat():
    fee = fb.keeper_fee_at(np.array([10, 20]), [], [_cfg(0, 100, 700, 6000)])
    assert fee.tolist() == [700, 700]


def test_live_poke_gives_poke_fee_and_expiry_is_strict():
    cfg = [_cfg(0, 100, 700, 6000)]
    pk = [_poke(100, 2500, 200)]
    fee = fb.keeper_fee_at(np.array([99, 100, 150, 199, 200, 300]), pk, cfg)
    # before the poke: flat; live while expiry > t; expiry == t is flat again
    assert fee.tolist() == [700, 2500, 2500, 2500, 700, 700]


def test_poke_below_half_flat_is_floored():
    cfg = [_cfg(0, 100, 700, 6000)]
    assert fb.keeper_fee_at(np.array([150]), [_poke(100, 300, 1000)], cfg).tolist() == [350]
    cfg_hi_floor = [_cfg(0, 400, 700, 6000)]
    assert fb.keeper_fee_at(np.array([150]), [_poke(100, 300, 1000)], cfg_hi_floor).tolist() == [400]


def test_poke_above_cap_gives_cap():
    cfg = [_cfg(0, 100, 450, 3000)]
    assert fb.keeper_fee_at(np.array([150]), [_poke(100, 5000, 1000)], cfg).tolist() == [3000]


def test_config_switch_uses_latest_config():
    cfgs = [_cfg(0, 100, 450, 3000, block=1), _cfg(500, 100, 700, 6000, block=50)]
    pk = [_poke(100, 5000, 10_000, block=10)]
    fee = fb.keeper_fee_at(np.array([200, 499, 500, 600]), pk, cfgs)
    assert fee.tolist() == [3000, 3000, 5000, 5000]
    assert fb.keeper_fee_at(np.array([20_000]), pk, cfgs).tolist() == [700]


def test_chain_order_within_a_block():
    cfg = [_cfg(0, 100, 700, 6000, block=1)]
    pk = [_poke(100, 1200, 9000, block=10, txi=5)]
    keys = np.array([fb.order_key(10, 2), fb.order_key(10, 7)])
    fee = fb.keeper_fee_at(np.array([100, 100]), pk, cfg, query_keys=keys)
    assert fee.tolist() == [700, 1200]


def test_poke_cleared():
    cfg = [_cfg(0, 100, 700, 6000)]
    fee = fb.keeper_fee_at(np.array([150, 250, 350]), [_poke(100, 2000, 9000)], cfg, clears_t=np.array([200]))
    assert fee.tolist() == [2000, 700, 700]


def test_delay_pokes_shifts_time_and_expiry():
    cfg = [_cfg(0, 100, 700, 6000)]
    pk = [_poke(100, 2500, 200)]
    late = fb.delay_pokes(pk, 30)
    assert (late[0].t, late[0].expiry, late[0].fee_pips) == (130, 230, 2500)
    fee = fb.keeper_fee_at(np.array([100, 129, 130, 229, 230]), late, cfg)
    assert fee.tolist() == [700, 700, 2500, 2500, 700]
    assert fb.delay_pokes(pk, 0) == pk


def test_sample_on_blocks_side_right():
    change_t = np.array([0, 60, 120])
    vals = np.array([1, 2, 3])
    assert fb.sample_on_blocks(change_t, vals, np.array([0, 59, 60, 61, 120, 999])).tolist() == [1, 1, 2, 2, 3, 3]
    with pytest.raises(ValueError):
        fb.sample_on_blocks(change_t, vals, np.array([-1]))


def test_hex_int_reads_empty_as_zero():
    assert fb.hex_int("0x") == 0 and fb.hex_int("0x1c") == 28


# ---- regression on the real logs (skipped without the cached raw data) ----

FABLES_DATA = Path(os.environ.get("CLIM_FABLES_DATA", str(DATA_DIR / "fables")))
needs_data = pytest.mark.skipif(not (FABLES_DATA / "feepoked.json").exists(), reason="Fables raw logs not present")


def _fc():
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    import fables_compare as fc

    return fc


@needs_data
def test_real_swaps_match_rebuilt_fee():
    fc = _fc()
    d = fc.load_cache(FABLES_DATA)
    for key, swaps in d["swapsByWindow"].items():
        chk = fc.swap_check(d, swaps)
        assert chk["swaps"] > 0, key
        assert chk["matched"] / chk["swaps"] >= 0.999, key


@needs_data
def test_real_keeper_window_mean():
    fc = _fc()
    d = fc.load_cache(FABLES_DATA)
    t = np.arange(fc.WINDOW_START, fc.WINDOW_END, 60)
    fee = fb.keeper_fee_at(t, d["pokes"], d["configs"])
    assert abs(fee.mean() / 100 - 43.7) < 1.0


# ---- output contract ----

OUT = OUT_DIR / "fables-compare.json"
needs_out = pytest.mark.skipif(not OUT.exists(), reason="lab/out/fables-compare.json not generated")


@needs_out
def test_output_contract():
    text = OUT.read_text()
    assert "apikey" not in text.lower()
    doc = json.loads(text)
    assert doc["schema"] == "clim.lab.fables-compare/1"
    for k in ("generatedAt", "window", "fables", "price", "assumptions", "minutes", "runs", "rawBlockTime", "caveats"):
        assert k in doc
    m = doc["minutes"]
    n = len(m["t"])
    assert n > 0
    for k in ("ethUsd", "sigmaAnnualPct", "feeFablesBp", "feeClimBp"):
        assert len(m[k]) == n
    assert all(3.5 <= f <= 60.0 for f in m["feeFablesBp"])
    assert all(5.0 <= f <= 150.0 for f in m["feeClimBp"])
    assert m["feeFlatBp"] == 7.0
    pol_keys = {
        "meanFeeBp", "minFeeBp", "maxFeeBp", "pctTimeAtCap", "meanFeeTopQuartileSigmaBp",
        "meanFeeBottomQuartileSigmaBp", "corrFeeSigma", "arbUsd", "arbFeesUsd", "pTrade",
        "staticSameMeanBp", "arbChangeVsStaticPct",
    }
    for run in ("dt12", "dt1"):
        r = doc["runs"][run]
        assert set(r["policies"]) == {"fablesKeeper", "clim", "climFablesBounds", "flat7"}
        for p in r["policies"].values():
            assert pol_keys <= set(p)
        k = r["policies"]["fablesKeeper"]
        assert 3.5 <= k["minFeeBp"] <= k["maxFeeBp"] <= 60.0
        c = r["policies"]["clim"]
        assert 5.0 <= c["minFeeBp"] <= c["maxFeeBp"] <= 150.0
        assert {"kE4", "meanFeeBp", "arbKeeperUsd", "arbClimUsd", "diffPct"} <= set(r["equalMean"])
    sc = doc["fables"]["swapCheck"]
    assert sc["swaps"] > 0 and sc["matched"] / sc["swaps"] >= 0.999
    assert "past blocks are not available" in sc["method"]


@needs_out
def test_output_states_results_and_caveats():
    text = OUT.read_text()
    assert "naive" not in text.lower()
    doc = json.loads(text)
    res = doc["results"]
    for k in ("headline", "measured", "equalAverageFee", "whatDrivesIt", "sensitivity", "secondWindow", "deployedAsIs", "keeperShape", "doesNotShow"):
        assert isinstance(res[k], str) and res[k], k
    assert "CPI" in res["headline"]
    assert doc["events"]["cpi"]["ts"] == doc["window"]["startTs"]
    assert "fables-windows.json" in doc["window"]["whyChosen"]
    caveats = " ".join(doc["caveats"])
    for needle in ("not CRE output", "Testnet only", "USDG/USD was not checked", "docs.robinhood.com/chain",
                   "does not transfer", "5 bp floor", "Coinbase USDT-USD"):
        assert needle in caveats, needle
    assert doc["fables"]["keeperIsEoa"] is True


@needs_out
def test_output_sensitivity_and_second_window():
    doc = json.loads(OUT.read_text())
    rows = doc["sensitivity"]["rows"]
    keys = {"label", "blockSec", "startUtc", "keeperDelaySec", "windowIncludesEvent", "keeperMeanFeeBp", "climMeanFeeBp",
            "equalMeanDiffPct", "equalMeanInFablesBoundsDiffPct", "kE4", "kE4InFablesBounds"}
    assert all(keys <= set(r) for r in rows)
    base = next(r for r in rows if r["label"] == "as measured" and r["blockSec"] == 12)
    assert base["equalMeanDiffPct"] == pytest.approx(doc["runs"]["dt12"]["equalMean"]["diffPct"], rel=1e-6)
    assert any(r["keeperDelaySec"] == 30 for r in rows) and any(not r["windowIncludesEvent"] for r in rows)
    assert {"totalGapUsd", "topBlocks"} <= set(doc["perBlockBreakdown"])
    w2 = doc["secondWindow"]
    assert w2["startUtc"] == "2026-09-16T16:50:00Z" and w2["endUtc"] == "2026-09-16T20:50:00Z"
    assert w2["swapCheck"]["swaps"] > 0 and w2["swapCheck"]["matched"] / w2["swapCheck"]["swaps"] >= 0.999
    pol = w2["runs"]["dt12"]["policies"]
    assert set(pol) == {"fablesKeeper", "clim", "climFablesBounds", "flat7"}
    assert len(w2["minutes"]["t"]) == len(w2["minutes"]["feeFablesBp"]) == len(w2["minutes"]["feeClimBp"])
    assert all(3.5 <= f <= 60.0 for f in w2["minutes"]["feeFablesBp"])


WINDOWS_OUT = OUT_DIR / "fables-windows.json"
needs_windows = pytest.mark.skipif(not WINDOWS_OUT.exists(), reason="lab/out/fables-windows.json not generated")


@needs_windows
def test_window_scan_contract():
    doc = json.loads(WINDOWS_OUT.read_text())
    assert doc["schema"] == "clim.lab.fables-windows/1"
    top = doc["topWindows"]
    means = [w["meanRv15"] for w in top]
    assert means == sorted(means, reverse=True)
    for i, a in enumerate(top):
        assert a["endTs"] - a["startTs"] == 240 * 60
        for b in top[i + 1 :]:
            assert a["endTs"] <= b["startTs"] or b["endTs"] <= a["startTs"]
    fc = _fc()
    assert [(w["startTs"], w["endTs"]) for w in top[:5]] == [(w["start"], w["end"]) for w in fc.TOP_WINDOWS]
    cpi = next(w for w in top if w["startTs"] == fc.WINDOW_START)
    assert cpi["state"] == "keeperLive" and cpi["keeperLiveRank"] == 1
    # the scan's argmax starts at 16:49; the study uses 16:50-20:50 (one minute later, same storm)
    assert any(abs(w["startTs"] - fc.FOMC_START) <= 120 and w["state"] == "keeperLive" for w in top)
    shape = doc["keeperShape"]
    assert shape["corrFeeRv15"] > 0.5 and shape["days"] > 20


@needs_out
def test_fables_figure_is_1600x900(tmp_path):
    pytest.importorskip("matplotlib")
    image = pytest.importorskip("PIL.Image")
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    from fables_figure import make_fables_figure

    out = tmp_path / "fables.png"
    make_fables_figure(json.loads(OUT.read_text()), str(out))
    assert image.open(out).size == (1600, 900)
