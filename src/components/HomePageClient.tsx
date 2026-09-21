"use client";

/**
 * Homepage — Resolveo.
 *
 * Premium editorial design with sophisticated animations.
 * Warm, serious, trustworthy.
 */
import { SearchBar } from "@/components/SearchBar";
import Image from "next/image";
import Link from "next/link";
import { getAvailableProblems } from "@/lib/problem-catalogue";
import { useEffect, useRef, useState } from "react";

const AVAILABLE_PROBLEMS = getAvailableProblems();

/* ── Problem imagery — editorial, documentary style ─────────────── */
const PROBLEM_IMAGES: Record<string, string> = {
  "cancellation-charge": "/images/cancelacion-cargo.jpg",
  "no-delivery-refund": "/images/paquete-cancelado.jpg",
  "warranty-rejection": "/images/garantia.jpg",
  "flight-cancel": "/images/vuelo-cancelado.png",
} as const;

/* ── Scroll reveal hook ─────────────────────────────────────────── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );

    ref.current?.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return ref;
}

/* ── Animated phrase ─────────────────────────────────────────────── */
function AnimatedPhrase() {
  const phrases = [
    "Cuéntanos qué ha pasado.",
    "Ordenamos la información.",
    "Comprobamos lo importante.",
    "Te mostramos qué puedes hacer.",
  ];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % phrases.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [phrases.length]);

  return (
    <div className="h-8 flex items-center justify-center overflow-hidden">
      <p
        key={index}
        className="text-base md:text-lg text-[var(--color-ink-muted)] text-center anim-fade-in"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}
      >
        {phrases[index]}
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════════ */

