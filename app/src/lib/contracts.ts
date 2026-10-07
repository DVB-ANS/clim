// Every contract the demo uses on Sepolia, grouped as in the README's "Deployed addresses" table, with an
// Etherscan link for each and a Sourcify link for the seven clim deployed and verified: its six own contracts
// and the arbitrage bot's router (Uniswap's unmodified PoolSwapTest, "match" on Sourcify since 2026-10-06).
import type { Address, Hex } from "viem";
import type { Deployments, Pair } from "./deployments";

export const ETHERSCAN = "https://sepolia.etherscan.io";
export const SOURCIFY_REPO = "https://repo.sourcify.dev/11155111";

export const etherscanAddress = (a: string) => `${ETHERSCAN}/address/${a}`;
export const etherscanTx = (h: string) => `${ETHERSCAN}/tx/${h}`;
export const sourcifyAddress = (a: string) => `${SOURCIFY_REPO}/${a}`;

export type ContractRow = { name: string; address: Address; role: string; verified: boolean };
export type ContractGroup = { title: string; rows: ContractRow[] };

/**
 * The PoolManager transaction that initialized each pool (its Initialize event), read with
 * `cast logs` on 2026-10-07. A pool has no address of its own, so its id links to that transaction.
 */
export const POOL_INIT_TX: Record<string, Hex> = {
  "0x49cad21621898dabc87e4267bf9446ec97c46b6b0918361356823cb2a81cd1e6": "0x5568b2037b83037de9f81c8b8d9ff8ad060a94ce46f057e087c6a97bebb44580",
  "0x0e4aeceb4d96dda2a3f9d5ae279024e1c3a954a774ca71fdb374cd0650a3abf0": "0x70758f31eecf09f02c8996aec263a251efa32b4d03effd58961030743d9bff3f",
  "0xc91db9c403696e8e72e7fac6c11ee502e558a96786ff2047492db5cab116b60f": "0xfe4c77eb320d9743d92f0c43ec04c4453e52a8a25a1d0d66c95756b6153be29e",
  "0x5ccceb29c89cd803efe580366751034ff1779b4f9c8409995dd193d10401c1f4": "0xf811b6d03b65a977b98c4220b0b2efd65635567a416243d7b5a092ff61eb06ef",
};

const PAIR_LABEL: Record<Pair, string> = { live: "live", replay: "replay" };

export function contractGroups(d: Deployments): ContractGroup[] {
  const row = (name: string, address: Address | undefined, role: string, verified = false): ContractRow[] =>
    address ? [{ name, address, role, verified }] : [];
  const clim: ContractRow[] = [];
  for (const p of ["live", "replay"] as Pair[]) {
    const pair = d.pairs[p];
    if (!pair) continue;
    clim.push(
      ...row(
        `RiskDesk (${PAIR_LABEL[p]})`,
        pair.riskDesk,
        p === "live" ? "receives the CRE report every 30 s" : "received the CRE reports of the 4 February 2026 storm, replayed; flagged REPLAY",
        true,
      ),
      ...row(
        `ClimHook (${PAIR_LABEL[p]})`,
        pair.hook,
        p === "live" ? "prices every swap of the live clim pool from the live desk" : "prices every swap of the replay clim pool from the replay desk",
        true,
      ),
    );
  }
  const groups: ContractGroup[] = [
    { title: "clim", rows: clim },
    {
      title: "Uniswap v4",
      rows: [
        ...row("PoolManager", d.uniswap.poolManager, "the v4 singleton; calls the hook on every swap"),
        ...row("StateView", d.uniswap.stateView, "pool state reads (prices, liquidity, positions)"),
        ...row("PoolSwapTest", d.uniswap.poolSwapTest, "test swap router: /swap and the retail bot"),
        ...row("PoolModifyLiquidityTest", d.uniswap.poolModifyLiquidityTest, "test liquidity router: /lp"),
      ],
    },
    {
      title: "Chainlink",
      rows: [
        ...row("MockKeystoneForwarder", d.chainlink.mockKeystoneForwarder, "delivers the reports of cre workflow simulate --broadcast; checks no signature"),
        ...row("KeystoneForwarder", d.chainlink.keystoneForwarder, "delivers DON-signed reports; for a DON deployment, not used by this demo"),
      ],
    },
    {
      title: "Test tokens and bots",
      rows: [
        ...row("tETH", d.tokens.tETH, "test ETH with a public faucet", true),
        ...row("tUSD", d.tokens.tUSD, "test USD with a public faucet", true),
        ...row("PoolSwapTest (arbitrage)", d.routers.arb, "the arbitrage bot's own router, so its swaps can be told apart", true),
      ],
    },
  ];
  return groups.filter((g) => g.rows.length > 0);
}

export type PoolRow = { name: string; poolId: Hex; fee: string; initTx?: Hex };

export function poolRows(d: Deployments, feeLabel: (pips: number) => string): PoolRow[] {
  const out: PoolRow[] = [];
  for (const p of ["live", "replay"] as Pair[]) {
    const pair = d.pairs[p];
    if (!pair) continue;
    out.push(
      { name: `clim pool V (${PAIR_LABEL[p]})`, poolId: pair.V.poolId, fee: "dynamic: set by ClimHook on every swap", initTx: POOL_INIT_TX[pair.V.poolId] },
      { name: `fixed-fee twin S (${PAIR_LABEL[p]})`, poolId: pair.S.poolId, fee: `${feeLabel(pair.S.key.fee)}, fixed`, initTx: POOL_INIT_TX[pair.S.poolId] },
    );
  }
  return out;
}
