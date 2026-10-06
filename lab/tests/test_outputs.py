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


def test_backtest_summary_json_plan06_shape():
    d = _load(OUT_DIR / "backtest-summary.json")
    assert d["schema"] == "clim.lab.backtest/1"
    plan06 = ["schema", "generatedAt", "pStar", "feeMinBp", "periods", "replayWindows", "lpGainPctPerYear"]
    plan06 += ["inPoolVolGainSharePct"]
    details = [
        "params",
        "feeCurve",
        "samples",
        "inPool",
        "volatileAsset",
        "bridgeCheck",
        "pStar10Check",
        "yearAttribution",
    ]
    _keys(d, plan06 + details + ["replayWindowsMedianPct", "replayWindowsBetterCount"])
    assert [p["id"] for p in d["periods"]] == ["feb-2026", "oct-2026", "year"]
    assert 0 <= d["replayWindowsBetterCount"] <= len(d["replayWindows"])
    _keys(
        d["periods"][0],
        ["id", "label", "source", "blocks", "equalTimeAvgFee", "equalTraderCost", "pTrade", "arbOverLvr"],
    )
    _keys(d["periods"][0]["equalTimeAvgFee"], ["staticFeeBp", "dynMeanFeeBp", "arbChangePct"])
    _keys(d["periods"][0]["equalTraderCost"], ["staticFeeBp", "dynVolWeightedFeeBp", "arbChangePct"])
    _keys(d["periods"][0]["pTrade"], ["observed", "predicted"])
    _keys(d["periods"][0]["arbOverLvr"], ["observed", "model"])
    _keys(d["replayWindows"][0], ["id", "label", "arbChangePct"])
    _keys(d["lpGainPctPerYear"], ["low", "high", "note", "volatileAssetHigh", "top5WeeksSharePct"])
    _keys(d["inPoolVolGainSharePct"], ["low", "high"])
    _keys(d["feeCurve"][0], ["sigmaAnnualPct", "feePips", "feeBp"])
    assert [s["name"] for s in d["samples"]] == ["feb", "oct", "year"]
    _keys(d["samples"][0]["equalTimeAverage"], ["staticFeeBp", "arbDynamicBpYr", "arbStaticBpYr", "arbChangePct"])
    _keys(
        d["samples"][0]["lp"][0],
        [
            "policy",
            "meanFeeBp",
            "retailShare",
            "retailFeesBpYr",
            "retailMarkoutBpYr",
            "arbBpYr",
            "arbFeesBpYr",
            "lvrBpYr",
            "lpPnlBpYr",
        ],
    )
    _keys(d["inPool"][0], ["name", "deskGainBpYr", "inPoolGainBpYr", "inPoolMeanFeeBp", "sharePct"])
    _keys(
        d["volatileAsset"], ["volScale", "retailOrdersPerBlock", "lpPnlBpYrClim", "lpPnlBpYrStatic5", "gainPctPerYear"]
    )


def test_summary_json_plan05_shape():
    d = _load(OUT_DIR / "summary.json")
    _keys(
        d,
        [
            "schema",
            "generatedAt",
            "setting",
            "comparisons",
            "pTrade",
            "replay",
            "lpGain",
            "modelSeverityRatio",
            "inPoolVolGainSharePct",
        ],
    )
    _keys(d["setting"], ["pStar", "feeMinPips"])
    _keys(d["comparisons"], ["equalAvgFee", "equalTraderCost"])
    _keys(d["comparisons"]["equalAvgFee"][0], ["period", "arbChangePct"])
    _keys(d["pTrade"][0], ["period", "predicted", "observed", "blocks"])
    _keys(
        d["replay"],
        [
            "window",
            "sigmaMinPct",
            "sigmaMaxPct",
            "feeVMinBp",
            "feeVMaxBp",
            "feeSBp",
            "arbChangePct",
            "arbChangeRangePct",
            "windowsMedianPct",
            "windowsBetterCount",
            "windowsCount",
            "windowsBeatingChosenCount",
            "pTradePredicted",
            "pTradeObserved",
        ],
    )
    assert 0 <= d["replay"]["windowsBeatingChosenCount"] <= d["replay"]["windowsCount"]
    _keys(d["lpGain"], ["fullRangeEthPctPerYear", "volatileAssetPctPerYearMax", "shareFromTop5WeeksPct"])
    for pair in (d["replay"]["arbChangeRangePct"], d["lpGain"]["fullRangeEthPctPerYear"], d["modelSeverityRatio"]):
        assert len(pair) == 2 and pair[0] <= pair[1]
    assert len(d["inPoolVolGainSharePct"]) == 2
