"""Title cards and caption overlays for the demo video (1920x1080 PNG).

Usage: python figures/video_cards.py <out_dir> <lab/out/replay-2026-02-04.json>
Writes card-*.png (opaque) and cap-*.png (transparent overlays) for every entry of cards() and CAPTIONS.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
NIGHT = (14, 23, 38, 255)
INK = (232, 238, 247, 255)
MUTED = (159, 176, 200, 255)
AMBER = (245, 165, 36, 255)
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"


def cards(replay: dict) -> dict:
    sigma = [p["sigmaAnnualPct"] for p in replay["points"]]
    return {
        "card-act1": ("Act 1 · Live on Sepolia", "Chainlink CRE writes the weather on-chain. The hook prices every swap from it."),
        "card-act2": (
            "Act 2 · Replay of 4 February 2026",
            f"Volatility goes from {min(sigma):.0f}% to {max(sigma):.0f}% a year. Watch the fee follow.",
        ),
        "card-act3": ("Act 3 · Does the model hold?", "Predicted against observed, on real market data."),
        "card-end": ("clim", "Storm insurance for Uniswap LPs · github.com/DVB-ANS/clim"),
    }


CAPTIONS = {
    "cap-s11": "CRE risk desk: 4 venues, quorum, 15-min volatility, one signed report every 30 s",
    "cap-s12": "The report lands on-chain: RiskDesk.onReport via the Chainlink forwarder",
    "cap-s13": "Every swap reads the desk: clim pool fee next to a fixed-fee twin",
    "cap-s14": "A forged report from another key is rejected by RiskDesk",
    "cap-s15": "Desk silent for 3 minutes: the hook goes blind and quotes the safe fee",
    "cap-s16": "Desk back: the fee returns to the market-driven level",
    "cap-s21": "Replay of 4 Feb 2026: volatility climbs, clim's fee steps up, the fixed pool stays flat",
    "cap-s22": "LP losses to arbitrage: clim pool against the fixed-fee pool at the same average fee",
    "cap-s31": "Share of arbitraged blocks: predicted by the model against observed",
    "cap-s32": "Both comparisons: same average fee, and same cost to traders",
}


def make_card(title: str, subtitle: str, path: str) -> None:
    img = Image.new("RGBA", (W, H), NIGHT)
    d = ImageDraw.Draw(img)
    d.text((140, 430), title, font=ImageFont.truetype(FONT_BOLD, 96), fill=INK)
    d.text((140, 580), subtitle, font=ImageFont.truetype(FONT, 44), fill=MUTED)
    d.ellipse((140, 360, 176, 396), fill=AMBER)
    img.convert("RGB").save(path)


def make_caption(text: str, path: str) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_BOLD, 40)
    box = d.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    x, y = (W - tw) // 2, H - 150
    d.rounded_rectangle((x - 36, y - 24, x + tw + 36, y + th + 30), radius=18, fill=(14, 23, 38, 225))
    d.text((x, y), text, font=font, fill=INK)
    img.save(path)


def main(out_dir: str, replay: dict) -> None:
    os.makedirs(out_dir, exist_ok=True)
    all_cards = cards(replay)
    for name, (title, subtitle) in all_cards.items():
        make_card(title, subtitle, os.path.join(out_dir, f"{name}.png"))
    for name, text in CAPTIONS.items():
        make_caption(text, os.path.join(out_dir, f"{name}.png"))
    print(f"wrote {len(all_cards)} cards and {len(CAPTIONS)} captions to {out_dir}")


if __name__ == "__main__":
    with open(sys.argv[2]) as f:
        main(sys.argv[1], json.load(f))
