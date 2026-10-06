import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // RainbowKit imports wagmi's baseAccount connector; on the server, @base-org/account loads its Node
  // entry, which pulls @coinbase/cdp-sdk and its lazy imports of optional @x402/* peers (x402 payments,
  // unused here). Loading these two packages from node_modules instead of bundling them keeps the lazy
  // imports lazy; the browser bundle uses @base-org/account's browser entry and is unaffected.
  serverExternalPackages: ["@base-org/account", "@coinbase/cdp-sdk"],
};

export default nextConfig;
