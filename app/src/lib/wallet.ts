// Wallet connect (Frontend scope upgrade): RainbowKit on wagmi 2 (RainbowKit 2.2 supports wagmi ^2),
// Sepolia only, the dashboard's RPCs. One wallet list: injected wallets always work; WalletConnect-based
// wallets are added only with a projectId, because RainbowKit refuses to build them without one.
// No metaMaskWallet: it loads the MetaMask SDK (@metamask/sdk, under ConsenSys's non-commercial licence)
// into the build. MetaMask is still listed, as an installed wallet announced through EIP-6963 (and the
// injected entry), and with a projectId on mobile through WalletConnect.
import { connectorsForWallets, type WalletList } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, fallback, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { rpcUrls } from "./chain";

/** WalletConnect Cloud project id (cloud.reown.com); optional. */
export const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "";

export function walletList(projectId: string): WalletList {
  if (!projectId) return [{ groupName: "Browser wallet", wallets: [injectedWallet] }];
  return [
    { groupName: "Popular", wallets: [injectedWallet, rabbyWallet, coinbaseWallet, rainbowWallet, walletConnectWallet] },
  ];
}

/** Installed wallets announced through EIP-6963 (MetaMask, Rabby, ...) are added by wagmi on top of the list. */
export function makeWagmiConfig(projectId: string = WC_PROJECT_ID) {
  return createConfig({
    chains: [sepolia],
    connectors: connectorsForWallets(walletList(projectId), { appName: "clim", projectId }),
    transports: { [sepolia.id]: fallback(rpcUrls().map((u) => http(u))) },
    ssr: true,
  });
}
