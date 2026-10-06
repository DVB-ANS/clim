// Venue requests, response parsers and the node-mode fetch. Parsers are pure and tested on
// fixtures captured from the real endpoints (fixtures/, see scripts/capture-fixtures.sh).
import { HTTPClient, type NodeRuntime, ok, text } from '@chainlink/cre-sdk'
import type { Candle, Quote, VenueSeries } from './estimator'

export const VENUES = ['coinbase', 'kraken', 'binance', 'hyperliquid'] as const
export type VenueName = (typeof VENUES)[number]

export const VENUE_QUOTE: Record<VenueName, Quote> = {
	coinbase: 'USD',
	kraken: 'USD',
	binance: 'USDT',
	hyperliquid: 'USD', // USDC-margined perp, treated as USD
}

const LOOKBACK_SEC = 1200 // 20 minutes: covers the 16 closes of RV15 plus the staleness margin

export interface HttpReq {
	url: string
	method: 'GET' | 'POST'
	body?: string // raw JSON text; base64-encoded at send time
}

export function venueRequest(venue: VenueName, nowSec: number): HttpReq {
	switch (venue) {
		case 'coinbase':
			return {
				url: 'https://api.coinbase.com/api/v3/brokerage/market/products/ETH-USD/candles?granularity=ONE_MINUTE&limit=20',
				method: 'GET',
			}
		case 'kraken':
			return {
				url: `https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=1&since=${nowSec - LOOKBACK_SEC}`,
				method: 'GET',
			}
		case 'binance':
			return {
				url: 'https://data-api.binance.vision/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=20',
				method: 'GET',
			}
		case 'hyperliquid':
			return {
				url: 'https://api.hyperliquid.xyz/info',
				method: 'POST',
				body: JSON.stringify({
					type: 'candleSnapshot',
					req: {
						coin: 'ETH',
						interval: '1m',
						startTime: (nowSec - LOOKBACK_SEC) * 1000,
						endTime: nowSec * 1000,
					},
				}),
			}
	}
}

export function dvolRequest(dvolUrl: string, nowSec: number): HttpReq {
	const end = nowSec * 1000
	const start = end - 600_000
	return {
		url: `${dvolUrl}?currency=ETH&start_timestamp=${start}&end_timestamp=${end}&resolution=60`,
		method: 'GET',
	}
}

// ---------- parsing helpers ----------

function num(x: unknown, what: string): number {
	const n = typeof x === 'string' ? Number(x) : x
	if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`${what}: not a number: ${String(x)}`)
	return n
}

function obj(x: unknown, what: string): Record<string, unknown> {
	if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`${what}: not an object`)
	return x as Record<string, unknown>
}

function arr(x: unknown, what: string): unknown[] {
	if (!Array.isArray(x)) throw new Error(`${what}: not an array`)
	return x
}

const ascending = (cs: Candle[]): Candle[] => cs.sort((a, b) => a.t - b.t)

// ---------- venue parsers (all return candles ascending by open time, seconds) ----------

// {"candles":[{"start":"1791282180","close":"2713.98",...}, ...]} newest first
export function parseCoinbase(json: unknown): Candle[] {
	const rows = arr(obj(json, 'coinbase').candles, 'coinbase.candles')
	return ascending(
		rows.map((r) => {
			const o = obj(r, 'coinbase.candle')
			return { t: num(o.start, 'coinbase.start'), close: num(o.close, 'coinbase.close') }
		}),
	)
}

// {"error":[],"result":{"XETHZUSD":[[time,open,high,low,close,vwap,volume,count],...],"last":N}}
export function parseKraken(json: unknown): Candle[] {
	const o = obj(json, 'kraken')
	const errors = arr(o.error ?? [], 'kraken.error')
	if (errors.length > 0) throw new Error(`kraken: ${errors.join(',')}`)
	const result = obj(o.result, 'kraken.result')
	const key = Object.keys(result).find((k) => k !== 'last')
	if (key === undefined) throw new Error('kraken: no pair in result')
	return ascending(
		arr(result[key], 'kraken.rows').map((r) => {
			const row = arr(r, 'kraken.row')
			return { t: num(row[0], 'kraken.time'), close: num(row[4], 'kraken.close') }
		}),
	)
}

// [[openTimeMs,"open","high","low","close","volume",closeTimeMs,...], ...]
export function parseBinance(json: unknown): Candle[] {
	return ascending(
		arr(json, 'binance').map((r) => {
			const row = arr(r, 'binance.row')
			return { t: num(row[0], 'binance.openTime') / 1000, close: num(row[4], 'binance.close') }
		}),
	)
}

// [{"t":openMs,"T":closeMs,"s":"ETH","i":"1m","o":"..","c":"..",...}, ...]
export function parseHyperliquid(json: unknown): Candle[] {
	return ascending(
		arr(json, 'hyperliquid').map((r) => {
			const o = obj(r, 'hyperliquid.candle')
			return { t: num(o.t, 'hyperliquid.t') / 1000, close: num(o.c, 'hyperliquid.c') }
		}),
	)
}

export function parseVenue(venue: VenueName, json: unknown): Candle[] {
	switch (venue) {
		case 'coinbase':
			return parseCoinbase(json)
		case 'kraken':
			return parseKraken(json)
		case 'binance':
			return parseBinance(json)
		case 'hyperliquid':
			return parseHyperliquid(json)
	}
}

