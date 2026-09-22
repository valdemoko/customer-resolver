/**
 * Cómo funciona — Resolveo.
 *
 * Explains the resolution process and, above all, *demonstrates* it: the
 * traceability section is generated from a real module's rules and sources
 * (see `getProblemTrace`), so what the page shows is what the analysis does.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { TraceDemo } from "@/components/TraceDemo";
import { getProblemBySlug } from "@/lib/problem-catalogue";
import { getProblemTrace } from "@/lib/trace";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "Cómo funciona Resolveo: describes el problema, identificamos los hechos relevantes, comprobamos las reglas aplicables, contrastamos las fuentes oficiales y generamos una conclusión trazable.",
  alternates: { canonical: "/como-funciona" },
  openGraph: {
    title: "Cómo funciona — Resolveo",
    description:
      "Proceso de análisis de problemas de consumo con normativa vigente y fuentes verificables.",
    type: "website",
    locale: "es_ES",
    images: ["/og.png"],
  },
};

const STEPS = [
  {
    number: "1",
    title: "Describes tu problema",
    body: "Con tus propias palabras. No necesitas conocer la categoría legal ni el nombre exacto del problema. Si ya sabes cuál es, puedes elegirlo en la lista y el análisis empieza directamente por las preguntas.",
  },
  {
    number: "2",
    title: "Identificamos los hechos relevantes",
    body: "El sistema te pide únicamente los datos que las reglas del módulo leen: fechas, importes, comunicaciones y documentación. Nada se da por supuesto, y puedes completar o corregir cualquier dato antes del análisis.",
  },
  {
    number: "3",
    title: "Comprobamos las reglas aplicables",
    body: "Cada hecho se contrasta con reglas deterministas escritas a partir de normativa vigente. La coincidencia no es una estimación: una regla se cumple, no se cumple, entra en contradicción o falta información para decidirla.",
  },
  {
    number: "4",
    title: "Contrastamos las fuentes oficiales",
    body: "Cada regla solo puede publicarse con al menos una fuente verificada: texto publicado en el BOE o en EUR-Lex, con artículo, versión consultada y fecha de consulta. Una regla sin fuente no se evalúa.",
  },
  {
    number: "5",
    title: "Generamos una conclusión trazable",
    body: "El informe muestra qué hechos ha leído cada conclusión, qué regla se ha aplicado y con qué fuente. Si algo no puede determinarse, se declara como información insuficiente en lugar de rellenarse con una suposición.",
  },
];

export default function HowItWorksPage() {
  // Real module: its own rules, facts and sources. Nothing written by hand here.
  const demoProblem = getProblemBySlug("vuelo-cancelado");
  const demo = demoProblem
    ? {
        trace: getProblemTrace(demoProblem.key, demoProblem.title),
        scenario: demoProblem.example.scenario,
        outcome: demoProblem.example.outcome,
      }
    : null;

  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-12 md:py-16">
      {/* Header */}
      <header className="mb-12">
        <p className="text-slate-400 text-sm font-medium tracking-wide uppercase mb-3">Resolveo</p>
        <h1
          className="text-3xl md:text-4xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Cómo funciona
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed">
          Cinco pasos para transformar un problema de consumo en un análisis estructurado,
          verificable y con acciones concretas.
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
                <p className="text-sm text-slate-500 leading-relaxed">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Traceability demo — generated from the real rule set */}
      {demo && (
        <section className="mb-14" aria-label="Demostración de trazabilidad">
          <h2
            className="text-2xl font-bold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Así se traza una conclusión
          </h2>
          <p className="text-slate-500 leading-relaxed mb-6">
            Esta demostración se genera a partir de las reglas y las fuentes reales del problema «
            {demoProblem?.title}». Los hechos que verás son los que el cuestionario recoge; las
            reglas, las que el motor evalúa; y las fuentes, las que el sistema cita al concluir.
          </p>

          <TraceDemo
            trace={demo.trace}
            scenario={demo.scenario}
            outcome={demo.outcome}
            variant="compact"
          />

          <p className="text-sm text-slate-500 leading-relaxed mt-6">
            El registro completo, con la versión consultada de cada norma y el texto del artículo
            aplicado, está en{" "}
            <Link
              href="/fuentes"
              className="text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors"
            >
              Fuentes normativas
            </Link>
            .
          </p>
        </section>
      )}

      {/* Two types of problems */}
      <section className="mb-14">
        <h2
          className="text-2xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Dos formas de empezar
        </h2>

        <div className="space-y-4">
          {/* Deterministic entry */}
          <div className="cr-surface p-6">
            <div className="flex items-start gap-3 mb-3">
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">Eliges el problema</h3>
                <p className="text-sm text-slate-500 leading-relaxed mt-1">
                  Si tu problema está en la lista (cancelación y cargo, pedido no entregado,
                  garantía rechazada, vuelo cancelado), el caso se crea directamente con su módulo y
                  pasas al cuestionario. No hay interpretación por medio: se aplican reglas
                  deterministas basadas en normativa verificada, con trazabilidad completa hasta la
                  fuente oficial.
                </p>
              </div>
            </div>
          </div>

          {/* Free description */}
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
                <h3 className="font-semibold text-slate-900">Describes el problema</h3>
                <p className="text-sm text-slate-500 leading-relaxed mt-1">
                  Si no aparece en la lista, cuéntalo con tus palabras: el sistema intenta
                  identificar a qué módulo corresponde. Si no existe ninguno aplicable, lo dice y te
                  orienta sobre los siguientes pasos en lugar de inventar conclusiones. Y si el
                  análisis automático no está disponible, la lista de problemas sigue ahí para
                  continuar.
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
          Cada regla de análisis está vinculada a una fuente oficial concreta: BOE, EUR-Lex,
          normativa publicada. Las fuentes incluyen versión, fecha de consulta y estado de
          verificación.
        </p>
        <p className="text-slate-500 leading-relaxed mb-6">
          Cuando el sistema muestra una conclusión, puedes verificar a qué normativa se remite. Si
          la información no es suficiente para una conclusión, el sistema lo declara explícitamente
          en lugar de inventar una respuesta.
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
            No es un despacho de abogados ni sustituye asesoría legal profesional.
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
            No resuelve litigios judiciales ni presenta reclamaciones en tu nombre.
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
          Descríbelo con tus palabras o elige el problema en la lista.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
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
          <Link href="/problemas" className="cr-btn-secondary inline-flex">
            Ver los problemas disponibles
          </Link>
        </div>
      </section>
    </div>
  );
}
