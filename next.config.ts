import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: [
    "@respan/respan",
    "@respan/tracing",
    "@respan/respan-sdk",
    "@respan/instrumentation-vercel",
  ],
};

export default nextConfig;
