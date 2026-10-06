// Canonical CRE report (the contract between this workflow and RiskDesk._processReport) and the
// RiskDesk read ABI. Must match contracts/src/RiskDesk.sol and shared/abis/RiskDesk.json.
import { decodeAbiParameters, encodeAbiParameters, type Hex, parseAbi, parseAbiParameters } from 'viem'

export const REPORT_ABI = parseAbiParameters(
	'uint40 tObs, uint32 sigmaE9, uint32 rv15E9, uint16 dvolE2, int24 refTick, uint16 dispBp, uint8 nSources, uint16 kE4, uint8 zone',
)

export const RISK_DESK_ABI = parseAbi([
	'function state() view returns (uint40 tObs, uint32 sigmaE9, uint16 kE4, uint8 flags, uint32 seq)',
])

export const K_E4_NEUTRAL = 10_000 // k = 1: no model-risk multiplier in this version
export const ZONE = { UNVALIDATED: 0, GREEN: 1, YELLOW: 2, RED: 3 } as const
export const MIN_GAP_SEC = 20 // RiskDesk rejects tObs < last tObs + 20 s

export interface RiskReport {
	tObs: number
	sigmaE9: number
	rv15E9: number
	dvolE2: number
	refTick: number
	dispBp: number
	nSources: number
	kE4: number
	zone: number
}

export interface Observation {
	sigmaE9: number
	rv15E9: number
	dvolE2: number
	refTick: number
	dispBp: number
	nSources: number
	priceE6: number
}

const UINT16_MAX = 65_535
const UINT32_MAX = 4_294_967_295
const INT24_MIN = -8_388_608
const INT24_MAX = 8_388_607

const clampInt = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(x)))

// Rounds and clamps the consensus observation into the report's integer ranges.
export function buildReport(obs: Observation, tObs: number, kE4 = K_E4_NEUTRAL, zone: number = ZONE.UNVALIDATED): RiskReport {
	return {
		tObs: Math.floor(tObs),
		sigmaE9: clampInt(obs.sigmaE9, 0, UINT32_MAX),
		rv15E9: clampInt(obs.rv15E9, 0, UINT32_MAX),
		dvolE2: clampInt(obs.dvolE2, 0, UINT16_MAX),
		refTick: clampInt(obs.refTick, INT24_MIN, INT24_MAX),
		dispBp: clampInt(obs.dispBp, 0, UINT16_MAX),
		nSources: clampInt(obs.nSources, 0, 255),
		kE4: clampInt(kE4, 0, UINT16_MAX),
		zone: clampInt(zone, 0, 255),
	}
}

function assertInt(name: string, x: number, lo: number, hi: number): void {
	if (!Number.isInteger(x) || x < lo || x > hi) throw new RangeError(`${name}=${x} outside [${lo}, ${hi}]`)
}

export function encodeRiskReport(r: RiskReport): Hex {
	assertInt('tObs', r.tObs, 0, 2 ** 40 - 1)
	assertInt('sigmaE9', r.sigmaE9, 0, UINT32_MAX)
	assertInt('rv15E9', r.rv15E9, 0, UINT32_MAX)
	assertInt('dvolE2', r.dvolE2, 0, UINT16_MAX)
	assertInt('refTick', r.refTick, INT24_MIN, INT24_MAX)
	assertInt('dispBp', r.dispBp, 0, UINT16_MAX)
	assertInt('nSources', r.nSources, 0, 255)
	assertInt('kE4', r.kE4, 0, UINT16_MAX)
	assertInt('zone', r.zone, 0, 255)
	return encodeAbiParameters(REPORT_ABI, [
		r.tObs,
		r.sigmaE9,
		r.rv15E9,
		r.dvolE2,
		r.refTick,
		r.dispBp,
		r.nSources,
		r.kE4,
		r.zone,
	])
}

export function decodeRiskReport(data: Hex): RiskReport {
	const [tObs, sigmaE9, rv15E9, dvolE2, refTick, dispBp, nSources, kE4, zone] = decodeAbiParameters(REPORT_ABI, data)
	return { tObs, sigmaE9, rv15E9, dvolE2, refTick, dispBp, nSources, kE4, zone }
}