export function HomePageClient() {
  const scrollRef = useReveal();

  return (
    <div ref={scrollRef}>

      {/* ══════════════════════════════════════════════════════════════
          HERO — Warm editorial with paper-like background
         ══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-[var(--surface-paper)]">
        {/* Subtle grid background — document/evidence inspired */}
        <div className="absolute inset-0 opacity-[0.015]" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(var(--color-ink) 1px, transparent 1px),
                linear-gradient(90deg, var(--color-ink) 1px, transparent 1px)
              `,
              backgroundSize: "80px 80px",
            }}
          />
        </div>

        {/* Subtle warm gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--surface-page)] via-transparent to-[var(--surface-paper)]" aria-hidden="true" />

        <div className="relative max-w-[800px] mx-auto px-5 md:px-8 pt-16 md:pt-24 pb-12 md:pb-16 text-center">

          {/* Label */}
          <p
            className="label anim-slide-up mb-6"
            style={{ animationDelay: "0ms" }}
          >
            Análisis de problemas de consumo
          </p>

          {/* Headline — editorial, large, serif */}
          <h1
            className="mb-5 anim-slide-up"
            style={{ animationDelay: "100ms" }}
          >
            Entiende tu problema.
            <br />
            <span className="text-[var(--color-accent)]">Resuélvelo.</span>
          </h1>

          {/* Sub-headline */}
          <p
            className="text-lg md:text-xl text-[var(--color-ink-muted)] max-w-lg mx-auto mb-10 leading-relaxed anim-slide-up"
            style={{ fontFamily: "var(--font-body)", animationDelay: "200ms" }}
          >
            Describe lo que ha pasado. Analizamos tu caso con normativa verificable y te mostramos qué puedes hacer.
          </p>

          {/* AI Input — central product interaction */}
          <div
            className="max-w-[640px] mx-auto anim-slide-up relative z-50"
            style={{ animationDelay: "300ms" }}
          >
            <SearchBar size="large" autoFocus />
          </div>

          {/* Animated phrase */}
          <div className="mt-8 anim-fade-in" style={{ animationDelay: "500ms" }}>
            <AnimatedPhrase />
          </div>

          {/* Trust indicators — editorial micro-labels */}
          <div
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-10 anim-fade-in"
            style={{ animationDelay: "600ms" }}
          >
            {[
              "Fuentes verificables",
              "Sin conclusiones inventadas",
              "Información trazable",
            ].map((text) => (
              <span key={text} className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
                {text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          PROBLEMS — Editorial list with images
         ══════════════════════════════════════════════════════════════ */}
      <section id="resolver" className="section bg-[var(--surface-page)]">
        <div className="max-w-[1000px] mx-auto px-5 md:px-8">

          {/* Section header */}
          <div className="reveal mb-12">
            <p className="label">Problemas disponibles</p>
            <h2>¿Qué necesitas resolver?</h2>
          </div>

          {/* Problem list — asymmetric editorial layout */}
          <div className="space-y-4 reveal-stagger">
            {AVAILABLE_PROBLEMS.map((problem, index) => (
              <Link
                key={problem.key}
                href={`/problemas/${problem.slug}`}
                className="reveal group block bg-[var(--surface-paper)] border border-[var(--border-light)] hover:border-[var(--border-strong)] transition-all duration-300"
                style={{ transitionDelay: `${index * 60}ms` }}
              >
                <div className="flex flex-col md:flex-row">
                  {/* Image */}
                  <div className="relative w-full md:w-48 h-40 md:h-auto overflow-hidden flex-shrink-0">
                    <Image
                      src={PROBLEM_IMAGES[problem.key] ?? ""}
                      alt={problem.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 192px"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[var(--surface-paper)]/10" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-5 md:p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[11px] font-medium tracking-wide text-[var(--color-ink-faint)] uppercase">
                          {problem.category}
                        </span>
                      </div>
                      <h3
                        className="text-xl md:text-2xl mb-2 group-hover:text-[var(--color-accent)] transition-colors"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {problem.title}
                      </h3>
                      <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed max-w-lg">
                        {problem.description}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors">
                        Saber más
                        <svg className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </span>
                      <span className="text-[10px] font-medium tracking-wide text-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5 rounded">
                        Disponible
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Other problems */}
          <div className="mt-10 reveal">
            <div className="flex items-center gap-4 p-5 bg-[var(--surface-warm)] border border-[var(--border-light)]">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-[var(--color-ink-faint)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--color-ink)]">Otro problema</p>
                <p className="text-xs text-[var(--color-ink-muted)]">Descríbelo con tus palabras y lo analizaremos con IA</p>
              </div>
              <Link href="/resolver" className="btn-ghost text-xs">
                Describir →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Divider ───────────────────────────────────────────────── */}
      <div className="max-w-[1000px] mx-auto px-5 md:px-8">
        <div className="divider" />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          PROCESS — How Resolveo works
         ══════════════════════════════════════════════════════════════ */}
      <section className="section bg-[var(--surface-paper)]">
        <div className="max-w-[1000px] mx-auto px-5 md:px-8">
          <div className="mb-14 reveal">
            <p className="label">Proceso</p>
            <h2>Cómo funciona</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 reveal-stagger">
            {[
              {
                step: "01",
                title: "Describe tu problema",
                description: "Explica lo que ha pasado con tus palabras. No necesitas conocimientos legales ni técnicos.",
              },
              {
                step: "02",
                title: "Organizamos los datos",
                description: "Estructuramos los hechos, revisamos documentos cuando los tienes, y aplicamos normativa verificable.",
              },
              {
                step: "03",
                title: "Te mostramos qué hacer",
                description: "Obtienes un análisis con fuentes identificadas, lo que se ha confirmado y los pasos concretos a seguir.",
              },
            ].map((item) => (
              <div key={item.step} className="reveal">
                <span
                  className="block text-5xl text-[var(--color-ink-whisper)] mb-4"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {item.step}
                </span>
                <h3
                  className="text-xl mb-2"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {item.title}
                </h3>
                <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Divider ───────────────────────────────────────────────── */}
      <div className="max-w-[1000px] mx-auto px-5 md:px-8">
        <div className="divider" />
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TRUST — Subtle, editorial trust indicators
         ══════════════════════════════════════════════════════════════ */}
      <section className="section bg-[var(--surface-page)]">
        <div className="max-w-[1000px] mx-auto px-5 md:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 reveal-stagger">
            {[
              {
                title: "Fuentes verificables",
                description: "Cada conclusión se apoya en legislación oficial o fuentes institucionales identificables.",
              },
              {
                title: "Sin conclusiones inventadas",
                description: "Si faltan datos o evidencia, el sistema lo indica. No se fabrican respuestas.",
              },
              {
                title: "Información trazable",
                description: "Cada paso del análisis está vinculado con los datos que proporcionaste.",
              },
            ].map((item) => (
              <div key={item.title} className="reveal p-5 bg-[var(--surface-paper)] border border-[var(--border-light)]">
                <h3
                  className="text-base mb-2"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {item.title}
                </h3>
                <p className="text-sm text-[var(--color-ink-muted)] leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════
          FINAL CTA — Dark, minimal
         ══════════════════════════════════════════════════════════════ */}
      <section className="section bg-[var(--color-ink)] relative overflow-hidden">
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.03]" aria-hidden="true">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `
                linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
              `,
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        <div className="relative max-w-[600px] mx-auto px-5 md:px-8 text-center reveal">
          <h2 className="text-white mb-4">¿Tienes un problema de consumo?</h2>
          <p className="text-[var(--color-ink-whisper)] mb-8 max-w-md mx-auto">
            Describe lo que ha pasado y empezamos a analizar tu caso.
          </p>
          <Link href="/resolver" className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[var(--color-ink)] font-medium text-sm hover:bg-[var(--surface-warm)] transition-colors">
            Empezar ahora
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  );
}