// {"result":{"data":[[tsMs,open,high,low,close],...]}} -> last close (DVOL in vol points, e.g. 47.55)
export function parseDvol(json: unknown): number {
	const data = arr(obj(obj(json, 'deribit').result, 'deribit.result').data, 'deribit.data')
	if (data.length === 0) throw new Error('deribit: empty data')
	const last = arr(data[data.length - 1], 'deribit.row')
	return num(last[4], 'deribit.close')
}

// {"error":[],"result":{"USDTZUSD":{"c":["0.99966000","5.19"],...}}} -> last trade price
export function parseUsdtUsd(json: unknown): number {
	const result = obj(obj(json, 'kraken-usdt').result, 'kraken-usdt.result')
	const key = Object.keys(result)[0]
	if (key === undefined) throw new Error('kraken-usdt: empty result')
	const c = arr(obj(result[key], 'kraken-usdt.pair').c, 'kraken-usdt.c')
	return num(c[0], 'kraken-usdt.last')
}

// ---------- replay (plan 04 replay server) ----------

// The plan 04 replay server replays one historical Binance ETHUSDT series in Binance kline format,
// timestamps shifted to the wall clock, under one path per venue name (so the per-venue logic and the
// desk's quorum are exercised; the REPLAY flag of the replay desk discloses that it is one series).
export function replayVenueRequest(replayUrl: string, venue: VenueName): HttpReq {
	return { url: `${replayUrl}/venue/${venue}/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=20`, method: 'GET' }
}

export interface DeskInput {
	nowSec: number
	usdtUsd: number | null
	dvol: number | null
	series: VenueSeries[]
	notes: string[] // per-source fetch/parse problems, for logs
}

// ---------- node-mode fetch ----------

type Fetched = { json: unknown } | { error: string }

// Sends every request first, then waits for each response, so the calls run concurrently.
export function sendAll(nodeRuntime: NodeRuntime<unknown>, reqs: HttpReq[]): Fetched[] {
	const http = new HTTPClient()
	const pending = reqs.map((r) =>
		http.sendRequest(nodeRuntime, {
			url: r.url,
			method: r.method,
			headers: r.body === undefined ? {} : { 'Content-Type': 'application/json' },
			body: r.body === undefined ? '' : Buffer.from(r.body).toString('base64'),
			timeout: '8s', // below the 10 s connection quota; a hung venue must not stall the tick
		}),
	)
	return pending.map((p): Fetched => {
		try {
			const resp = p.result()
			if (!ok(resp)) return { error: `HTTP ${resp.statusCode}` }
			return { json: JSON.parse(text(resp)) }
		} catch (e) {
			return { error: e instanceof Error ? e.message : String(e) }
		}
	})
}

function settle<T>(f: Fetched, parse: (json: unknown) => T): { value: T } | { error: string } {
	if ('error' in f) return { error: f.error }
	try {
		return { value: parse(f.json) }
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) }
	}
}

export function fetchLive(
	nodeRuntime: NodeRuntime<unknown>,
	venues: VenueName[],
	dvolUrl: string,
	usdtUsdUrl: string,
	nowSec: number,
): DeskInput {
	const reqs = [
		...venues.map((v) => venueRequest(v, nowSec)),
		dvolRequest(dvolUrl, nowSec),
		{ url: usdtUsdUrl, method: 'GET' as const },
	]
	const res = sendAll(nodeRuntime, reqs)
	const notes: string[] = []
	const series: VenueSeries[] = []
	venues.forEach((v, i) => {
		const r = settle(res[i], (j) => parseVenue(v, j))
		if ('error' in r) notes.push(`${v}: ${r.error}`)
		// a failed venue stays in the list with no candles, so the quorum message counts it
		series.push({ venue: v, quote: VENUE_QUOTE[v], candles: 'error' in r ? [] : r.value })
	})
	const dv = settle(res[venues.length], parseDvol)
	if ('error' in dv) notes.push(`dvol: ${dv.error}`)
	const ut = settle(res[venues.length + 1], parseUsdtUsd)
	if ('error' in ut) notes.push(`usdtusd: ${ut.error}`)
	return {
		nowSec,
		usdtUsd: 'error' in ut ? null : ut.value,
		dvol: 'error' in dv ? null : dv.value,
		series,
		notes,
	}
}

export function fetchReplay(
	nodeRuntime: NodeRuntime<unknown>,
	replayUrl: string,
	venues: VenueName[],
	nowSec: number,
): DeskInput {
	const res = sendAll(
		nodeRuntime,
		venues.map((v) => replayVenueRequest(replayUrl, v)),
	)
	const notes: string[] = []
	const series: VenueSeries[] = venues.map((v, i) => {
		const r = settle(res[i], parseBinance)
		if ('error' in r) notes.push(`replay ${v}: ${r.error}`)
		// replay prices are the historical USDT closes, used as USD (no USDT/USD rate in the replay)
		return { venue: v, quote: 'USD', candles: 'error' in r ? [] : r.value }
	})
	return { nowSec, usdtUsd: null, dvol: null, series, notes }
}
