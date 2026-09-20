/**
 * Homepage — Consumer Resolver.
 *
 * Search-centric entry. The user describes their problem, we help them.
 * Editorial design, not a SaaS template.
 */
import { SearchBar } from "@/components/SearchBar";
import Link from "next/link";

const AVAILABLE_PROBLEMS = [
  {
    slug: "cancellation-charge",
    title: "Cancelación y cargos posteriores",
    description:
      "Cancelaste un servicio y te han cobrado después. Analizamos las fechas, el contrato y la normativa aplicable.",
    category: "Pagos y facturas",
  },
] as const;

const COMING_SOON = [
  { title: "Compras y reembolsos", category: "Compras" },
  { title: "Garantías y reparaciones", category: "Garantías" },
  { title: "Entregas y envíos", category: "Entregas" },
  { title: "Telecomunicaciones", category: "Contratos y servicios" },
  { title: "Suscripciones", category: "Suscripciones" },
] as const;

export default function HomePage() {
  return (
    <>
      {/* ════════════════════════════════════════════════════════════════
          HERO — Editorial, search-centric
         ════════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Background — subtle editorial tone */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-800 via-slate-800 to-slate-900" />
        {/* Subtle texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-5 md:px-8 pt-16 md:pt-24 pb-16 md:pb-20">
          <div className="max-w-2xl">
            {/* Eyebrow */}
            <p className="text-slate-400 text-sm font-medium tracking-wide uppercase mb-4 animate-fade-in">
              Consumo · España
            </p>

            {/* Headline */}
            <h1
              className="text-4xl md:text-5xl lg:text-[3.25rem] font-bold text-white leading-[1.1] mb-5 animate-fade-in"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Tienes un problema con una compra, una factura, un contrato o un servicio.
            </h1>

            {/* Sub-headline */}
            <p className="text-lg md:text-xl text-slate-300 leading-relaxed mb-10 max-w-xl animate-fade-in">
              Cuéntanos qué ha pasado. Consumer Resolver te ayuda a ordenar la información, entender
              qué puedes hacer y preparar el siguiente paso.
            </p>
          </div>

          {/* Search bar — hero element */}
          <div className="max-w-2xl animate-slide-up">
            <SearchBar size="large" autoFocus />
          </div>

          {/* Trust micro-signals */}
          <div className="flex flex-wrap items-center gap-6 mt-8 text-sm text-slate-400 animate-fade-in">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
              Información trazable
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
              Fuentes verificables
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
              Sin conclusiones inventadas
            </span>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          PROBLEMS — Available + Coming Soon
         ════════════════════════════════════════════════════════════════ */}
      <section id="resolver" className="cr-section">
        <div className="mx-auto max-w-6xl px-5 md:px-8">
          <div className="max-w-2xl mb-10">
            <h2
              className="text-2xl md:text-3xl font-bold text-slate-900 mb-3"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Problemas que podemos ayudarte a resolver
            </h2>
            <p className="text-slate-500 leading-relaxed">
              Selecciona un caso disponible o descríbelo con tus propias palabras.
            </p>
          </div>

          {/* Available — prominent */}
          <div className="stagger">
            {AVAILABLE_PROBLEMS.map((problem) => (
              <Link
                key={problem.slug}
                href={`/case/new?problem=${problem.slug}`}
                className="group block cr-elevated p-6 md:p-8 hover:shadow-lg hover:border-slate-300 transition-all duration-200 mb-4"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="cr-tag text-xs">{problem.category}</span>
                      <span className="cr-badge bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px]">
                        Disponible
                      </span>
                    </div>
                    <h3
                      className="text-xl font-semibold text-slate-900 mb-1.5 group-hover:text-slate-700 transition-colors"
                      style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
                    >
                      {problem.title}
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{problem.description}</p>
                  </div>
                  <div className="flex-shrink-0">
                    <span className="cr-btn-primary text-sm">
                      Comenzar
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
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Coming soon — subdued */}
          {COMING_SOON.length > 0 && (
            <div className="mt-8">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                Próximamente
              </p>
              <div className="flex flex-wrap gap-2">
                {COMING_SOON.map((p) => (
                  <span key={p.title} className="cr-tag opacity-60 cursor-default">
                    {p.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          HOW IT WORKS — Editorial, not four identical cards
         ════════════════════════════════════════════════════════════════ */}
      <section id="como-funciona" className="cr-section bg-white border-y border-slate-200/60">
        <div className="mx-auto max-w-6xl px-5 md:px-8">
          <div className="max-w-2xl mb-12">
            <h2
              className="text-2xl md:text-3xl font-bold text-slate-900 mb-3"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Cómo funciona
            </h2>
            <p className="text-slate-500 leading-relaxed">
              Cuatro pasos. Sin formularios eternos, sin letra pequeña.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-0">
            {/* Step 1 */}
            <div className="relative p-6 md:p-8 border-b md:border-b-0 md:border-r border-slate-100">
              <span className="text-5xl font-bold text-slate-100 font-serif absolute top-4 right-6 md:top-6 md:right-8 select-none">
                1
              </span>
              <div className="relative">
                <h3
                  className="text-lg font-semibold text-slate-900 mb-2"
                  style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
                >
                  Cuéntanos qué ha pasado
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Describe tu problema con tus palabras. No necesitas saber la categoría legal ni el
                  nombre exacto del problema.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative p-6 md:p-8 border-b border-slate-100">
              <span className="text-5xl font-bold text-slate-100 font-serif absolute top-4 right-6 md:top-6 md:right-8 select-none">
                2
              </span>
              <div className="relative">
                <h3
                  className="text-lg font-semibold text-slate-900 mb-2"
                  style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
                >
                  Añade la información que tengas
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Sube facturas, correos, contratos o capturas de pantalla. Cada documento se
                  convierte en evidencia estructurada.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative p-6 md:p-8 border-b md:border-b-0 md:border-r border-slate-100">
              <span className="text-5xl font-bold text-slate-100 font-serif absolute top-4 right-6 md:top-6 md:right-8 select-none">
                3
              </span>
              <div className="relative">
                <h3
                  className="text-lg font-semibold text-slate-900 mb-2"
                  style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
                >
                  Revisamos datos y fuentes
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  El sistema cruza tu información con la normativa vigente. Las conclusiones se
                  apoyan en fuentes registradas y verificables.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="relative p-6 md:p-8">
              <span className="text-5xl font-bold text-slate-100 font-serif absolute top-4 right-6 md:top-6 md:right-8 select-none">
                4
              </span>
              <div className="relative">
                <h3
                  className="text-lg font-semibold text-slate-900 mb-2"
                  style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
                >
                  Te mostramos qué puedes hacer
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Recibes un informe con claims verificados, pasos concretos y un plan de acciones
                  priorizado.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          TRUST — What makes Consumer Resolver different
         ════════════════════════════════════════════════════════════════ */}
      <section className="cr-section">
        <div className="mx-auto max-w-6xl px-5 md:px-8">
          <div className="max-w-2xl mb-12">
            <h2
              className="text-2xl md:text-3xl font-bold text-slate-900 mb-3"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Qué hace diferente a Consumer Resolver
            </h2>
            <p className="text-slate-500 leading-relaxed">
              No somos un chatbot ni un generador de textos genéricos. Cada paso tiene una
              fundamentación verificable.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 stagger">
            {/* Trust pillar 1 */}
            <div className="cr-surface p-6">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
                <svg
                  className="w-5 h-5 text-slate-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
              </div>
              <h3
                className="text-base font-semibold text-slate-900 mb-2"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                Información trazable
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Las conclusiones importantes se relacionan con los datos y las fuentes utilizadas.
                Puedes verificar cada paso.
              </p>
            </div>

            {/* Trust pillar 2 */}
            <div className="cr-surface p-6">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
                <svg
                  className="w-5 h-5 text-slate-600"
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
              </div>
              <h3
                className="text-base font-semibold text-slate-900 mb-2"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                Sin conclusiones inventadas
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Si falta información, te lo decimos. No completamos vacíos con suposiciones. La
                incertidumbre se marca como tal.
              </p>
            </div>

            {/* Trust pillar 3 */}
            <div className="cr-surface p-6">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
                <svg
                  className="w-5 h-5 text-slate-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
                  />
                </svg>
              </div>
              <h3
                className="text-base font-semibold text-slate-900 mb-2"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                Tus documentos son evidencia
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Los documentos aportados se procesan como información del caso, no como verdad
                automática. Cada dato se evalúa en contexto.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
