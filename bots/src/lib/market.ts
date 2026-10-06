// Market price m for the arbitrageur: median of the same four venues as the CRE desk, but from real-time
// tickers (an arbitrageur sees the live price, not 1-minute closes). Binance is USDT-quoted and is
// converted with Kraken's USDT/USD. Fewer than 3 venues -> no price (the bot skips the block).
export type VenueName = "coinbase" | "kraken" | "binance" | "hyperliquid";
export type VenueQuote = { venue: VenueName; price: number };
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const MIN_VENUES = 3;

export const VENUE_URLS = {
  coinbase: "https://api.coinbase.com/api/v3/brokerage/market/products/ETH-USD",
  kraken: "https://api.kraken.com/0/public/Ticker?pair=ETHUSD,USDTUSD",
  binance: "https://data-api.binance.vision/api/v3/ticker/price?symbol=ETHUSDT",
  hyperliquid: "https://api.hyperliquid.xyz/info",
} as const;

function positive(v: unknown, what: string): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${what}: expected a positive number, got ${String(v)}`);
  return n;
}

function field(o: unknown, key: string): unknown {
  return typeof o === "object" && o !== null ? (o as Record<string, unknown>)[key] : undefined;
}

/** Coinbase Advanced public product: { price: "2713.33", ... } (last trade). */
export function parseCoinbaseProduct(j: unknown): number {
  return positive(field(j, "price"), "coinbase price");
}

/** Kraken Ticker for ETHUSD,USDTUSD: result.<pair>.c[0] is the last trade price. */
export function parseKrakenTicker(j: unknown): { ethUsd: number; usdtUsd: number } {
  const err = field(j, "error");
  if (Array.isArray(err) && err.length > 0) throw new Error(`Kraken error: ${err.join(", ")}`);
  const r = field(j, "result");
  const last = (pair: string): unknown => {
    const c = field(field(r, pair), "c");
    return Array.isArray(c) ? c[0] : undefined;
  };
  return { ethUsd: positive(last("XETHZUSD"), "kraken XETHZUSD"), usdtUsd: positive(last("USDTZUSD"), "kraken USDTZUSD") };
}

/** Binance (and the replay server) ticker: { symbol: "ETHUSDT", price: "2713.86000000" }. */
export function parseBinanceTicker(j: unknown): number {
  return positive(field(j, "price"), "binance price");
}

/** Hyperliquid POST /info { type: "allMids" }: { ETH: "2712.75", ... } (perp mid, USDC ~ USD). */
export function parseHyperliquidMids(j: unknown): number {
  return positive(field(j, "ETH"), "hyperliquid ETH mid");
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) throw new RangeError("median of an empty list");
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export function aggregate(quotes: readonly VenueQuote[]): { price: number; n: number } | null {
  if (quotes.length < MIN_VENUES) return null;
  return { price: median(quotes.map((q) => q.price)), n: quotes.length };
}

async function getJson(fetchFn: FetchLike, url: string, timeoutMs: number, init?: RequestInit): Promise<unknown> {
  const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export async function fetchVenueQuotes(fetchFn: FetchLike = fetch, timeoutMs = 4_000): Promise<VenueQuote[]> {
  const [cb, kr, bn, hl] = await Promise.allSettled([
    getJson(fetchFn, VENUE_URLS.coinbase, timeoutMs).then(parseCoinbaseProduct),
    getJson(fetchFn, VENUE_URLS.kraken, timeoutMs).then(parseKrakenTicker),
    getJson(fetchFn, VENUE_URLS.binance, timeoutMs).then(parseBinanceTicker),
    getJson(fetchFn, VENUE_URLS.hyperliquid, timeoutMs, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "allMids" }),
    }).then(parseHyperliquidMids),
  ]);
  const out: VenueQuote[] = [];
  if (cb.status === "fulfilled") out.push({ venue: "coinbase", price: cb.value });
  if (kr.status === "fulfilled") out.push({ venue: "kraken", price: kr.value.ethUsd });
  if (bn.status === "fulfilled" && kr.status === "fulfilled") out.push({ venue: "binance", price: bn.value * kr.value.usdtUsd });
  if (hl.status === "fulfilled") out.push({ venue: "hyperliquid", price: hl.value });
  return out;
}

/** Current replay price from replay-server.ts (Binance ticker format, historical USDT price used as USD). */
export async function fetchReplayPrice(replayUrl: string, fetchFn: FetchLike = fetch, timeoutMs = 4_000): Promise<number> {
  return parseBinanceTicker(await getJson(fetchFn, `${replayUrl}/api/v3/ticker/price?symbol=ETHUSDT`, timeoutMs));
}
