import { describe, expect, test } from 'bun:test'
import { estimate } from './estimator'
import binance from './fixtures/binance.json'
import coinbase from './fixtures/coinbase.json'
import deribit from './fixtures/deribit.json'
import hyperliquid from './fixtures/hyperliquid.json'
import kraken from './fixtures/kraken.json'
import krakenUsdt from './fixtures/kraken_usdt.json'
import {
	dvolRequest,
	parseBinance,
	parseCoinbase,
	parseDvol,
	parseHyperliquid,
	parseKraken,
	parseUsdtUsd,
	parseVenue,
	replayVenueRequest,
	VENUE_QUOTE,
	VENUES,
	venueRequest,
} from './venues'

// Real responses captured by scripts/capture-fixtures.sh at this instant (fixtures/now.txt).
const NOW = 1_791_282_309

describe('venueRequest', () => {
	test('URLs and the Hyperliquid POST body', () => {
		expect(venueRequest('coinbase', NOW).url).toBe(
			'https://api.coinbase.com/api/v3/brokerage/market/products/ETH-USD/candles?granularity=ONE_MINUTE&limit=20',
		)
		expect(venueRequest('kraken', NOW).url).toBe(
			`https://api.kraken.com/0/public/OHLC?pair=ETHUSD&interval=1&since=${NOW - 1200}`,
		)
		expect(venueRequest('binance', NOW).url).toBe(
			'https://data-api.binance.vision/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=20',
		)
		const hl = venueRequest('hyperliquid', NOW)
		expect(hl.method).toBe('POST')
		expect(JSON.parse(hl.body ?? '')).toEqual({
			type: 'candleSnapshot',
			req: { coin: 'ETH', interval: '1m', startTime: (NOW - 1200) * 1000, endTime: NOW * 1000 },
		})
		expect(dvolRequest('https://www.deribit.com/api/v2/public/get_volatility_index_data', NOW).url).toBe(
			`https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=ETH&start_timestamp=${(NOW - 600) * 1000}&end_timestamp=${NOW * 1000}&resolution=60`,
		)
	})
})

describe('parsers on captured fixtures', () => {
	test('coinbase: newest-first strings, sorted ascending', () => {
		const c = parseCoinbase(coinbase)
		expect(c).toHaveLength(19)
		expect(c[0]).toEqual({ t: 1_791_281_160, close: 2708.41 })
		expect(c[c.length - 1]).toEqual({ t: 1_791_282_240, close: 2713.76 })
	})
	test('kraken: rows under XETHZUSD, last row still open', () => {
		const c = parseKraken(kraken)
		expect(c).toHaveLength(20)
		expect(c[c.length - 1]).toEqual({ t: 1_791_282_300, close: 2714.65 })
	})
	test('binance: open time in ms, close in USDT', () => {
		const c = parseBinance(binance)
		expect(c).toHaveLength(20)
		expect(c[c.length - 1]).toEqual({ t: 1_791_282_300, close: 2715.18 })
	})
	test('hyperliquid: t in ms, c as string', () => {
		const c = parseHyperliquid(hyperliquid)
		expect(c).toHaveLength(21)
		expect(c[0]).toEqual({ t: 1_791_281_100, close: 2708.3 })
	})
	test('deribit DVOL and kraken USDT/USD', () => {
		expect(parseDvol(deribit)).toBe(47.55)
		expect(parseUsdtUsd(krakenUsdt)).toBe(0.99967)
	})
	test('malformed responses throw', () => {
		expect(() => parseKraken({ error: ['EQuery:Unknown asset pair'], result: {} })).toThrow('kraken: EQuery:Unknown asset pair')
		expect(() => parseCoinbase({ message: 'rate limited' })).toThrow('coinbase.candles: not an array')
		expect(() => parseDvol({ result: { data: [] } })).toThrow('deribit: empty data')
	})
})

describe('estimate on the captured snapshot', () => {
	test('4 venues, sigma 33.4%/yr, 2 bp dispersion', () => {
		const series = VENUES.map((v) => ({
			venue: v,
			quote: VENUE_QUOTE[v],
			candles: parseVenue(v, { coinbase, kraken, binance, hyperliquid }[v]),
		}))
		const est = estimate({ nowSec: NOW, usdtUsd: parseUsdtUsd(krakenUsdt), token0IsEth: true, series })
		expect(est).toEqual({
			sigmaE9: 59_492,
			rv15E9: 59_492,
			refTick: 79_065,
			dispBp: 2,
			nSources: 4,
			priceE6: 2_713_815_000,
			tEnd: 1_791_282_240,
			sources: ['coinbase', 'kraken', 'binance', 'hyperliquid'],
		})
	})
})

describe('replayVenueRequest', () => {
	test('one Binance-format path per venue on the plan 04 replay server', () => {
		expect(replayVenueRequest('http://127.0.0.1:8787', 'kraken')).toEqual({
			url: 'http://127.0.0.1:8787/venue/kraken/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=20',
			method: 'GET',
		})
	})
})
