import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Typecheck is enforced separately (pnpm typecheck) and must never be skipped.
    ignoreBuildErrors: false,
  },
  eslint: {
    // Lint runs separately (pnpm lint) in CI; Next build does not re-run it.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
