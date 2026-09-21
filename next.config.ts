import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
];

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
  headers: async () => [
    {
      source: "/(.*)",
      headers: securityHeaders,
    },
  ],
};

export default nextConfig;
