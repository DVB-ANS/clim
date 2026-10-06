"""Draws docs/media/fee-follows-weather.png from lab/out/replay-2026-02-04.json.

Usage: python figures/fee_figure.py <replay.json> <out.png>
"""
import json
import sys
from datetime import datetime, timezone

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

SKY = "#1C7ED6"
AMBER = "#E8890C"
GREY = "#8A94A6"
INK = "#1B2433"


def make_fee_figure(replay: dict, out_path: str) -> None:
    points = replay["points"]
    times = [datetime.fromtimestamp(p["t"], tz=timezone.utc) for p in points]
    fig, (top, bottom) = plt.subplots(
        2, 1, sharex=True, figsize=(8, 4.5), dpi=200, gridspec_kw={"height_ratios": [1, 1.2]}
    )
    fig.patch.set_facecolor("white")

    top.plot(times, [p["sigmaAnnualPct"] for p in points], color=SKY, linewidth=1.6)
    top.set_ylabel("ETH volatility\n(% per year)", color=INK, fontsize=9)
    top.set_title(
        "4 February 2026: the storm arrives, the fee follows",
        loc="left", color=INK, fontsize=11, fontweight="bold",
    )

    bottom.step(times, [p["feeVBp"] for p in points], where="post", color=AMBER, linewidth=1.8, label="clim pool (fee follows volatility)")
    bottom.step(times, [p["feeSBp"] for p in points], where="post", color=GREY, linewidth=1.4, linestyle="--", label="fixed-fee pool, same average fee")
    bottom.set_ylabel("LP fee (bp)", color=INK, fontsize=9)
    bottom.legend(loc="upper left", fontsize=8, frameon=False)
    bottom.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M", tz=timezone.utc))
    bottom.set_xlabel("UTC", color=INK, fontsize=9)

    for ax in (top, bottom):
        ax.grid(axis="y", color="#E3E7EE", linewidth=0.8)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        ax.tick_params(colors=INK, labelsize=8)

    fig.tight_layout()
    fig.savefig(out_path, facecolor="white")
    plt.close(fig)


if __name__ == "__main__":
    with open(sys.argv[1]) as f:
        make_fee_figure(json.load(f), sys.argv[2])
    print(f"wrote {sys.argv[2]}")
