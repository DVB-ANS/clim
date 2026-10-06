import { describe, expect, test } from 'bun:test'
import {
	annualPctFromE9,
	type Candle,
	closedCandles,
	commonEnd,
	DESK,
	dispersionBp,
	estimate,
	isFresh,
	median,
	perMinuteMedians,
	priceToTick,
	QuorumError,
	realizedVolPerSqrtSec,
	toUsd,
	type VenueSeries,
} from './estimator'

// Synthetic market: 20 one-minute candles, every log return exactly +0.001.
const T0 = 1_799_998_800 // multiple of 60
const NOW = T0 + 20 * 60 + 10 // 10 s after the 20th candle closed
const p = (i: number): number => 2000 * Math.exp(0.001 * i)
const candles = (f: (i: number) => number, n = 20): Candle[] =>
	Array.from({ length: n }, (_, i) => ({ t: T0 + 60 * i, close: f(i) }))

const venueA: VenueSeries = { venue: 'a', quote: 'USD', candles: candles(p) }
const venueB: VenueSeries = { venue: 'b', quote: 'USD', candles: candles((i) => p(i) * 1.0002) }
const venueC: VenueSeries = { venue: 'c', quote: 'USDT', candles: candles((i) => 2 * p(i) * 0.9999) } // usdtUsd 0.5
const venueStale: VenueSeries = { venue: 'd', quote: 'USD', candles: candles(p, 17) } // last close 190 s ago

describe('median', () => {
	test('odd, even, empty', () => {
		expect(median([3, 1, 2])).toBe(2)
		expect(median([4, 1, 3, 2])).toBe(2.5)
		expect(() => median([])).toThrow('median of an empty list')
	})
})

describe('closedCandles', () => {
	test('keeps candles whose minute has ended (t + 60 <= now), sorted ascending', () => {
		const cs = [
			{ t: 940, close: 2 },
			{ t: 880, close: 1 },
			{ t: 941, close: 3 },
		]
		expect(closedCandles(cs, 1000)).toEqual([
			{ t: 880, close: 1 },
			{ t: 940, close: 2 },
		])
	})
})

describe('toUsd', () => {
	test('USD passes through, USDT is multiplied, USDT without rate is dropped', () => {
		expect(toUsd(venueA, null)).toBe(venueA)
		expect(toUsd({ venue: 'x', quote: 'USDT', candles: [{ t: 0, close: 10 }] }, 0.5)?.candles).toEqual([{ t: 0, close: 5 }])
		expect(toUsd(venueC, null)).toBeNull()
	})
})

describe('isFresh', () => {
	test(`last close at most ${DESK.MAX_AGE_SEC} s old`, () => {
		expect(isFresh([{ t: 820, close: 1 }], 1000)).toBe(true) // closed at 880, age 120
		expect(isFresh([{ t: 819, close: 1 }], 1000)).toBe(false) // age 121
		expect(isFresh([], 1000)).toBe(false)
	})
})

describe('commonEnd', () => {
	test('latest minute closed by at least `quorum` venues', () => {
		const late: VenueSeries = { venue: 'b', quote: 'USD', candles: candles(p, 19) }
		expect(commonEnd([venueA, late, venueC], 3)).toBe(T0 + 60 * 18)
		expect(commonEnd([venueA, late, venueC], 2)).toBe(T0 + 60 * 19)
		expect(commonEnd([venueA], 3)).toBeNull()
	})
})

describe('perMinuteMedians', () => {
	test('one median per minute over the window, oldest first', () => {
		const out = perMinuteMedians([venueA, venueB], T0 + 60 * 19, 2)
		expect(out).toHaveLength(3)
		expect(out[2]).toBeCloseTo(p(19) * 1.0001, 9)
	})
	test('throws when a minute has no venue', () => {
		expect(() => perMinuteMedians([venueA], T0 + 60 * 25, 15)).toThrow(QuorumError)
	})
})

describe('realizedVolPerSqrtSec', () => {
	test('15 returns of exactly 0.001 give sqrt(15e-6/900)', () => {
		const prices = Array.from({ length: 16 }, (_, i) => p(i))
		expect(realizedVolPerSqrtSec(prices)).toBeCloseTo(1.2909944487358055e-4, 15)
	})
	test('48%/yr is sigmaE9 85,475 (unit check from the spec)', () => {
		expect(annualPctFromE9(85_475)).toBeCloseTo(48.0, 2)
	})
})

describe('dispersionBp', () => {
	test('farthest venue from the median, rounded up', () => {
		expect(dispersionBp([100, 100.02, 99.97], 100)).toBe(3)
		expect(dispersionBp([100, 100, 100], 100)).toBe(0)
	})
})

describe('priceToTick', () => {
	test('token order decides the sign', () => {
		expect(priceToTick(4500, true)).toBe(84122)
		expect(priceToTick(4500, false)).toBe(-84123)
		expect(priceToTick(1, true)).toBe(0)
	})
})

describe('estimate', () => {
	test('3 fresh venues out of 4: RV15 of the per-minute median, dispersion, tick', () => {
		const est = estimate({ nowSec: NOW, usdtUsd: 0.5, token0IsEth: true, series: [venueA, venueB, venueC, venueStale] })
		expect(est.sources).toEqual(['a', 'b', 'c'])
		expect(est.nSources).toBe(3)
		expect(est.tEnd).toBe(T0 + 60 * 19)
		expect(est.sigmaE9).toBe(129_099)
		expect(est.rv15E9).toBe(129_099)
		expect(est.dispBp).toBe(2)
		expect(est.priceE6).toBe(2_038_363_297)
		expect(est.refTick).toBe(76202)
	})
	test('USDT venue without a USDT/USD rate is dropped and quorum fails', () => {
		expect(() =>
			estimate({ nowSec: NOW, usdtUsd: null, token0IsEth: true, series: [venueA, venueB, venueC, venueStale] }),
		).toThrow('quorum 2/4 < 3')
	})
})
