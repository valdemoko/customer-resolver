/**
 * Problema Libre Layout — Resolveo.
 *
 * Adds noindex to the free-form problem entry page.
 * This is a utility page, not for SEO.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ProblemaLibreLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
