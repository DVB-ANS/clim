import { describe, expect, test } from "bun:test";
import {
  aggregate,
  fetchReplayPrice,
  fetchVenueQuotes,
  median,
  parseBinanceTicker,
  parseCoinbaseProduct,
  parseHyperliquidMids,
  parseKrakenTicker,
  VENUE_URLS,
  type FetchLike,
} from "../src/lib/market";

// Trimmed real responses (captured from the public endpoints).
const COINBASE = { product_id: "ETH-USD", price: "2713.33", base_name: "Ethereum", quote_name: "US Dollar" };
const KRAKEN = {
  error: [],
  result: {
    XETHZUSD: { a: ["2713.25000", "2", "2.000"], b: ["2713.24000", "4", "4.000"], c: ["2713.25000", "0.00412332"] },
    USDTZUSD: { a: ["0.99971000", "83080", "83080.000"], b: ["0.99970000", "745859", "745859.000"], c: ["0.99970000", "49.90100000"] },
  },
};
const BINANCE = { symbol: "ETHUSDT", price: "2713.86000000" };
const HYPERLIQUID = { BTC: "86027.5", ETH: "2712.75", SOL: "120.015" };

function fakeFetch(failing: string[] = []): FetchLike {
  return async (url) => {
    const name = Object.entries(VENUE_URLS).find(([, u]) => u === url)?.[0];
    if (!name || failing.includes(name)) throw new Error(`down: ${url}`);
    const body = { coinbase: COINBASE, kraken: KRAKEN, binance: BINANCE, hyperliquid: HYPERLIQUID }[name];
    return new Response(JSON.stringify(body));
  };
}

describe("venue parsers", () => {
  test("parse each public endpoint", () => {
    expect(parseCoinbaseProduct(COINBASE)).toBe(2713.33);
    expect(parseKrakenTicker(KRAKEN)).toEqual({ ethUsd: 2713.25, usdtUsd: 0.9997 });
    expect(parseBinanceTicker(BINANCE)).toBe(2713.86);
    expect(parseHyperliquidMids(HYPERLIQUID)).toBe(2712.75);
  });
  test("reject malformed or error payloads", () => {
    expect(() => parseCoinbaseProduct({ price: "abc" })).toThrow();
    expect(() => parseKrakenTicker({ error: ["EGeneral:Too many requests"], result: {} })).toThrow(/Kraken/);
    expect(() => parseHyperliquidMids({ BTC: "1" })).toThrow();
  });
});

describe("median and quorum", () => {
  test("median of odd and even samples", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  test("aggregate needs at least 3 venues", () => {
    expect(aggregate([{ venue: "coinbase", price: 1 }, { venue: "kraken", price: 2 }])).toBeNull();
    expect(aggregate([{ venue: "coinbase", price: 1 }, { venue: "kraken", price: 2 }, { venue: "binance", price: 9 }])).toEqual({ price: 2, n: 3 });
  });
});

describe("fetchVenueQuotes", () => {
  test("all four venues, Binance converted from USDT with Kraken USDT/USD", async () => {
    const q = await fetchVenueQuotes(fakeFetch());
    expect(q.map((x) => x.venue).sort()).toEqual(["binance", "coinbase", "hyperliquid", "kraken"]);
    expect(q.find((x) => x.venue === "binance")?.price).toBeCloseTo(2713.86 * 0.9997, 9);
    expect(aggregate(q)?.price).toBeCloseTo((2713.86 * 0.9997 + 2713.25) / 2, 9);
  });
  test("a failing venue is dropped; without Kraken, Binance cannot be normalised and is dropped too", async () => {
    expect((await fetchVenueQuotes(fakeFetch(["coinbase"]))).length).toBe(3);
    const q = await fetchVenueQuotes(fakeFetch(["kraken"]));
    expect(q.map((x) => x.venue).sort()).toEqual(["coinbase", "hyperliquid"]);
    expect(aggregate(q)).toBeNull();
  });
});

describe("replay price", () => {
  test("reads the Binance-format ticker of the replay server", async () => {
    const f: FetchLike = async (url) => {
      expect(url).toBe("http://127.0.0.1:8787/api/v3/ticker/price?symbol=ETHUSDT");
      return new Response(JSON.stringify({ symbol: "ETHUSDT", price: "2210.50000000" }));
    };
    expect(await fetchReplayPrice("http://127.0.0.1:8787", f)).toBe(2210.5);
  });
});
