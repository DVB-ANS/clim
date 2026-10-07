"""Draws docs/media/fables-compare.png from lab/out/fables-compare.json (style of docs/submission/figures/fee_figure.py).

    uv run --with "matplotlib>=3.9,<3.11" python scripts/fables_figure.py [in.json] [out.png]
"""

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

SKY = "#1C7ED6"
AMBER = "#E8890C"
GREY = "#8A94A6"
INK = "#1B2433"
INK2 = "#4A5568"  # secondary text

LAB = Path(__file__).resolve().parent.parent
DEFAULT_IN = LAB / "out" / "fables-compare.json"
DEFAULT_OUT = LAB.parent / "docs" / "media" / "fables-compare.png"

TITLE = "11 Sep 2026, 12:30-16:30 UTC: Fables keeper fee (on-chain, ETH/USDG, Robinhood Chain) vs clim's rule (model)"


def _short(addr: str) -> str:
    return f"{addr[:6]}…{addr[-4:]}"


def make_fables_figure(doc: dict, out_path: str) -> None:
    m = doc["minutes"]
    times = [datetime.fromtimestamp(t, tz=timezone.utc) for t in m["t"]]
    start = datetime.fromtimestamp(doc["window"]["startTs"], tz=timezone.utc)
    end = datetime.fromtimestamp(doc["window"]["endTs"], tz=timezone.utc)
    xs = times + [end]
    cpi = datetime.fromtimestamp(doc["events"]["cpi"]["ts"], tz=timezone.utc)

    def ext(v):  # repeat the last value so the steps reach the window end
        return list(v) + [v[-1]]

    fig, (top, bottom) = plt.subplots(
        2, 1, sharex=True, figsize=(8, 4.5), dpi=200, gridspec_kw={"height_ratios": [1, 1.55]}
    )
    fig.patch.set_facecolor("white")
    fig.text(0.012, 0.975, TITLE, color=INK, fontsize=8.3, fontweight="bold", ha="left", va="top")

    top.plot(times, m["sigmaAnnualPct"], color=SKY, linewidth=1.5)
    top.set_title("Binance RV15 as clim's hook would read it (model)", loc="left", color=INK, fontsize=7.5, pad=3)
    top.set_ylabel("% per year", color=INK, fontsize=7.5)
    top.set_ylim(0, max(m["sigmaAnnualPct"]) * 1.3)

    keeper = ext(m["feeFablesBp"])
    clim = ext(m["feeClimBp"])
    p12 = doc["runs"]["dt12"]["policies"]
    cap_bp = max(c["capPips"] for c in doc["fables"]["configs"] if c["block"] <= doc["window"]["startBlock"]) / 100
    floor_raw = doc["rawBlockTime"]
    bottom.step(xs, keeper, where="post", color=INK, linewidth=1.5,
                label=f"Fables keeper fee, on-chain (mean {p12['fablesKeeper']['meanFeeBp']:.1f} bp)")
    bottom.step(xs, clim, where="post", color=AMBER, linewidth=1.7,
                label=f"clim rule, model, dt = 12 s (Ethereum block time), mean {p12['clim']['meanFeeBp']:.1f} bp")
    bottom.plot([start, end], [floor_raw["climMeanFeeBp"]] * 2, color=AMBER, linewidth=0.9, linestyle=(0, (1, 1.5)),
                label=f"clim rule at Robinhood Chain's {floor_raw['secPerBlock']:.2f} s blocks: 5 bp floor all window")
    bottom.plot([start, end], [m["feeFlatBp"]] * 2, color=GREY, linewidth=1.0, linestyle="--",
                label=f"Fables flat fee {m['feeFlatBp']:.0f} bp, used only when no poke is live (never in this window)")
    bottom.plot([start, end], [cap_bp] * 2, color=GREY, linewidth=1.0, linestyle=":", label=f"Fables cap {cap_bp:.0f} bp")
    bottom.set_ylabel("LP fee (bp)", color=INK, fontsize=8)
    bottom.set_ylim(0, 108)
    bottom.legend(loc="upper left", fontsize=6.0, frameon=False, ncol=2, handlelength=2.2, columnspacing=0.8,
                  labelspacing=0.35, borderaxespad=0.2, labelcolor=INK)
    bottom.xaxis.set_major_formatter(mdates.DateFormatter("%H:%M", tz=timezone.utc))
    bottom.set_xlabel("UTC", color=INK, fontsize=8, labelpad=1)
    bottom.set_xlim(start - timedelta(minutes=6), end)

    for ax in (top, bottom):
        ax.axvline(cpi, color=INK2, linewidth=0.8, linestyle=(0, (2, 2)), zorder=0)
        ax.grid(axis="y", color="#E3E7EE", linewidth=0.8)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        ax.tick_params(colors=INK, labelsize=7)
    cap_poke = doc["fables"]["capPokes"][0]
    top.annotate(
        f"US CPI release {cpi:%H:%M:%S} UTC: the keeper pokes its {cap_bp:.0f} bp cap\n"
        f"in the same second; clim's desk reads {cap_poke['climSigmaAnnualPctAtPoke']:.0f} %/yr ({cap_poke['climFeeBpAtPoke']:.1f} bp)",
        xy=(cpi, top.get_ylim()[1] * 0.98), xytext=(cpi + timedelta(minutes=3), top.get_ylim()[1] * 0.98),
        fontsize=6.3, color=INK, ha="left", va="top",
    )

    sc = doc["fables"]["swapCheck"]
    fig.text(
        0.012, 0.012,
        f"Keeper fee rebuilt from the FeePoked and PoolConfigured logs of hook {_short(doc['fables']['hook'])}, pool "
        f"{_short(doc['fables']['poolId'])} (Robinhood Chain);\nit matches the fee paid by {sc['matched']:,} of {sc['swaps']:,} swaps. "
        "clim line: the lab's re-implementation of the desk on Binance-only ETHUSDT 1 s prices\n"
        "(30 s reports, 12 s latency), not CRE output. Data: lab/out/fables-compare.json",
        fontsize=7, color=INK2, ha="left", va="bottom", linespacing=1.3,
    )
    fig.tight_layout(rect=(0, 0.095, 1, 0.96), h_pad=0.6)
    fig.savefig(out_path, facecolor="white")
    plt.close(fig)


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_IN
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    dst.parent.mkdir(parents=True, exist_ok=True)
    make_fables_figure(json.loads(src.read_text()), str(dst))
    print(f"wrote {dst}")
