#!/usr/bin/env bash
# Captures one consistent snapshot of the six risk-desk sources (fails loudly if one is down).
# Usage (from cre/risk-desk): bash scripts/capture-fixtures.sh [outdir]   (default: fixtures)
# The committed fixtures/ are the unit-test inputs: capture into another directory to explore.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-fixtures}"
mkdir -p "$OUT"
NOW=$(date +%s)
NOWMS=$((NOW * 1000))
echo "$NOW" > "$OUT/now.txt"
curl -sf -m 10 "https://api.coinbase.com/api/v3/brokerage/market/products/ETH-USD/candles?granularity=ONE_MINUTE&limit=20" -o "$OUT"/coinbase.json
curl -sf -m 10 "https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=1&since=$((NOW - 1200))" -o "$OUT"/kraken.json
curl -sf -m 10 "https://data-api.binance.vision/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=20" -o "$OUT"/binance.json
curl -sf -m 10 -X POST "https://api.hyperliquid.xyz/info" -H 'Content-Type: application/json' \
  -d "{\"type\":\"candleSnapshot\",\"req\":{\"coin\":\"ETH\",\"interval\":\"1m\",\"startTime\":$((NOWMS - 1200000)),\"endTime\":$NOWMS}}" -o "$OUT"/hyperliquid.json
curl -sf -m 10 "https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=ETH&start_timestamp=$((NOWMS - 600000))&end_timestamp=$NOWMS&resolution=60" -o "$OUT"/deribit.json
curl -sf -m 10 "https://api.kraken.com/0/public/Ticker?pair=USDTUSD" -o "$OUT"/kraken_usdt.json
echo "captured at $NOW into $OUT"; wc -c "$OUT"/*.json
