import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Hedera SDK is a heavy native-ish dependency with protobuf internals.
  // Bundling it breaks its instanceof / string-brand checks, so keep it external
  // and let the node runtime require it directly.
  serverExternalPackages: ["@hiero-ledger/sdk", "@hiero-ledger/proto"],
};

export default nextConfig;
