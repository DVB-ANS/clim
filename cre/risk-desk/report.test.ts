import { describe, expect, test } from 'bun:test'
import { buildReport, decodeRiskReport, encodeRiskReport, K_E4_NEUTRAL, type RiskReport, ZONE } from './report'

const REPORT: RiskReport = {
	tObs: 1_791_282_309,
	sigmaE9: 59_492,
	rv15E9: 59_492,
	dvolE2: 4_755,
	refTick: 79_065,
	dispBp: 2,
	nSources: 4,
	kE4: 10_000,
	zone: 0,
}

// Golden value from Foundry (independent encoder), i.e. what RiskDesk's abi.decode expects:
// cast abi-encode "f(uint40,uint32,uint32,uint16,int24,uint16,uint8,uint16,uint8)" 1791282309 59492 59492 4755 79065 2 4 10000 0
const GOLDEN =
	'0x' +
	'000000000000000000000000000000000000000000000000000000006ac4cc85' +
	'000000000000000000000000000000000000000000000000000000000000e864' +
	'000000000000000000000000000000000000000000000000000000000000e864' +
	'0000000000000000000000000000000000000000000000000000000000001293' +
	'00000000000000000000000000000000000000000000000000000000000134d9' +
	'0000000000000000000000000000000000000000000000000000000000000002' +
	'0000000000000000000000000000000000000000000000000000000000000004' +
	'0000000000000000000000000000000000000000000000000000000000002710' +
	'0000000000000000000000000000000000000000000000000000000000000000'

describe('encodeRiskReport', () => {
	test('matches the Foundry encoding word for word', () => {
		expect(encodeRiskReport(REPORT)).toBe(GOLDEN)
	})
	test('negative tick is sign-extended (two-complement int24 in a 32-byte word)', () => {
		const hex = encodeRiskReport({ ...REPORT, refTick: -79_066 })
		expect(hex.slice(2 + 64 * 4, 2 + 64 * 5)).toBe('fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffecb26')
	})
	test('round trip', () => {
		expect(decodeRiskReport(encodeRiskReport({ ...REPORT, refTick: -79_066 }))).toEqual({ ...REPORT, refTick: -79_066 })
	})
	test('rejects out-of-range or fractional fields', () => {
		expect(() => encodeRiskReport({ ...REPORT, sigmaE9: -1 })).toThrow(RangeError)
		expect(() => encodeRiskReport({ ...REPORT, dispBp: 1.5 })).toThrow('dispBp=1.5 outside [0, 65535]')
		expect(() => encodeRiskReport({ ...REPORT, refTick: 8_388_608 })).toThrow(RangeError)
	})
})

describe('buildReport', () => {
	test('rounds consensus medians and clamps to the field ranges', () => {
		const r = buildReport(
			{ sigmaE9: 59_492.5, rv15E9: 59_492.4, dvolE2: 4_755, refTick: -79_066.4, dispBp: 70_000, nSources: 3.5, priceE6: 2_713_815_000 },
			1_791_282_309.9,
		)
		expect(r).toEqual({
			tObs: 1_791_282_309,
			sigmaE9: 59_493,
			rv15E9: 59_492,
			dvolE2: 4_755,
			refTick: -79_066,
			dispBp: 65_535,
			nSources: 4,
			kE4: K_E4_NEUTRAL,
			zone: ZONE.UNVALIDATED,
		})
	})
})
