/**
 * Problem Detail Page — Resolveo.
 *
 * Premium editorial design for individual problem pages.
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PROBLEM_CATALOGUE, getProblemBySlug } from "@/lib/problem-catalogue";


/* ── Problem images ─────────────────────────────────────────────── */
const PROBLEM_IMAGES: Record<string, string> = {
  "cancellation-charge": "/images/cancelacion-cargo.jpg",
  "no-delivery-refund": "/images/paquete-cancelado.jpg",
  "warranty-rejection": "/images/garantia.jpg",
  "flight-cancel": "/images/vuelo-cancelado.png",
} as const;

/* ── Static params ──────────────────────────────────────────────── */
export function generateStaticParams() {
  return PROBLEM_CATALOGUE.map((p) => ({ slug: p.slug }));
}

/* ── Metadata ───────────────────────────────────────────────────── */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const problem = getProblemBySlug(slug);
  if (!problem) return {};
  return {
    title: `${problem.title} — Análisis`,
    description: problem.description,
    alternates: { canonical: `/problemas/${problem.slug}` },
    openGraph: {
      title: `${problem.title} — Resolveo`,
      description: problem.description,
      type: "article",
      locale: "es_ES",
    },
  };
}

/* ── Page ───────────────────────────────────────────────────────── */
export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const problem = getProblemBySlug(slug);

  if (!problem) {
    notFound();
  }

  const imageUrl = PROBLEM_IMAGES[problem.key];

  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative bg-[var(--surface-paper)] border-b border-[var(--border-light)]">
        {imageUrl && (
          <div className="absolute inset-0 overflow-hidden">
            <Image
              src={imageUrl}
              alt=""
              fill
              sizes="100vw"
              priority
              className="object-cover opacity-[0.07]"
            />
          </div>
        )}

        <div className="relative max-w-[800px] mx-auto px-5 md:px-8 py-12 md:py-16">
          <Link
            href="/problemas"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors mb-6"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Problemas
          </Link>

          <p className="label mb-3">{problem.category}</p>
          <h1 className="mb-4">{problem.title}</h1>
          <p className="text-lg text-[var(--color-ink-muted)] leading-relaxed max-w-2xl">
            {problem.description}
          </p>
        </div>
      </section>

      {/* ── Content ──────────────────────────────────────────── */}
      <section className="section bg-[var(--surface-page)]">
        <div className="max-w-[800px] mx-auto px-5 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">

            {/* Left — What we analyze */}
            <div>
              <p className="label mb-4">Qué analizamos</p>
              <ul className="space-y-3">
                {problem.whatWeAnalyze.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-[var(--color-ink-soft)] leading-relaxed">
                    <span className="flex-shrink-0 w-1 h-1 rounded-full bg-[var(--color-accent)] mt-2" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — What you get */}
            <div>
              <p className="label mb-4">Qué obtienes</p>
              <ul className="space-y-3">
                {problem.whatYouGet.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-[var(--color-ink-soft)] leading-relaxed">
                    <span className="flex-shrink-0 w-1 h-1 rounded-full bg-[var(--color-ink)] mt-2" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── Saber más ─────────────────────────────────────── */}
          <div className="mt-12 pt-8 border-t border-[var(--border-light)]">
            <p className="label mb-6">Saber más</p>

            <div className="space-y-8">
              {/* Key facts */}
              <div>
                <h3 className="text-lg mb-3" style={{ fontFamily: "var(--font-display)" }}>Datos importantes</h3>
                <ul className="space-y-2">
                  {problem.saberMas.keyFacts.map((fact) => (
                    <li key={fact} className="flex items-start gap-3 text-sm text-[var(--color-ink-soft)] leading-relaxed">
                      <span className="flex-shrink-0 w-1 h-1 rounded-full bg-[var(--color-accent)] mt-2" />
                      {fact}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Important dates */}
              <div>
                <h3 className="text-lg mb-3" style={{ fontFamily: "var(--font-display)" }}>Fechas relevantes</h3>
                <ul className="space-y-2">
                  {problem.saberMas.importantDates.map((date) => (
                    <li key={date} className="flex items-start gap-3 text-sm text-[var(--color-ink-soft)] leading-relaxed">
                      <span className="flex-shrink-0 w-1 h-1 rounded-full bg-[var(--color-ink)] mt-2" />
                      {date}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Evidence */}
              <div>
                <h3 className="text-lg mb-3" style={{ fontFamily: "var(--font-display)" }}>Documentos útiles</h3>
                <div className="flex flex-wrap gap-2">
                  {problem.saberMas.evidenceTypes.map((ev) => (
                    <span key={ev} className="text-xs font-medium text-[var(--color-ink-muted)] bg-[var(--surface-warm)] border border-[var(--border-light)] px-3 py-1.5 rounded">
                      {ev}
                    </span>
                  ))}
                </div>
              </div>

              {/* Common mistakes */}
              <div>
                <h3 className="text-lg mb-3" style={{ fontFamily: "var(--font-display)" }}>Errores comunes</h3>
                <ul className="space-y-2">
                  {problem.saberMas.commonMistakes.map((mistake) => (
                    <li key={mistake} className="flex items-start gap-3 text-sm text-[var(--color-ink-soft)] leading-relaxed">
                      <span className="flex-shrink-0 w-1 h-1 rounded-full bg-[var(--color-contradicted)] mt-2" />
                      {mistake}
                    </li>
                  ))}
                </ul>
              </div>

              {/* What we verify */}
              <div>
                <h3 className="text-lg mb-3" style={{ fontFamily: "var(--font-display)" }}>Qué verificamos</h3>
                <ul className="space-y-2">
                  {problem.saberMas.whatWeVerify.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-[var(--color-ink-soft)] leading-relaxed">
                      <span className="flex-shrink-0 w-1 h-1 rounded-full bg-[var(--color-accent)] mt-2" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* ── Legal basis ───────────────────────────────────── */}
          <div className="mt-12 pt-8 border-t border-[var(--border-light)]">
            <p className="label mb-3">Base legal</p>
            <div className="flex flex-wrap gap-2">
              {problem.legalBasis.map((basis) => (
                <span key={basis} className="text-xs font-medium text-[var(--color-ink-muted)] bg-[var(--surface-warm)] border border-[var(--border-light)] px-3 py-1.5 rounded">
                  {basis}
                </span>
              ))}
            </div>
          </div>

          {/* ── Limitations ───────────────────────────────────── */}
          <div className="mt-8 p-4 bg-[var(--surface-warm)] border border-[var(--border-light)]">
            <p className="text-xs font-medium text-[var(--color-ink-faint)] uppercase tracking-wider mb-2">Limitaciones</p>
            <ul className="space-y-1">
              {problem.limitations.map((limit) => (
                <li key={limit} className="text-xs text-[var(--color-ink-muted)] leading-relaxed">
                  {limit}
                </li>
              ))}
            </ul>
          </div>

          {/* ── CTA ───────────────────────────────────────────── */}
          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Link
              href={`/resolver?q=${encodeURIComponent(problem.title)}`}
              className="btn-primary"
            >
              Analizar mi caso
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <Link href="/" className="btn-secondary">
              Volver al inicio
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
