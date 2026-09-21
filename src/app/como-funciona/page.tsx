/**
 * Cómo funciona — Resolveo.
 *
 * Explains the resolution process, the difference between
 * specific resolvers and universal intake, and how sources work.
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "Cómo funciona Resolveo: describe tu problema, aporta información, se analiza con normativa vigente y obtienes un resultado estructurado con fuentes verificables.",
  alternates: { canonical: "/como-funciona" },
  openGraph: {
    title: "Cómo funciona — Resolveo",
    description:
      "Proceso de análisis de problemas de consumo con normativa vigente y fuentes verificables.",
    type: "website",
    locale: "es_ES",
  },
};

const STEPS = [
  {
    number: "1",
    title: "Describe tu problema",
    body: "Cuéntanos qué ha pasado con tus propias palabras. No necesitas conocer la categoría legal ni el nombre exacto del problema.",
  },
  {
    number: "2",
    title: "Confirmamos los datos",
    body: "El sistema te hará preguntas concretas para completar la información necesaria: fechas, importes, comunicaciones, documentación.",
  },
  {
    number: "3",
    title: "Aportas evidencia",
    body: "Puedes subir facturas, correos, contratos o capturas de pantalla. Cada documento se procesa como evidencia estructurada del caso.",
  },
  {
    number: "4",
    title: "Se cruza información con normativa",
    body: "El sistema evalúa los datos confirmados contra reglas basadas en normativa vigente. Las conclusiones se apoyan en fuentes registradas y verificables.",
  },
  {
    number: "5",
    title: "Obtienes un resultado",
    body: "Recibes un informe con claims verificados, fuentes consultadas, acciones recomendadas y próximos pasos concretos.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-12 md:py-16">
      {/* Header */}
      <header className="mb-12">
        <p className="text-slate-400 text-sm font-medium tracking-wide uppercase mb-3">
          Resolveo
        </p>
        <h1
          className="text-3xl md:text-4xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Cómo funciona
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed">
          Cinco pasos para transformar un problema de consumo en un análisis
          estructurado, verificable y con acciones concretas.
        </p>
      </header>

      {/* Steps */}
      <section className="mb-14" aria-label="Proceso">
        <ol className="space-y-0">
          {STEPS.map((step) => (
            <li
              key={step.number}
              className="relative flex gap-6 py-6 border-b border-slate-100 last:border-0"
            >
              <span
                className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg font-bold text-slate-500"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                {step.number}
              </span>
              <div>
                <h2
                  className="text-lg font-semibold text-slate-900 mb-1"
                  style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
                >
                  {step.title}
                </h2>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Two types of problems */}
      <section className="mb-14">
        <h2
          className="text-2xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Dos tipos de problemas
        </h2>

        <div className="space-y-4">
          {/* Specific resolver */}
          <div className="cr-surface p-6">
            <div className="flex items-start gap-3 mb-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-emerald-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">
                  Resolver específico
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed mt-1">
                  Cuando tu problema coincide con un módulo disponible (cancelación
                  y cargo, pedido no entregado, garantía rechazada, vuelo
                  cancelado), el sistema aplica reglas deterministas basadas en
                  normativa verificada. Cada conclusión tiene trazabilidad completa
                  hasta la fuente oficial.
                </p>
              </div>
            </div>
          </div>

          {/* Universal intake */}
          <div className="cr-surface p-6">
            <div className="flex items-start gap-3 mb-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-slate-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">
                  Problema sin módulo específico
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed mt-1">
                  Si tu problema no tiene un resolver dedicado, el sistema recoge
                  la información mediante entrada universal. Intenta identificar
                  patrones relevantes, pero no genera conclusiones jurídicas
                  inventadas. Te orienta sobre los siguientes pasos y te indica
                  cuándo un módulo específico esté disponible.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sources */}
      <section className="mb-14">
        <h2
          className="text-2xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Las fuentes importan
        </h2>
        <p className="text-slate-500 leading-relaxed mb-4">
          Cada regla de análisis está vinculada a una fuente oficial concreta:
          BOE, EUR-Lex, normativa publicada. Las fuentes incluyen versión,
          fecha de consulta y estado de verificación.
        </p>
        <p className="text-slate-500 leading-relaxed mb-6">
          Cuando el sistema muestra una conclusión, puedes verificar a qué
          normativa se remite. Si la información no es suficiente para una
          conclusión, el sistema lo declara explícitamente en lugar de inventar
          una respuesta.
        </p>
        <Link
          href="/fuentes"
          className="text-sm text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors"
        >
          Ver nuestras fuentes →
        </Link>
      </section>

      {/* What it's NOT */}
      <section className="mb-14">
        <h2
          className="text-2xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Qué no es Resolveo
        </h2>
        <ul className="space-y-2 text-sm text-slate-500 leading-relaxed">
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
            No es un despacho de abogados ni sustituye asesoría legal
            profesional.
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
            No resuelve litigios judiciales ni presenta reclamaciones en tu
            nombre.
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
            No garantiza resultados específicos en reclamaciones.
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
            No genera conclusiones jurídicas a partir de información incompleta.
          </li>
        </ul>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-200/60 pt-10 text-center">
        <h2
          className="text-xl font-semibold text-slate-900 mb-2"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          ¿Tienes un problema de consumo?
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Descríbelo con tus palabras y empezaremos a analizarlo.
        </p>
        <Link href="/" className="cr-btn-primary inline-flex">
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
        </Link>
      </section>
    </div>
  );
}
