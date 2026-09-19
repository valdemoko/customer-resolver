import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

/**
 * Baseline metadata (Phase 0 SEO baseline, docs prompt §22).
 * `noindex` is forced in non-production environments via robots metadata
 * plus middleware header below. No fictional problem pages are published.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Consumer Resolver",
    template: "%s · Consumer Resolver",
  },
  description:
    "Consumer Resolver helps you turn a consumer problem into a structured case: facts, evidence, rules and clear next steps.",
  robots: process.env.NODE_ENV === "production" ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
