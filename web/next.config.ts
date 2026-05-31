import type { NextConfig } from "next";
import { webpackFallback } from "@txnlab/use-wallet-react";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/kmd/:path*",
        destination: "http://localhost:4002/:path*",
      },
    ];
  },
  // Prevent Next.js from bundling Prisma's native binary (.node file) —
  // it must be loaded by Node.js at runtime, not bundled by Turbopack/webpack.
  serverExternalPackages: ["@prisma/client", "prisma"],
  // Reduce Turbopack/webpack compilation scope for heavy packages — only
  // compiles the named exports actually used, instead of the entire library.
  experimental: {
    optimizePackageImports: ["algosdk", "@txnlab/use-wallet-react", "@txnlab/use-wallet"],
  },
  turbopack: {
    resolveAlias: {
      // Optional wallet deps loaded dynamically — stub them out for Turbopack
      "@agoralabs-sh/avm-web-provider": "./lib/empty-module.js",
      "lute-connect": "./lib/empty-module.js",
      "@walletconnect/modal": "./lib/empty-module.js",
      "@walletconnect/sign-client": "./lib/empty-module.js",
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
      "@walletconnect/modal": false,
      "@walletconnect/sign-client": false,
    };
    return config;
  },
};

export default nextConfig;
