#!/usr/bin/env bash
# Builds the demo videos from raw macOS screen recordings.
# Inputs:  out/video/raw/<shot>.mov (or .mp4), out/video/cards/*.png (figures/video_cards.py)
# Outputs: out/video/demo-full.mp4, out/video/demo-stage.mp4, out/video/cover-stage.png, out/video/cover-full.png
# Usage:   bash scripts/build-video.sh   (run from docs/submission)
set -euo pipefail

V=out/video
RAW=$V/raw
CARDS=$V/cards
SEG=$V/segments
mkdir -p "$SEG"

ENC=(-c:v libx264 -preset medium -crf 26 -pix_fmt yuv420p -r 30 -an)
BG=0x0E1726

# shot  full_cap_s  stage_cap_s(0 = not in stage cut)  mode(trim = cut at cap, fit = time-lapse to cap)
SHOTS="s11 12 8 trim
s12 8 0 trim
s13 15 0 trim
s14 12 10 trim
s15 12 8 fit
s16 8 0 trim
s21 40 30 fit
s22 12 8 trim
s31 12 8 trim
s32 12 0 trim"

raw_of() {
  for ext in mov mp4 MOV MP4; do
    if [ -f "$RAW/$1.$ext" ]; then echo "$RAW/$1.$ext"; return 0; fi
  done
  echo "missing raw recording for shot $1 in $RAW" >&2
  return 1
}

duration_of() {
  ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$1"
}

# segment <shot> <cap_seconds> <mode> <out.mp4>
segment() {
  local src cap mode out dur factor speed
  src=$(raw_of "$1"); cap=$2; mode=$3; out=$4
  dur=$(duration_of "$src")
  speed="setpts=PTS"
  if [ "$mode" = fit ]; then
    factor=$(awk -v c="$cap" -v d="$dur" 'BEGIN { f = c / d; if (f > 1) f = 1; printf "%.6f", f }')
    speed="setpts=PTS*$factor"
  fi
  ffmpeg -nostdin -y -v error -i "$src" -i "$CARDS/cap-$1.png" -filter_complex \
    "[0:v]$speed,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$BG,fps=30[base];[base][1:v]overlay=0:0,format=yuv420p[v]" \
    -map "[v]" -t "$cap" "${ENC[@]}" "$out"
}

# card <name> <seconds> <out.mp4>
card() {
  ffmpeg -nostdin -y -v error -loop 1 -t "$2" -i "$CARDS/$1.png" -vf "fps=30,format=yuv420p" "${ENC[@]}" "$3"
}

concat() {
  local list=$1 out=$2
  ffmpeg -nostdin -y -v error -f concat -safe 0 -i "$list" "${ENC[@]}" -movflags +faststart "$out"
}

FULL_LIST=$SEG/full.txt
STAGE_LIST=$SEG/stage.txt
: > "$FULL_LIST"; : > "$STAGE_LIST"

card card-act1 3 "$SEG/card-act1-full.mp4"; echo "file 'card-act1-full.mp4'" >> "$FULL_LIST"
card card-act1 2 "$SEG/card-act1-stage.mp4"; echo "file 'card-act1-stage.mp4'" >> "$STAGE_LIST"

while read -r shot full stage mode; do
  case $shot in
    s21) card card-act2 3 "$SEG/card-act2-full.mp4"; echo "file 'card-act2-full.mp4'" >> "$FULL_LIST"
         card card-act2 2 "$SEG/card-act2-stage.mp4"; echo "file 'card-act2-stage.mp4'" >> "$STAGE_LIST" ;;
    s31) card card-act3 3 "$SEG/card-act3-full.mp4"; echo "file 'card-act3-full.mp4'" >> "$FULL_LIST" ;;
  esac
  segment "$shot" "$full" "$mode" "$SEG/$shot-full.mp4"; echo "file '$shot-full.mp4'" >> "$FULL_LIST"
  if [ "$stage" != 0 ]; then
    segment "$shot" "$stage" "$mode" "$SEG/$shot-stage.mp4"; echo "file '$shot-stage.mp4'" >> "$STAGE_LIST"
  fi
done <<< "$SHOTS"

card card-end 3 "$SEG/card-end-full.mp4"; echo "file 'card-end-full.mp4'" >> "$FULL_LIST"
card card-end 2 "$SEG/card-end-stage.mp4"; echo "file 'card-end-stage.mp4'" >> "$STAGE_LIST"

concat "$FULL_LIST" "$V/demo-full.mp4"
concat "$STAGE_LIST" "$V/demo-stage.mp4"

# Poster frames: the middle of the replay shot.
ffmpeg -nostdin -y -v error -ss "$(awk -v d="$(duration_of "$SEG/s21-stage.mp4")" 'BEGIN { printf "%.2f", d / 2 }')" -i "$SEG/s21-stage.mp4" -frames:v 1 "$V/cover-stage.png"
ffmpeg -nostdin -y -v error -i "$SEG/card-act1-full.mp4" -frames:v 1 "$V/cover-full.png"

for f in "$V/demo-full.mp4" "$V/demo-stage.mp4"; do
  printf '%s  %.1f s  %s MB\n' "$f" "$(duration_of "$f")" "$(du -m "$f" | cut -f1)"
done
