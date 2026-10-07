// End-to-end latency of the risk desk: for each RiskReported event, block.timestamp - tObs
// (DON observation time -> on-chain inclusion). Usage (from cre/risk-desk):
//   bun scripts/latency.ts <deskAddress> [blocks=600]
// RPC: SEPOLIA_RPC_URL, else the public Sepolia RPC. Bun loads .env from the working directory only, so
// to use the RPC in cre/.env add --env-file=../.env (or run bun risk-desk/scripts/latency.ts from cre/).
import { createPublicClient, http, parseAbiItem } from 'viem'
import { sepolia } from 'viem/chains'

const [desk, blocksArg] = process.argv.slice(2)
if (!desk || !/^0x[0-9a-fA-F]{40}$/.test(desk)) throw new Error('usage: bun scripts/latency.ts <deskAddress> [blocks]')
const client = createPublicClient({
	chain: sepolia,
	transport: http(process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'),
})
const event = parseAbiItem(
	'event RiskReported(uint32 indexed seq, uint40 tObs, uint32 sigmaApplied, uint32 sigmaReported, uint32 rv15E9, uint16 dvolE2, int24 refTick, uint16 dispBp, uint8 nSources, uint16 kE4, uint8 zone)',
)
const latest = await client.getBlockNumber()
const fromBlock = latest - BigInt(blocksArg ?? 600)
const logs = await client.getLogs({ address: desk as `0x${string}`, event, fromBlock, toBlock: latest })
const blockTime = new Map<bigint, number>()
const lat: number[] = []
for (const log of logs) {
	if (!blockTime.has(log.blockNumber)) {
		const b = await client.getBlock({ blockNumber: log.blockNumber })
		blockTime.set(log.blockNumber, Number(b.timestamp))
	}
	lat.push((blockTime.get(log.blockNumber) ?? 0) - Number(log.args.tObs))
}
lat.sort((a, b) => a - b)
const q = (p: number) => (lat.length === 0 ? Number.NaN : lat[Math.min(lat.length - 1, Math.floor(p * lat.length))])
console.log(`desk ${desk}: ${lat.length} reports in the last ${blocksArg ?? 600} blocks`)
console.log(`latency tObs -> block (s): min ${lat[0] ?? 'n/a'} median ${q(0.5)} p90 ${q(0.9)} max ${lat[lat.length - 1] ?? 'n/a'}`)
