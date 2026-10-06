"""Contract tests for lab/out/*.json and shared/params.json, the files contracts/, cre/, bots/ and app/ read."""

import json

from clim_lab.data import OUT_DIR, SHARED_DIR


def _load(path):
    assert path.exists(), f"{path} is missing: run the lab script that writes it"
    return json.loads(path.read_text())


def _keys(obj, expected):
    assert set(obj) == set(expected), sorted(set(obj) ^ set(expected))


def test_params_json():
    p = _load(SHARED_DIR / "params.json")
    _keys(
        p,
        [
            "pStar",
            "etaE4",
            "sqrtHalfDtE6",
            "feeMinPips",
            "feeMaxPips",
            "feeSafePips",
            "tauKillSec",
            "staticFeePips",
            "replayStaticFeePips",
            "decidedBy",
            "decidedAt",
        ],
    )
    assert p["pStar"] in (0.2, 0.3)
    assert p["etaE4"] == {0.2: 41_760, 0.3: 25_093}[p["pStar"]]
    assert (p["sqrtHalfDtE6"], p["feeMinPips"], p["feeMaxPips"], p["feeSafePips"], p["tauKillSec"]) == (
        2_449_490,
        500,
        15_000,
        3_000,
        180,
    )
    assert 0 < p["staticFeePips"] != p["replayStaticFeePips"] > 0
    assert p["decidedBy"].startswith("lab/scripts/decide_pstar.py") and p["decidedAt"].endswith("Z")


def test_pstar_decision_json():
    d = _load(OUT_DIR / "pstar_decision.json")
    _keys(
        d,
        [
            "schema",
            "generatedAt",
            "candidates",
            "chosen",
            "rule",
            "reason",
            "market",
            "scenarios",
            "policies",
            "results",
            "year",
            "twinPools",
        ],
    )
    assert d["schema"] == "clim.lab.pstar_decision/1"
    _keys(
        d["market"],
        [
            "tvlClimUsd",
            "tvlCompetitorUsd",
            "competitorFeePips",
            "retailMedianUsd",
            "retailLogSd",
            "stickyShare",
            "seed",
            "retailOrdersPerBlock",
            "calibration",
        ],
    )
    assert len(d["results"]) == 3 * 5 * 4
    _keys(
        d["results"][0],
        [
            "sample",
            "scenario",
            "policy",
            "pStar",
            "meanFeeBp",
            "retailShare",
            "retailFeesBpYr",
            "retailMarkoutBpYr",
            "arbBpYr",
            "arbFeesBpYr",
            "lvrBpYr",
            "lpPnlBpYr",
            "pTradeObserved",
        ],
    )
    _keys(d["year"], ["blocks", "start", "end", "attribution", "monthsP20BeatsP30", "months", "sensitivity"])
    _keys(
        d["year"]["attribution"]["clim_p30"],
        ["gainVsStatic5BpYr", "shareOfGainTop5TurbulentWeeks", "weeksWithGain", "weeks"],
    )
    _keys(d["year"]["sensitivity"][0], ["variant", "retailOrdersPerBlock", "lpPnlBpYrP20", "lpPnlBpYrP30", "better"])
    _keys(d["twinPools"], ["liveStaticFeePips", "replayStaticFeePips", "note"])
    params = _load(SHARED_DIR / "params.json")
    assert d["chosen"] == params["pStar"]
    assert (d["twinPools"]["liveStaticFeePips"], d["twinPools"]["replayStaticFeePips"]) == (
        params["staticFeePips"],
        params["replayStaticFeePips"],
    )
