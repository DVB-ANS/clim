import { describe, expect } from 'bun:test'
import { EvmMock, HttpActionsMock, newTestRuntime, REPORT_METADATA_HEADER_LENGTH, test } from '@chainlink/cre-sdk/test'
import { bytesToHex, encodeFunctionResult, type Hex, hexToBytes } from 'viem'
import binance from './fixtures/binance.json'
import coinbase from './fixtures/coinbase.json'
import deribit from './fixtures/deribit.json'
import hyperliquid from './fixtures/hyperliquid.json'
import kraken from './fixtures/kraken.json'
import krakenUsdt from './fixtures/kraken_usdt.json'
import { decodeRiskReport, RISK_DESK_ABI, type RiskReport } from './report'
import { type Config, initWorkflow, onHttp, onTick } from './workflow'

const NOW = 1_791_282_309 // fixtures/now.txt
const SEPOLIA = 16_015_286_601_757_825_753n // ethereum-testnet-sepolia chain selector
const TX_HASH = `0x${'ab'.repeat(32)}` as Hex

const CONFIG: Config = {
	schedule: '*/30 * * * * *',
	deskAddress: '0x000000000000000000000000000000000000dEaD',
	chainSelectorName: 'ethereum-testnet-sepolia',
	gasLimit: '500000',
	venues: ['coinbase', 'kraken', 'binance', 'hyperliquid'],
	dvolUrl: 'https://www.deribit.com/api/v2/public/get_volatility_index_data',
	usdtUsdUrl: 'https://api.kraken.com/0/public/Ticker?pair=USDTUSD',
	mode: 'live',
	replayUrl: '',
	token0IsEth: true,
	httpAuthorizedKeys: [],
}

const EXPECTED: RiskReport = {
	tObs: NOW,
	sigmaE9: 59_492,
	rv15E9: 59_492,
	dvolE2: 4_755,
	refTick: 79_065,
	dispBp: 2,
	nSources: 4,
	kE4: 10_000,
	zone: 0,
}

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64')
const jsonBody = (x: unknown): string => b64(new TextEncoder().encode(JSON.stringify(x)))

function mockHttp(failing: string[] = []): string[] {
	const seen: string[] = []
	const http = HttpActionsMock.testInstance()
	http.sendRequest = (req) => {
		seen.push(`${req.method} ${req.url}`)
		const routes: Array<[string, unknown]> = [
			['https://api.coinbase.com/', coinbase],
			['https://api.kraken.com/0/public/OHLC', kraken],
			['https://data-api.binance.vision/', binance],
			['https://api.hyperliquid.xyz/info', hyperliquid],
			['https://www.deribit.com/', deribit],
			['https://api.kraken.com/0/public/Ticker', krakenUsdt],
		]
		const hit = routes.find(([prefix]) => req.url.startsWith(prefix))
		if (hit === undefined || failing.some((f) => req.url.startsWith(f))) {
			return { statusCode: 503, headers: {}, body: jsonBody({ error: 'unavailable' }) }
		}
		return { statusCode: 200, headers: {}, body: jsonBody(hit[1]) }
	}
	return seen
}

type State = [tObs: number, sigmaE9: number, kE4: number, flags: number, seq: number]

interface EvmOpts {
	states: State[] // returned by successive state() reads; the last one repeats
	receiver?: 'SUCCESS' | 'REVERTED'
	txHash?: Hex | null // null: dry run (no hash)
}

function mockEvm({ states, receiver = 'SUCCESS', txHash = TX_HASH }: EvmOpts): RiskReport[] {
	const written: RiskReport[] = []
	let reads = 0
	const evm = EvmMock.testInstance(SEPOLIA)
	evm.callContract = () => {
		const s = states[Math.min(reads++, states.length - 1)]
		return { data: b64(hexToBytes(encodeFunctionResult({ abi: RISK_DESK_ABI, functionName: 'state', result: s }))) }
	}
	evm.writeReport = (req) => {
		const raw = req.report?.rawReport ?? new Uint8Array()
		written.push(decodeRiskReport(bytesToHex(raw.slice(REPORT_METADATA_HEADER_LENGTH))))
		return {
			txStatus: 'TX_STATUS_SUCCESS',
			receiverContractExecutionStatus: `RECEIVER_CONTRACT_EXECUTION_STATUS_${receiver}`,
			...(txHash === null ? {} : { txHash: b64(hexToBytes(txHash)) }),
		}
	}
	return written
}

const BEFORE: State = [NOW - 30, 50_000, 10_000, 0, 7]
const AFTER: State = [NOW, 59_492, 10_000, 0, 8]

function runtimeAt(nowSec: number, config: Config = CONFIG) {
	const runtime = newTestRuntime(null, { timeProvider: () => nowSec * 1000 })
	;(runtime as unknown as { config: Config }).config = config
	return runtime
}

