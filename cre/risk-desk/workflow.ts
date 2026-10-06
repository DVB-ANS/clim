// clim risk desk: every 30 s, measure multi-venue ETH realized volatility, reach DON consensus
// field by field (median), and write the signed report to RiskDesk.onReport on Sepolia.
import {
	bytesToHex,
	ConsensusAggregationByFields,
	type CronPayload,
	CronCapability,
	EVMClient,
	encodeCallMsg,
	getNetwork,
	HTTPCapability,
	type HTTPPayload,
	handler,
	LATEST_BLOCK_NUMBER,
	median,
	type NodeRuntime,
	prepareReportRequest,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import { EVM_PB } from '@chainlink/cre-sdk/pb'
import { type Address, decodeFunctionResult, encodeFunctionData, zeroAddress } from 'viem'
import { z } from 'zod'
import { annualPctFromE9, estimate } from './estimator'
import {
	buildReport,
	encodeRiskReport,
	MIN_GAP_SEC,
	type Observation,
	RISK_DESK_ABI,
} from './report'
import { fetchLive, fetchReplay, VENUES } from './venues'

export const configSchema = z.object({
	schedule: z.string(),
	deskAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
	chainSelectorName: z.string(),
	gasLimit: z.string(),
	venues: z.array(z.enum(VENUES)).min(3),
	dvolUrl: z.string(),
	usdtUsdUrl: z.string(),
	mode: z.enum(['live', 'replay']),
	replayUrl: z.string(),
	token0IsEth: z.boolean(),
	httpAuthorizedKeys: z.array(z.string()),
})

export type Config = z.infer<typeof configSchema>

export interface DeskState {
	tObs: number
	sigmaE9: number
	kE4: number
	flags: number
	seq: number
}

const pct = (sigmaE9: number): string => annualPctFromE9(sigmaE9).toFixed(1)

// Runs on every node: fetch the sources, estimate, return one observation for consensus.
export const observe = (nodeRuntime: NodeRuntime<Config>, nowSec: number): Observation => {
	const cfg = nodeRuntime.config
	const input =
		cfg.mode === 'replay'
			? fetchReplay(nodeRuntime, cfg.replayUrl, cfg.venues, nowSec)
			: fetchLive(nodeRuntime, cfg.venues, cfg.dvolUrl, cfg.usdtUsdUrl, nowSec)
	for (const note of input.notes) nodeRuntime.log(`source dropped: ${note}`)
	const est = estimate({
		nowSec: input.nowSec,
		usdtUsd: input.usdtUsd,
		token0IsEth: cfg.token0IsEth,
		series: input.series,
	})
	const dvolE2 = input.dvol === null ? 0 : Math.round(input.dvol * 100)
	nodeRuntime.log(
		`node: sources=${est.sources.join(',')} n=${est.nSources} tEnd=${est.tEnd} price=${(est.priceE6 / 1e6).toFixed(2)} rv15=${pct(est.rv15E9)}% disp=${est.dispBp}bp tick=${est.refTick} dvol=${(dvolE2 / 100).toFixed(2)}`,
	)
	return {
		sigmaE9: est.sigmaE9,
		rv15E9: est.rv15E9,
		dvolE2,
		refTick: est.refTick,
		dispBp: est.dispBp,
		nSources: est.nSources,
		priceE6: est.priceE6,
	}
}

export const observationAggregation = ConsensusAggregationByFields<Observation>({
	sigmaE9: median,
	rv15E9: median,
	dvolE2: median,
	refTick: median,
	dispBp: median,
	nSources: median,
	priceE6: median,
})

function evmClientFor(cfg: Config): EVMClient {
	const network = getNetwork({ chainFamily: 'evm', chainSelectorName: cfg.chainSelectorName, isTestnet: true })
	if (!network) throw new Error(`unknown chainSelectorName ${cfg.chainSelectorName}`)
	return new EVMClient(network.chainSelector.selector)
}

export function readDeskState(runtime: Runtime<Config>, evm: EVMClient): DeskState | null {
	try {
		const reply = evm
			.callContract(runtime, {
				call: encodeCallMsg({
					from: zeroAddress,
					to: runtime.config.deskAddress as Address,
					data: encodeFunctionData({ abi: RISK_DESK_ABI, functionName: 'state' }),
				}),
				blockNumber: LATEST_BLOCK_NUMBER,
			})
			.result()
		const [tObs, sigmaE9, kE4, flags, seq] = decodeFunctionResult({
			abi: RISK_DESK_ABI,
			functionName: 'state',
			data: bytesToHex(reply.data),
		})
		return { tObs, sigmaE9, kE4, flags, seq }
	} catch (e) {
		runtime.log(`desk state unreadable: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`)
		return null
	}
}

export const onTick = (runtime: Runtime<Config>): string => {
	const cfg = runtime.config
	const tObs = Math.floor(runtime.now().getTime() / 1000)

	let obs: Observation
	try {
		obs = runtime.runInNodeMode(observe, observationAggregation)(tObs).result()
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e)
		runtime.log(`clim: no report (${msg})`)
		return `SKIP: ${msg}`
	}

	const report = buildReport(obs, tObs)
	runtime.log(
		`consensus: sigma=${pct(report.sigmaE9)}%/yr sigmaE9=${report.sigmaE9} n=${report.nSources} disp=${report.dispBp}bp tick=${report.refTick} dvol=${(report.dvolE2 / 100).toFixed(2)} price=${(obs.priceE6 / 1e6).toFixed(2)} tObs=${report.tObs}`,
	)
	if (report.nSources < 3) {
		runtime.log(`clim: no report (consensus nSources=${report.nSources} < 3)`)
		return 'SKIP: quorum'
	}

	const evm = evmClientFor(cfg)
	const prev = readDeskState(runtime, evm)
	if (prev !== null) {
		runtime.log(`desk before: seq=${prev.seq} tObs=${prev.tObs} sigma=${pct(prev.sigmaE9)}%/yr flags=${prev.flags}`)
		if (prev.tObs > 0 && report.tObs < prev.tObs + MIN_GAP_SEC) {
			runtime.log(`clim: no report (${report.tObs - prev.tObs} s since the last report < ${MIN_GAP_SEC} s)`)
			return 'SKIP: min gap'
		}
	}

	const signed = runtime.report(prepareReportRequest(encodeRiskReport(report))).result()
	const reply = evm
		.writeReport(runtime, {
			receiver: cfg.deskAddress,
			report: signed,
			gasConfig: { gasLimit: cfg.gasLimit },
		})
		.result()
	const txHash = bytesToHex(reply.txHash ?? new Uint8Array(32))
	if (reply.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`writeReport failed: status=${reply.txStatus} ${reply.errorMessage ?? ''} tx=${txHash}`)
	}
	// Exact line parsed by plan 04's bots/src/sim-loop.ts (the CRE docs and templates format).
	runtime.log(`Write report transaction succeeded: ${txHash}`)
	if (reply.receiverContractExecutionStatus === EVM_PB.ReceiverContractExecutionStatus.REVERTED) {
		runtime.log(`REJECTED by RiskDesk (onReport reverted) tx=${txHash}`)
		return `REJECTED ${txHash}`
	}
	if (/^0x0+$/.test(txHash)) {
		runtime.log(`DRY RUN: report encoded and simulated, not broadcast (sigmaE9=${report.sigmaE9})`)
		return 'DRY RUN'
	}
	// The forwarders never revert when the receiver reverts (they emit ReportProcessed(result=false)),
	// and the simulator then still reports receiver SUCCESS: re-read the desk to know if it applied.
	const after = readDeskState(runtime, evm)
	if (after === null) {
		runtime.log(`REPORT sent, desk state unreadable after tx=${txHash}`)
		return `SENT ${txHash}`
	}
	if (after.tObs === report.tObs) {
		runtime.log(
			`REPORT applied seq=${after.seq} sigmaReported=${pct(report.sigmaE9)}% sigmaApplied=${pct(after.sigmaE9)}% flags=${after.flags} tx=${txHash}`,
		)
		return `OK ${txHash}`
	}
	runtime.log(
		`NOT APPLIED: RiskDesk state unchanged at the latest block after tx=${txHash} (rejected inside the forwarder, or the RPC read lagged: check ReportProcessed)`,
	)
	return `NOT_APPLIED ${txHash}`
}

export const onCron = (runtime: Runtime<Config>, _payload: CronPayload): string => onTick(runtime)
export const onHttp = (runtime: Runtime<Config>, _payload: HTTPPayload): string => onTick(runtime)

export function initWorkflow(config: Config) {
	const cron = new CronCapability()
	const http = new HTTPCapability()
	return [
		handler(cron.trigger({ schedule: config.schedule }), onCron),
		handler(
			http.trigger({
				authorizedKeys: config.httpAuthorizedKeys.map((publicKey) => ({
					type: 'KEY_TYPE_ECDSA_EVM' as const,
					publicKey,
				})),
			}),
			onHttp,
		),
	]
}
