/**
 * Homepage — Resolveo.
 *
 * AI-centric entry with professional design.
 * Search-first interaction for consumer problems.
 */
import type { Metadata } from "next";
import { HomePageClient } from "@/components/HomePageClient";

export const metadata: Metadata = {
  title: "Resolveo — Resolución de problemas",
  description:
    "Describe tu problema. Analizamos tu caso con normativa vigente y te mostramos qué puedes hacer.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Resolveo",
    description:
      "Resuelve problemas con información estructurada, fuentes verificables y pasos claros.",
    type: "website",
    locale: "es_ES",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Resolveo — Entiende tu problema. Resuélvelo.",
      },
    ],
  },
};

export default function HomePage() {
  return <HomePageClient />;
}
