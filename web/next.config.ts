import type { NextConfig } from "next";
import { webpackFallback } from "@txnlab/use-wallet-react";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    resolveAlias: {
      // Optional wallet deps loaded dynamically — stub them out for Turbopack
      "@agoralabs-sh/avm-web-provider": "./lib/empty-module.js",
      "lute-connect": "./lib/empty-module.js",
    },
  },
  // Webpack fallback: prevents bundling optional native deps from wallet packages
  // (sodium-native, etc.) in webpack builds (Vercel, older environments).
  // Why? These deps are only used in dynamic imports for native environments, so safe to ignore in webpack builds.
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      ...webpackFallback,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      // Optional wallet deps loaded dynamically — don't bundle them
      "@agoralabs-sh/avm-web-provider": false,
      "lute-connect": false,
    };
    return config;
  },
};

export default nextConfig;
