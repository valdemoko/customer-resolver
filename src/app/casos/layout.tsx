/**
 * Casos Layout — Resolveo.
 *
 * Adds metadata and noindex to the case lookup page.
 * This is a functional utility page, not for SEO.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Consultar caso",
  description:
    "Consulta el estado, resultados y acciones disponibles de un caso existente de Resolveo.",
  alternates: { canonical: "/casos" },
  robots: { index: false, follow: false },
};

export default function CasosLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
