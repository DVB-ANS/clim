import { deployments } from "@/lib/config";
import { contractGroups, etherscanAddress, etherscanTx, poolRows, sourcifyAddress } from "@/lib/contracts";
import { formatBp, pipsToBp } from "@/lib/units";
import { Panel } from "./ui";

const link = "text-link underline decoration-line underline-offset-2 hover:decoration-current";
const short = (a: string) => `${a.slice(0, 10)}…${a.slice(-4)}`;

/** Every contract of the demo on Sepolia, from the synced deployment: Etherscan for all, Sourcify for those clim deployed. */
export function ContractsPanel({ id = "contracts" }: { id?: string }) {
  const groups = contractGroups(deployments);
  const pools = poolRows(deployments, (pips) => formatBp(pipsToBp(pips), 2));
  return (
    <Panel
      id={id}
      title="Contracts on Sepolia"
      subtitle="Ethereum Sepolia (chain id 11155111). Every address links to Etherscan; the source of every contract clim deployed (its six own contracts and the arbitrage bot's router) is verified on Sourcify."
    >
      <div className="overflow-x-auto" role="region" aria-label="Contract addresses" tabIndex={0}>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-subtle">
              <th className="pb-2 pr-6 font-normal">Contract</th>
              <th className="pb-2 pr-6 font-normal">Address</th>
              <th className="pb-2 pr-6 font-normal">Source</th>
              <th className="pb-2 font-normal">Role</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.title} className="border-t border-line">
              <tr>
                <th colSpan={4} className="pb-1 pt-3 text-left font-display text-[15px] font-normal">{g.title}</th>
              </tr>
              {g.rows.map((r) => (
                <tr key={`${g.title}:${r.name}`} className="align-top">
                  <td className="py-1 pr-6 whitespace-nowrap"><code className="text-[13px]">{r.name}</code></td>
                  <td className="py-1 pr-6 whitespace-nowrap">
                    <a className={`${link} font-mono text-[13px]`} href={etherscanAddress(r.address)} target="_blank" rel="noreferrer" title={r.address}>
                      {short(r.address)}
                    </a>
                  </td>
                  <td className="py-1 pr-6 whitespace-nowrap">
                    {r.verified ? (
                      <a className={link} href={sourcifyAddress(r.address)} target="_blank" rel="noreferrer">Sourcify</a>
                    ) : (
                      <span className="text-fg-subtle">–</span>
                    )}
                  </td>
                  <td className="py-1 text-fg-muted">{r.role}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      {pools.length ? (
        <div className="mt-5 overflow-x-auto" role="region" aria-label="Pool ids" tabIndex={0}>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-subtle">
                <th className="pb-2 pr-6 font-normal">Pool (tETH / tUSD, tick spacing 60)</th>
                <th className="pb-2 pr-6 font-normal">Pool id</th>
                <th className="pb-2 pr-6 font-normal">Created</th>
                <th className="pb-2 font-normal">LP fee</th>
              </tr>
            </thead>
            <tbody className="border-t border-line">
              {pools.map((p) => (
                <tr key={p.poolId} className="align-top">
                  <td className="py-1 pr-6 whitespace-nowrap">{p.name}</td>
                  <td className="py-1 pr-6 whitespace-nowrap"><code className="text-[13px]" title={p.poolId}>{short(p.poolId)}</code></td>
                  <td className="py-1 pr-6 whitespace-nowrap">
                    {p.initTx ? (
                      <a className={link} href={etherscanTx(p.initTx)} target="_blank" rel="noreferrer">Initialize tx</a>
                    ) : (
                      <span className="text-fg-subtle">–</span>
                    )}
                  </td>
                  <td className="py-1 text-fg-muted">{p.fee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-fg-subtle">
        The full addresses, pool keys and pool ids are in{" "}
        <a className={link} href="https://github.com/DVB-ANS/clim/blob/main/shared/deployments/sepolia.json" target="_blank" rel="noreferrer">
          shared/deployments/sepolia.json
        </a>
        .
      </p>
    </Panel>
  );
}
