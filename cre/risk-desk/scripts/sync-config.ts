// Copies the RiskDesk addresses and the pool token order from shared/deployments/sepolia.json
// (written by plan 01) into the workflow configs. Usage (from cre/risk-desk): bun scripts/sync-config.ts
import { readFileSync, writeFileSync } from 'node:fs'

const DEPLOYMENTS = process.env.DEPLOYMENTS ?? '../../shared/deployments/sepolia.json'
// Key paths inside DEPLOYMENTS. If plan 01 named them differently, change them here and log it in docs/sessions.
// Shape agreed with plan 04 (shared/src/config.ts): tokens.<sym> = { address, symbol, decimals }, riskDesks.<pair> = address.
const KEYS = {
	tEth: 'tokens.tETH.address',
	tUsd: 'tokens.tUSD.address',
	desks: [
		['config.staging.json', 'riskDesks.live'],
		['config.replay.json', 'riskDesks.replay'],
		['config.production.json', 'riskDesks.don'],
	],
} as const

const dep: unknown = JSON.parse(readFileSync(DEPLOYMENTS, 'utf8'))
const get = (path: string): unknown =>
	path.split('.').reduce<unknown>((o, k) => (typeof o === 'object' && o !== null ? (o as Record<string, unknown>)[k] : undefined), dep)
const isAddr = (x: unknown): x is string => typeof x === 'string' && /^0x[0-9a-fA-F]{40}$/.test(x)

const tEth = get(KEYS.tEth)
const tUsd = get(KEYS.tUsd)
if (!isAddr(tEth) || !isAddr(tUsd)) throw new Error(`${DEPLOYMENTS}: missing ${KEYS.tEth} or ${KEYS.tUsd}`)
const token0IsEth = BigInt(tEth) < BigInt(tUsd)

for (const [file, key] of KEYS.desks) {
	const desk = get(key)
	if (!isAddr(desk)) {
		console.log(`${file}: ${key} not in deployments yet, unchanged`)
		continue
	}
	const cfg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
	cfg.deskAddress = desk
	cfg.token0IsEth = token0IsEth
	writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`)
	console.log(`${file}: deskAddress=${desk} token0IsEth=${token0IsEth}`)
}
