/**
 * Guide layout — Resolveo.
 *
 * Shared chrome for the /guias cluster: breadcrumb, editorial header, the FAQ
 * and the related-problem links, all driven by `@/lib/guides` so the page body
 * only has to carry the explanation itself. The structured data describes what
 * is really on the page (a guide with its position in the site and the
 * questions it answers) and nothing else.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { getGuideBySlug } from "@/lib/guides";
import { getProblemBySlug } from "@/lib/problem-catalogue";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** `2026-09-22` → `22/09/2026`. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export function GuideLayout({ slug, children }: { slug: string; children: ReactNode }) {
  const guide = getGuideBySlug(slug);
  if (!guide) return null;

  const pageUrl = `${siteUrl}/guias/${guide.slug}`;

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Resolveo", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Guías", item: `${siteUrl}/guias` },
      { "@type": "ListItem", position: 3, name: guide.title, item: pageUrl },
    ],
  };

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: guide.title,
    description: guide.description,
    url: pageUrl,
    inLanguage: "es-ES",
    dateModified: guide.updatedAt,
    isPartOf: { "@type": "WebSite", name: "Resolveo", url: siteUrl },
  };

  const faqSchema =
    guide.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: guide.faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }
      : null;

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="bg-[var(--surface-paper)] border-b border-[var(--border-light)]">
        <div className="max-w-[800px] mx-auto px-5 md:px-8 py-12 md:py-16">
          {/* Visible breadcrumb, matching the BreadcrumbList above. */}
          <nav aria-label="Ruta de navegación" className="mb-6">
            <ol className="flex items-center gap-2 text-xs text-[var(--color-ink-faint)]">
              <li>
                <Link href="/" className="hover:text-[var(--color-ink)] transition-colors">
                  Inicio
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href="/guias" className="hover:text-[var(--color-ink)] transition-colors">
                  Guías
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-[var(--color-ink-muted)]">{guide.title}</li>
            </ol>
          </nav>

          <p className="label mb-3">Guía</p>
          <h1 className="mb-4">{guide.title}</h1>
          <p className="text-lg text-[var(--color-ink-muted)] leading-relaxed max-w-2xl">
            {guide.lead}
          </p>

          <p className="mt-5 text-xs text-[var(--color-ink-faint)]">
            Última revisión del contenido: {formatDate(guide.updatedAt)} ·{" "}
            <Link
              href="/fuentes"
              className="underline underline-offset-2 hover:text-[var(--color-ink-muted)] transition-colors"
            >
              Ver las fuentes que utiliza el análisis
            </Link>
          </p>
        </div>
      </section>

      {/* ── Body ─────────────────────────────────────────────── */}
      <section className="section bg-[var(--surface-page)]">
        <div className="max-w-[800px] mx-auto px-5 md:px-8">{children}</div>
      </section>
    </div>
  );
}

/** Shared FAQ block, rendered from the catalogue so it cannot drift. */
export function GuideFaq({ slug }: { slug: string }) {
  const guide = getGuideBySlug(slug);
  if (!guide || guide.faq.length === 0) return null;

  return (
    <div className="mt-12 pt-8 border-t border-[var(--border-light)]">
      <h2 className="label mb-4">Preguntas frecuentes</h2>
      <div className="space-y-5">
        {guide.faq.map((item) => (
          <div key={item.question}>
            <h3 className="text-sm font-semibold text-[var(--color-ink)] mb-1.5">
              {item.question}
            </h3>
            <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">{item.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Closes every guide the same way: to the problem pages it is about, and to the
 * analysis. Derived from `relatedSlugs`, so a guide always points somewhere and
 * the problem page points back.
 */
export function GuideFooter({ slug }: { slug: string }) {
  const guide = getGuideBySlug(slug);
  if (!guide) return null;

  const relatedProblems = guide.relatedSlugs
    .map((relatedSlug) => getProblemBySlug(relatedSlug))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  return (
    <>
      {relatedProblems.length > 0 && (
        <div className="mt-12 pt-8 border-t border-[var(--border-light)]">
          <h2 className="label mb-4">Analizar un caso concreto</h2>
          <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed mb-4">
            Esta guía explica el marco general. Para tu situación concreta, cada problema tiene su
            propio módulo de análisis, con reglas y fuentes verificables.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {relatedProblems.map((problem) => (
              <Link
                key={problem.slug}
                href={`/problemas/${problem.slug}`}
                className="block p-4 bg-[var(--surface-warm)] border border-[var(--border-light)] hover:border-[var(--color-ink-faint)] transition-colors"
              >
                <span className="block text-sm font-medium text-[var(--color-ink)] mb-1">
                  {problem.title}
                </span>
                <span className="block text-xs text-[var(--color-ink-muted)] leading-relaxed">
                  {problem.description}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-12 pt-8 border-t border-[var(--border-light)]">
        <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed mb-4">
          ¿Ya tienes claro tu caso? Describe lo que ha pasado y el análisis te dirá qué hechos
          importan, qué normas se aplican y qué pasos dar.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/resolver" className="btn-primary">
            Analizar mi caso
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <Link href="/como-funciona" className="btn-secondary">
            Cómo funciona el análisis
          </Link>
        </div>
      </div>
    </>
  );
}
