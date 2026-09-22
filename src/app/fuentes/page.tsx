/**
 * Fuentes — Resolveo.
 *
 * Lists the official sources the analysis actually uses. The list is derived
 * from the module rule sets (see `src/lib/source-catalogue.ts`), not from a
 * hand-written copy, so it cannot drift from what the engine evaluates.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { formatConsultedAt, getSourceGroups } from "@/lib/source-catalogue";

export const metadata: Metadata = {
  title: "Fuentes normativas",
  description:
    "Fuentes oficiales que utiliza Resolveo para cada análisis: TRLGDCU, Reglamento 261/2004, Código Civil y Ley General de Telecomunicaciones, con artículo, versión consultada y fecha.",
  alternates: { canonical: "/fuentes" },
  openGraph: {
    title: "Fuentes normativas — Resolveo",
    description:
      "Fuentes oficiales verificadas que sustentan cada análisis de Resolveo, con artículo, versión y fecha de consulta.",
    type: "website",
    locale: "es_ES",
    images: ["/og.png"],
  },
};

export default function SourcesPage() {
  const groups = getSourceGroups();

  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-12 md:py-16">
      {/* Header */}
      <header className="mb-10">
        <p className="text-slate-400 text-sm font-medium tracking-wide uppercase mb-3">Resolveo</p>
        <h1
          className="text-3xl md:text-4xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Fuentes normativas
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed">
          Esta página no es un resumen de la normativa: es el registro de las fuentes que el
          análisis usa realmente, con el artículo concreto, la versión consultada y la fecha en que
          se consultó. Las fuentes que aparecen aquí son las mismas que el sistema cita al concluir
          un caso.
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
            Resolveo utiliza exclusivamente fuentes con autoridad normativa: legislación nacional
            publicada en el BOE, reglamentos europeos publicados en EUR-Lex y el texto oficial en
            español de la normativa europea cuando el BOE lo reproduce.
          </p>
          <p>
            Cada regla de análisis referencia una fuente concreta con artículo, versión y fecha de
            consulta. Si una cuestión no puede determinarse con la normativa disponible, el sistema
            lo declara como <span className="font-medium text-slate-700">INSUFFICIENT_DATA</span> en
            lugar de inventar una respuesta.
          </p>
          <p>
            No se utilizan blogs jurídicos, foros ni opiniones como fuente primaria. Cuando un
            artículo se cita, el registro conserva el fragmento del texto oficial que la regla
            utiliza, para que puedas comprobarlo en la publicación original enlazada.
          </p>
        </div>
      </section>

      {/* Sources by module */}
      <section className="mb-12">
        <h2
          className="text-xl font-semibold text-slate-900 mb-6"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Fuentes registradas, por tipo de problema
        </h2>

        <div className="space-y-10">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <h3 className="text-base font-semibold text-slate-900">{group.title}</h3>
                <Link
                  href={`/problemas/${group.slug}`}
                  className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2 transition-colors"
                >
                  Ver el problema →
                </Link>
              </div>

              <div className="space-y-4">
                {group.sources.map((source) => (
                  <div key={source.id} className="cr-surface p-6">
                    <h4 className="font-semibold text-slate-900 text-sm leading-snug mb-2">
                      {source.title}
                    </h4>

                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="text-[11px] text-slate-400 bg-slate-50 rounded px-2 py-0.5">
                        {source.typeLabel}
                      </span>
                      <span className="text-[11px] text-slate-400 bg-slate-50 rounded px-2 py-0.5">
                        {source.scopeLabel}
                      </span>
                      <span className="text-[11px] text-slate-400 bg-slate-50 rounded px-2 py-0.5">
                        {source.statusLabel}
                      </span>
                    </div>

                    <dl className="text-xs text-slate-500 space-y-1 mb-3">
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="text-slate-400">Identificador:</dt>
                        <dd className="font-mono">{source.externalId}</dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="text-slate-400">Versión consultada:</dt>
                        <dd>{source.versionIdentifier}</dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="text-slate-400">Consultada el:</dt>
                        <dd>{formatConsultedAt(source.retrievedAt)}</dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="text-slate-400">Publicación oficial:</dt>
                        <dd>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2 hover:text-slate-700 transition-colors break-all"
                          >
                            {source.publisher}
                          </a>
                        </dd>
                      </div>
                    </dl>

                    {source.relevantSection && (
                      <details className="mt-3">
                        <summary className="text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-800 transition-colors">
                          Texto del artículo utilizado por el análisis
                        </summary>
                        <p className="mt-2 text-xs text-slate-500 leading-relaxed whitespace-pre-line">
                          {source.relevantSection}
                        </p>
                      </details>
                    )}
                  </div>
                ))}
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
          Cómo se verifica una fuente
        </h2>
        <div className="space-y-3 text-sm text-slate-500 leading-relaxed">
          <p>
            Una regla de análisis{" "}
            <strong className="text-slate-700">
              no puede publicarse sin al menos una fuente verificada
            </strong>
            . El sistema bloquea la publicación si la fuente no está verificada o si le falta la
            nota de revisión. Las fuentes pasan por un ciclo de estados (borrador → revisada →
            verificada → publicada) y una regla ya publicada no puede modificarse en su lugar: hay
            que crear una versión nueva.
          </p>
          <p>Cada entrada de este registro conserva:</p>
          <ul className="space-y-2 ml-4">
            <li className="flex items-start gap-2">
              <span className="text-slate-300 mt-0.5">•</span>
              <span>
                <strong className="text-slate-700">Identificador único</strong> — referencia estable
                para trazabilidad.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-300 mt-0.5">•</span>
              <span>
                <strong className="text-slate-700">Jurisdicción</strong> — país o ámbito de
                aplicación.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-300 mt-0.5">•</span>
              <span>
                <strong className="text-slate-700">Versión y fecha de consulta</strong> — qué texto
                consolidado se leyó y cuándo.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-slate-300 mt-0.5">•</span>
              <span>
                <strong className="text-slate-700">Registro de verificación</strong> — nota de
                revisión con la fecha. El identificador del revisor es hoy un identificador interno
                del proyecto, no el nombre de una persona: mientras no existan cuentas de usuario no
                se publica una identidad que no podamos respaldar.
              </span>
            </li>
          </ul>
          <p>
            Si detectas que una fuente ha cambiado, que un artículo se cita incorrectamente o que
            una versión está desactualizada, puedes señalarlo desde la página de{" "}
            <Link
              href="/contacto"
              className="text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors"
            >
              contacto
            </Link>
            .
          </p>
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