describe('onTick (live)', () => {
	test('fetches 6 sources, reaches consensus, writes the canonical report, confirms it on-chain', () => {
		const seen = mockHttp()
		const written = mockEvm({ states: [BEFORE, AFTER] })
		const runtime = runtimeAt(NOW)

		expect(onTick(runtime as never)).toBe(`OK ${TX_HASH}`)
		expect(seen).toHaveLength(6)
		expect(seen).toContain('POST https://api.hyperliquid.xyz/info')
		expect(written).toEqual([EXPECTED])
		const logs = runtime.getLogs().join('\n')
		expect(logs).toContain('consensus: sigma=33.4%/yr sigmaE9=59492 n=4 disp=2bp tick=79065 dvol=47.55')
		expect(logs).toContain('desk before: seq=7')
		expect(logs).toContain(`Write report transaction succeeded: ${TX_HASH}`) // parsed by plan 04's sim-loop
		expect(logs).toContain('REPORT applied seq=8 sigmaReported=33.4% sigmaApplied=33.4%')
	})

	test('dry run: no tx hash, nothing to confirm', () => {
		mockHttp()
		mockEvm({ states: [BEFORE], txHash: null })
		expect(onTick(runtimeAt(NOW) as never)).toBe('DRY RUN')
	})

	test('state unchanged after a successful forwarder tx means RiskDesk rejected the report', () => {
		mockHttp()
		mockEvm({ states: [BEFORE, BEFORE] })
		expect(onTick(runtimeAt(NOW) as never)).toBe(`NOT_APPLIED ${TX_HASH}`)
	})

	test('unreadable desk state: writes anyway (RiskDesk enforces the gap) and reports SENT', () => {
		mockHttp()
		const written = mockEvm({ states: [] })
		EvmMock.testInstance(SEPOLIA).callContract = () => {
			throw new Error('rpc down')
		}
		const runtime = runtimeAt(NOW)
		expect(onTick(runtime as never)).toBe(`SENT ${TX_HASH}`)
		expect(written).toEqual([EXPECTED])
		expect(runtime.getLogs().join('\n')).toContain('desk state unreadable: rpc down')
	})

	test('receiver REVERTED status (DON forwarder) is reported as REJECTED', () => {
		mockHttp()
		mockEvm({ states: [BEFORE], receiver: 'REVERTED' })
		expect(onTick(runtimeAt(NOW) as never)).toBe(`REJECTED ${TX_HASH}`)
	})

	test('skips when the last report is younger than MIN_GAP (20 s)', () => {
		mockHttp()
		const written = mockEvm({ states: [[NOW - 10, 50_000, 10_000, 0, 7]] })
		expect(onTick(runtimeAt(NOW) as never)).toBe('SKIP: min gap')
		expect(written).toHaveLength(0)
	})

	test('no report when fewer than 3 venues answer', () => {
		mockHttp(['https://api.coinbase.com/', 'https://api.kraken.com/0/public/OHLC'])
		const written = mockEvm({ states: [BEFORE] })
		const runtime = runtimeAt(NOW)
		expect(onTick(runtime as never)).toBe('SKIP: quorum 2/4 < 3')
		expect(written).toHaveLength(0)
		const logs = runtime.getLogs().join('\n')
		expect(logs).toContain('source dropped: coinbase: HTTP 503')
		expect(logs).toContain('clim: no report (quorum 2/4 < 3)') // parsed by plan 04's sim-loop
	})
})

describe('onTick (replay)', () => {
	test('one Binance-format call per venue on replayUrl; prices used as USD; dispersion 0', () => {
		const seen: string[] = []
		const http = HttpActionsMock.testInstance()
		http.sendRequest = (req) => {
			seen.push(req.url)
			return { statusCode: 200, headers: {}, body: jsonBody(binance) } // the server replays one series
		}
		const written = mockEvm({ states: [BEFORE, [NOW, 61_531, 10_000, 2, 8]] })
		const replay: Config = { ...CONFIG, mode: 'replay', replayUrl: 'http://127.0.0.1:8787' }

		expect(onTick(runtimeAt(NOW, replay) as never)).toBe(`OK ${TX_HASH}`)
		expect(seen).toEqual(
			CONFIG.venues.map((v) => `http://127.0.0.1:8787/venue/${v}/api/v3/klines?symbol=ETHUSDT&interval=1m&limit=20`),
		)
		expect(written).toEqual([
			{ ...EXPECTED, sigmaE9: 61_531, rv15E9: 61_531, dvolE2: 0, refTick: 79_067, dispBp: 0, nSources: 4 },
		])
	})
})

describe('initWorkflow', () => {
	test('[0] cron every 30 s, [1] HTTP trigger running the same tick', () => {
		const handlers = initWorkflow(CONFIG)
		expect(handlers).toHaveLength(2)
		expect((handlers[0].trigger as unknown as { config: { schedule: string } }).config.schedule).toBe('*/30 * * * * *')
		expect(handlers[1].fn).toBe(onHttp)
	})
})
