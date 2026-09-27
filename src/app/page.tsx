/**
 * Homepage — Resolveo.
 *
 * AI-centric entry with professional design.
 * Search-first interaction for consumer problems.
 */
import type { Metadata } from "next";
import { HomePageClient } from "@/components/HomePageClient";

export const metadata: Metadata = {
  title: "Problemas de consumo: guías, derechos y cómo reclamar",
  description:
    "Problemas de consumo: compras, garantías, vuelos y servicios. Analiza tu caso con normativa vigente, fuentes verificables y pasos concretos para reclamar.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Resolveo — Entiende tu problema de consumo y resuélvelo",
    description:
      "Analiza tu problema de consumo con normativa vigente y fuentes verificables, o consulta las guías para saber tus derechos y cómo reclamar.",
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
