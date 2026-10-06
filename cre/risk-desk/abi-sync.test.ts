import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { type Abi, type AbiEvent, type AbiFunction, toEventSignature, toFunctionSignature } from 'viem'
import { REPORT_ABI, RISK_DESK_ABI } from './report'

// shared/abis/RiskDesk.json is exported from contracts/out by plan 01 (raw ABI array or a forge artifact).
const PATH = process.env.RISK_DESK_ABI ?? '../../shared/abis/RiskDesk.json'
const exported = existsSync(PATH) ? (JSON.parse(readFileSync(PATH, 'utf8')) as Abi | { abi: Abi }) : null
const abi: Abi = exported === null ? [] : Array.isArray(exported) ? exported : exported.abi

const fn = (name: string) => abi.find((x): x is AbiFunction => x.type === 'function' && x.name === name)
const ev = (name: string) => abi.find((x): x is AbiEvent => x.type === 'event' && x.name === name)

describe.skipIf(exported === null)('RiskDesk ABI matches the workflow', () => {
	test('state() has the outputs the workflow decodes', () => {
		const ours = RISK_DESK_ABI[0]
		expect(fn('state')?.outputs.map((o) => o.type)).toEqual(ours.outputs.map((o) => o.type))
	})
	test('onReport(bytes,bytes) exists', () => {
		const f = fn('onReport')
		expect(f === undefined ? '' : toFunctionSignature(f)).toBe('onReport(bytes,bytes)')
	})
	test('RiskReported carries every report field, in report order, after seq and sigmaApplied', () => {
		const e = ev('RiskReported')
		expect(e === undefined ? '' : toEventSignature(e)).toBe(
			'RiskReported(uint32,uint40,uint32,uint32,uint32,uint16,int24,uint16,uint8,uint16,uint8)',
		)
		expect(e?.inputs[0].indexed).toBe(true)
		// report fields minus tObs/sigmaE9 must line up with the event tail
		expect(e?.inputs.slice(4).map((i) => i.type)).toEqual(REPORT_ABI.slice(2).map((p) => p.type))
	})
})
