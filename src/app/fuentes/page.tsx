/**
 * Fuentes — Resolveo.
 *
 * Explains the source philosophy and lists the actual official
 * sources used by each problem module.
 *
 * ALL sources listed here are real and verified against the project's
 * Source Registry (rules.ts in each module).
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Fuentes normativas",
  description:
    "Fuentes oficiales que utiliza Resolveo para cada análisis: TRLGDCU, Reglamento 261/2004, Código Civil y Ley General de Telecomunicaciones.",
  alternates: { canonical: "/fuentes" },
  openGraph: {
    title: "Fuentes normativas — Resolveo",
    description:
      "Fuentes oficiales verificadas que sustentan cada análisis de Resolveo.",
    type: "website",
    locale: "es_ES",
  },
};

interface SourceEntry {
  name: string;
  type: string;
  scope: string;
  modules: string[];
  keyArticles: string[];
}

const SOURCES: SourceEntry[] = [
  {
    name: "Real Decreto Legislativo 1/2007, de 16 de noviembre, por el que se aprueba el texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios (TRLGDCU)",
    type: "Legislación nacional",
    scope: "España",
    modules: ["cancellation-charge", "no-delivery-refund", "warranty-rejection"],
    keyArticles: [
      "Art. 66 bis — Entrega de bienes y plazos",
      "Art. 97 — Información precontractual",
      "Art. 109 — Ejecución del contrato a distancia",
      "Arts. 114-125 — Conformidad de bienes (garantía)",
      "Art. 121 — Carga de la prueba (presunción de 2 años)",
      "Art. 122 — Suspensión de plazos",
      "Art. 120 — Plazos para manifestar la falta de conformidad",
    ],
  },
  {
    name: "Reglamento (CE) n.º 261/2004 del Parlamento Europeo y del Consejo",
    type: "Reglamento europeo",
    scope: "Unión Europea (directamente aplicable en España)",
    modules: ["flight-cancel"],
    keyArticles: [
      "Art. 5 — Cancelación del vuelo y excepciones",
      "Art. 7 — Derecho a compensación (250/400/600 EUR)",
      "Art. 8 — Reembolso y transporte alternativo",
      "Art. 9 — Derecho a asistencia",
    ],
  },
  {
    name: "Ley 11/2022, de 28 de junio, General de Telecomunicaciones",
    type: "Legislación nacional",
    scope: "España",
    modules: ["cancellation-charge"],
    keyArticles: [
      "Art. 102.2 — Penalización por cobro tras desistimiento",
    ],
  },
  {
    name: "Código Civil (Real Decreto de 24 de julio de 1889)",
    type: "Legislación nacional",
    scope: "España",
    modules: ["no-delivery-refund"],
    keyArticles: [
      "Art. 1124 — Resolución por incumplimiento recíproco",
    ],
  },
];

export default function SourcesPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-12 md:py-16">
      {/* Header */}
      <header className="mb-10">
        <p className="text-slate-400 text-sm font-medium tracking-wide uppercase mb-3">
          Resolveo
        </p>
        <h1
          className="text-3xl md:text-4xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Fuentes normativas
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed">
          Cada análisis de Resolveo se apoya en fuentes oficiales
          verificadas. No utilizamos blogs jurídicos como fuente primaria ni
          inventamos normativa.
        </p>
      </header>

      {/* Philosophy */}
      <section className="mb-12">
        <h2
          className="text-xl font-semibold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Nuestra filosofía de fuentes
        </h2>
        <div className="space-y-3 text-sm text-slate-500 leading-relaxed">
          <p>
            Resolveo utiliza exclusivamente fuentes con autoridad
            normativa: legislación nacional publicada en el BOE, reglamentos
            europeos publicados en EUR-Lex y normativa consolidada de organismos
            oficiales.
          </p>
          <p>
            Cada regla de análisis referencia una fuente concreta con artículo,
            versión y fecha de consulta. Si una cuestión no puede determinarse
            con la normativa disponible, el sistema lo declara como{" "}
            <span className="font-medium text-slate-700">INSUFFICIENT_DATA</span>{" "}
            en lugar de inventar una respuesta.
          </p>
          <p>
            Las fuentes se verifican periódicamente y cada entrada incluye el
            estado de verificación: si la normativa sigue vigente, si ha sido
            modificada o si existen interpretaciones relevantes del Tribunal de
            Justicia de la UE.
          </p>
        </div>
      </section>

      {/* Sources list */}
      <section className="mb-12">
        <h2
          className="text-xl font-semibold text-slate-900 mb-6"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Fuentes registradas
        </h2>
        <div className="space-y-6">
          {SOURCES.map((source) => (
            <div key={source.name} className="cr-surface p-6">
              <div className="flex items-start gap-3 mb-3">
                <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
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
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                    />
                  </svg>
                </span>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 text-sm leading-snug mb-1">
                    {source.name}
                  </h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="text-[11px] text-slate-400 bg-slate-50 rounded px-2 py-0.5">
                      {source.type}
                    </span>
                    <span className="text-[11px] text-slate-400 bg-slate-50 rounded px-2 py-0.5">
                      {source.scope}
                    </span>
                  </div>
                </div>
              </div>

              {/* Key articles */}
              <div className="ml-11">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">
                  Artículos utilizados
                </p>
                <ul className="space-y-1.5">
                  {source.keyArticles.map((article) => (
                    <li
                      key={article}
                      className="text-sm text-slate-600 flex items-start gap-2"
                    >
                      <span className="text-slate-300 mt-0.5">•</span>
                      {article}
                    </li>
                  ))}
                </ul>

                {/* Modules using this source */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {source.modules.map((mod) => (
                    <span
                      key={mod}
                      className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded px-2 py-0.5"
                    >
                      {mod}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Verification process */}
      <section className="mb-12">
        <h2
          className="text-xl font-semibold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Proceso de verificación
        </h2>
        <div className="space-y-3 text-sm text-slate-500 leading-relaxed">
          <p>
            Cada fuente registrada incluye:
          </p>
          <ul className="space-y-2 ml-4">
            <li className="flex items-start gap-2">
              <span className="text-slate-300 mt-0.5">•</span>
              <strong className="text-slate-700">Identificador único</strong> —
              para referencia interna y trazabilidad.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-300 mt-0.5">•</span>
              <strong className="text-slate-700">Jurisdicción</strong> — país o
              ámbito de aplicación.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-300 mt-0.5">•</span>
              <strong className="text-slate-700">Fecha de publicación y
              vigencia</strong> — para confirmar que la normativa sigue en
              vigor.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-300 mt-0.5">•</span>
              <strong className="text-slate-700">Estado de verificación</strong>{" "}
              — revisada y verificada por equipo humano.
            </li>
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-200/60 pt-10 text-center">
        <Link
          href="/como-funciona"
          className="text-sm text-slate-500 hover:text-slate-700 underline underline-offset-2 transition-colors"
        >
          ¿Cómo utilizamos estas fuentes? → Cómo funciona
        </Link>
      </section>
    </div>
  );
}
