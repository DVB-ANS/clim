"""Replay window on the real Feb file (skipped when lab/data is absent)."""

import pytest

from clim_lab.data import DATA_DIR, load_window
from clim_lab.fee import HookParams
from clim_lab.replay import replay_points, replay_window, static_fee_pips

pytestmark = pytest.mark.skipif(not (DATA_DIR / "b1s_feb.csv").exists(), reason="lab/data not present")


def test_replay_points():
    series, dvol = load_window("feb")
    params = HookParams.from_pstar(0.3)
    points, summary = replay_points(series, dvol, params)
    assert len(points) == 480 and summary["blocks"] == 1_200
    assert points[0]["t"] == 1_770_206_400 and points[-1]["t"] == 1_770_220_770
    assert summary["staticFeePips"] == static_fee_pips(series, params) == round(100 * summary["meanFeeSBp"])
    assert summary["minFeeVBp"] == 5.0 and summary["arbChangePct"] < 0
    assert points[-1]["cumArbV"] == summary["arbV"] and points[0]["feePips"] == round(100 * points[0]["feeVBp"])


def test_replay_window_matches_plan_04_contract():
    series, _ = load_window("feb")
    w = replay_window(series)
    assert (w["symbol"], w["startTs"], w["stepSec"], w["warmupSec"]) == ("ETHUSDT", 1_770_204_600, 1, 1_800)
    assert len(w["closes"]) == 16_200 and w["startTs"] % 60 == 0
    assert w["closes"][1_800] == 2255.18  # 2026-02-04 12:00:00 UTC, the first replay point
    assert min(w["closes"]) > 0
