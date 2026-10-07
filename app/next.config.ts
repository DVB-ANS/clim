import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // RainbowKit imports wagmi's baseAccount connector; on the server, @base-org/account loads its Node
  // entry, which pulls @coinbase/cdp-sdk and its lazy imports of optional @x402/* peers (x402 payments,
  // unused here). Loading these two packages from node_modules instead of bundling them keeps the lazy
  // imports lazy; the browser bundle uses @base-org/account's browser entry and is unaffected.
  serverExternalPackages: ["@base-org/account", "@coinbase/cdp-sdk"],
  // /swap and /lp build wallet transactions, so no other site may frame the app (clickjacking): X-Frame-
  // Options for older browsers, CSP frame-ancestors for the rest. The CSP carries that one directive and
  // nothing else: no script-src or connect-src, so RainbowKit, WalletConnect and the RPC calls load as
  // before. Referrer-Policy is the browsers' default, stated; RPC and WalletConnect allowlists read Origin.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
