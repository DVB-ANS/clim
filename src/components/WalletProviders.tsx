"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { darkTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { sepolia } from "wagmi/chains";
import { WALLET_THEME } from "@/lib/theme";
import { makeWagmiConfig } from "@/lib/wallet";

const config = makeWagmiConfig();

/** wagmi, TanStack Query and RainbowKit for every page (the connect button lives in the app, on the desk's dark theme). */
export function WalletProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider initialChain={sepolia} theme={darkTheme(WALLET_THEME)} appInfo={{ appName: "clim" }}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
