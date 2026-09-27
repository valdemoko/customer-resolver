/**
 * Guías — Resolveo.
 *
 * Hub for the explanatory guides. It exists so the guides are not orphan
 * pages: it states what they cover and, above all, when a guide is *not* what
 * the reader needs and the per-problem analysis is.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { GUIDES } from "@/lib/guides";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Guías de consumo",
  description:
    "Guías para entender el proceso alrededor de un problema de consumo: cómo reclamar, cómo devolver una compra online y qué derechos tienes ante un vuelo retrasado.",
  alternates: { canonical: "/guias" },
  openGraph: {
    title: "Guías de consumo — Resolveo",
    description:
      "Explicaciones sobre el proceso de reclamación, la devolución de compras online y los derechos del pasajero.",
    type: "website",
    locale: "es_ES",
    images: ["/og.png"],
  },
};

/** `2026-09-27` → `27/09/2026`. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export default function GuidesIndexPage() {
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Resolveo", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Guías", item: `${siteUrl}/guias` },
    ],
  };

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Guías de consumo",
    itemListElement: GUIDES.map((guide, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: guide.title,
      url: `${siteUrl}/guias/${guide.slug}`,
    })),
  };

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />

      {/* ── Header ──────────────────────────────────────────────── */}
      <section className="bg-[var(--surface-paper)] border-b border-[var(--border-light)]">
        <div className="max-w-[800px] mx-auto px-5 md:px-8 py-12 md:py-16">
          <p className="label mb-3">Resolveo</p>
          <h1 className="mb-4">Guías de consumo</h1>
          <p className="text-lg text-[var(--color-ink-muted)] leading-relaxed max-w-2xl">
            Las fichas de problema analizan un caso concreto. Estas guías explican el marco que hay
            alrededor: el proceso de reclamación, los derechos que no dependen del caso y los plazos
            que conviene conocer antes de empezar.
          </p>
        </div>
      </section>

      {/* ── Guides ──────────────────────────────────────────────── */}
      <section className="section bg-[var(--surface-page)]" aria-label="Guías disponibles">
        <div className="max-w-[800px] mx-auto px-5 md:px-8">
          <div className="space-y-4">
            {GUIDES.map((guide) => (
              <Link
                key={guide.slug}
                href={`/guias/${guide.slug}`}
                className="group block bg-[var(--surface-paper)] border border-[var(--border-light)] hover:border-[var(--border-strong)] transition-colors"
              >
                <div className="p-6 md:p-8">
                  <h2
                    className="text-xl md:text-2xl mb-2 group-hover:text-[var(--color-accent)] transition-colors"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {guide.title}
                  </h2>
                  <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed mb-4 max-w-2xl">
                    {guide.description}
                  </p>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-[var(--color-ink-faint)]">
                      Revisada el {formatDate(guide.updatedAt)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                      Leer la guía
                      <svg
                        className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Divider ─────────────────────────────────────────────── */}
      <div className="max-w-[800px] mx-auto px-5 md:px-8">
        <div className="divider" />
      </div>

      {/* ── When a guide is not what you need ───────────────────── */}
      <section className="section bg-[var(--surface-page)]" aria-label="Cuándo usar el análisis">
        <div className="max-w-[800px] mx-auto px-5 md:px-8">
          <h2 className="mb-4">¿Guía o análisis del caso?</h2>
          <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed mb-6 max-w-2xl">
            Una guía responde a una pregunta general y vale para cualquiera. El análisis responde a
            tu caso: cruza tus fechas, tus importes y tus comunicaciones con reglas vinculadas a
            normativa vigente y señala qué conclusión se sostiene y qué falta por saber.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/problemas" className="btn-secondary">
              Ver los problemas disponibles
            </Link>
            <Link href="/como-funciona" className="btn-secondary">
              Cómo funciona el análisis
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
