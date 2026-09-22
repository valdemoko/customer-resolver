/**
 * Problemas — Resolveo.
 *
 * Public index of all supported consumer problems.
 * Each problem has a distinct visual frame.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { getAvailableProblems } from "@/lib/problem-catalogue";
import React from "react";

export const metadata: Metadata = {
  title: "Problemas de consumo",
  description:
    "Lista de problemas de consumo que Resolveo puede analizar: cancelaciones, compras, garantías, vuelos y más.",
  alternates: { canonical: "/problemas" },
  openGraph: {
    title: "Problemas de consumo — Resolveo",
    description:
      "Explora los problemas de consumo que podemos ayudarte a resolver con información verificada.",
    type: "website",
    locale: "es_ES",
    images: ["/og.png"],
  },
};

/* ── Problem icons ──────────────────────────────────────────────── */
const PROBLEM_ICONS: Record<string, React.ReactNode> = {
  "cancellation-charge": (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
      />
    </svg>
  ),
  "no-delivery-refund": (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
      />
    </svg>
  ),
  "warranty-rejection": (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  ),
  "flight-cancel": (
    <svg
      className="w-6 h-6"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
      />
    </svg>
  ),
};

export default function ProblemsIndexPage() {
  const available = getAvailableProblems();

  return (
    <div className="bg-[var(--surface-page)] min-h-screen">
      {/* ── Header ──────────────────────────────────────────────── */}
      <section className="bg-[var(--surface-paper)] border-b border-[var(--border-light)]">
        <div className="max-w-[800px] mx-auto px-5 md:px-8 py-12 md:py-16">
          <p className="label mb-3">Resolveo</p>
          <h1 className="mb-4">Problemas de consumo que podemos analizar</h1>
          <p className="text-lg text-[var(--color-ink-muted)] leading-relaxed max-w-2xl">
            Cada problema tiene su propio módulo de análisis, con reglas basadas en normativa
            vigente y fuentes verificables.
          </p>
        </div>
      </section>

      {/* ── Problems ────────────────────────────────────────────── */}
      <section className="section" aria-label="Problemas disponibles">
        <div className="max-w-[800px] mx-auto px-5 md:px-8">
          <p className="label mb-6">Disponibles</p>

          <div className="space-y-4">
            {available.map((problem, index) => (
              <Link
                key={problem.key}
                href={`/problemas/${problem.slug}`}
                className="group block bg-[var(--surface-paper)] border border-[var(--border-light)] hover:border-[var(--border-strong)] transition-all duration-200"
              >
                {/* Top accent line */}
                <div className="h-1 bg-[var(--color-accent)]/10 group-hover:bg-[var(--color-accent)]/20 transition-colors" />

                <div className="p-6 md:p-8">
                  <div className="flex flex-col md:flex-row md:items-start gap-5">
                    {/* Icon + number */}
                    <div className="flex-shrink-0 flex items-center gap-4">
                      {/* Problem number */}
                      <span
                        className="text-4xl text-[var(--color-ink-whisper)] group-hover:text-[var(--color-ink-faint)] transition-colors"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {/* Icon */}
                      <div className="w-10 h-10 rounded bg-[var(--surface-warm)] border border-[var(--border-light)] flex items-center justify-center text-[var(--color-ink-muted)] group-hover:text-[var(--color-accent)] group-hover:border-[var(--color-accent)]/20 transition-colors">
                        {PROBLEM_ICONS[problem.key]}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[10px] font-medium tracking-widest text-[var(--color-ink-faint)] uppercase">
                          {problem.category}
                        </span>
                        <span className="text-[10px] font-medium text-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5 rounded">
                          Disponible
                        </span>
                      </div>

                      <h2
                        className="text-xl md:text-2xl mb-2 group-hover:text-[var(--color-accent)] transition-colors"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {problem.title}
                      </h2>

                      <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed mb-4 max-w-xl">
                        {problem.description}
                      </p>

                      {/* Legal basis tags */}
                      <div className="flex flex-wrap gap-1.5">
                        {problem.legalBasis.slice(0, 2).map((basis) => (
                          <span
                            key={basis}
                            className="text-[10px] font-medium text-[var(--color-ink-faint)] bg-[var(--surface-warm)] border border-[var(--border-light)] px-2 py-0.5 rounded"
                          >
                            {basis}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex-shrink-0 self-center">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                        Ver detalles
                        <svg
                          className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8.25 4.5l7.5 7.5-7.5 7.5"
                          />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Divider ──────────────────────────────────────────────── */}
      <div className="max-w-[800px] mx-auto px-5 md:px-8">
        <div className="divider" />
      </div>

      {/* ── Other problems ───────────────────────────────────────── */}
      <section className="section" aria-label="Otros problemas">
        <div className="max-w-[800px] mx-auto px-5 md:px-8">
          <p className="label mb-4">Otros problemas</p>
          <div className="p-6 bg-[var(--surface-paper)] border border-[var(--border-light)]">
            <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed mb-4">
              Si tu problema no aparece en la lista, puedes describirlo con tus propias palabras. El
              sistema intentará identificar si hay un módulo compatible o te orientará sobre los
              pasos a seguir.
            </p>
            <Link href="/" className="btn-primary text-sm inline-flex">
              Describir mi problema
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
                />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Trust note ───────────────────────────────────────────── */}
      <div className="max-w-[800px] mx-auto px-5 md:px-8 pb-12">
        <p className="text-xs text-[var(--color-ink-faint)] leading-relaxed">
          Cada módulo utiliza normativa vigente en España. Las conclusiones se basan en la
          información que proporcionas y están vinculadas a fuentes verificables. Consulta{" "}
          <Link
            href="/como-funciona"
            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] underline underline-offset-2 transition-colors"
          >
            cómo funciona
          </Link>{" "}
          para más detalles.
        </p>
      </div>
    </div>
  );
}
