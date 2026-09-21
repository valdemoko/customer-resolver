/**
 * Case Layout — Resolveo.
 *
 * Adds noindex/nofollow to all /case/* routes.
 * Private pages must never be indexed by search engines.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default function CaseLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
