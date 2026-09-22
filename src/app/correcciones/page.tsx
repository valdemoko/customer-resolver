/**
 * Correcciones — Resolveo.
 *
 * Dated, public record of changes that affected what the site or the analysis
 * says. Entries come from `@/lib/corrections` and describe real, already-applied
 * changes — the page states the limitations of the log instead of inventing
 * history.
 */
import type { Metadata } from "next";
import Link from "next/link";

import {
  CORRECTIONS,
  CORRECTIONS_LOG_START,
  CORRECTION_KIND_LABELS,
  hasCorrections,
} from "@/lib/corrections";

export const metadata: Metadata = {
  title: "Correcciones",
  description:
    "Registro fechado de las correcciones aplicadas a Resolveo: normativa, fuentes, análisis, contenido y privacidad.",
  alternates: { canonical: "/correcciones" },
  openGraph: {
    title: "Correcciones — Resolveo",
    description:
      "Registro fechado de correcciones aplicadas a la normativa citada, a las fuentes, al análisis y al contenido.",
    type: "website",
    locale: "es_ES",
  },
};

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

export default function CorrectionsPage() {
  const entries = [...CORRECTIONS].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-12 md:py-16">
      <header className="mb-12">
        <p className="text-slate-400 text-sm font-medium tracking-wide uppercase mb-3">
          Resolveo
        </p>
        <h1
          className="text-3xl md:text-4xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Correcciones
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed">
          Resolveo cita normativa concreta, así que también tiene que poder
          enseñar cuándo se equivocó y qué cambió. Este registro recoge los
          cambios que afectaron a lo que el sitio afirma.
        </p>
      </header>

      {hasCorrections() ? (
        <>
          <section aria-label="Registro de correcciones" className="mb-12">
            <ol className="space-y-0">
              {entries.map((entry) => (
                <li
                  key={`${entry.date}-${entry.problem}`}
                  className="py-6 border-b border-slate-100 last:border-0"
                >
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <time
                      dateTime={entry.date}
                      className="text-xs font-mono text-slate-400"
                    >
                      {formatDate(entry.date)}
                    </time>
                    <span className="text-xs px-2 py-0.5 border border-slate-200 bg-slate-50 text-slate-500">
                      {CORRECTION_KIND_LABELS[entry.kind]}
                    </span>
                  </div>

                  <p className="text-sm text-slate-700 leading-relaxed mb-3">
                    <span className="font-medium">Qué estaba mal: </span>
                    {entry.problem}
                  </p>
                  <p className="text-sm text-slate-500 leading-relaxed mb-3">
                    <span className="font-medium text-slate-700">Qué dice ahora: </span>
                    {entry.resolution}
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Afecta a: {entry.scope}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mb-12">
            <h2
              className="text-xl font-semibold text-slate-900 mb-3"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Alcance de este registro
            </h2>
            <ul className="space-y-2 text-sm text-slate-500 leading-relaxed">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
                El registro empieza el {formatDate(CORRECTIONS_LOG_START)}. Los cambios
                anteriores a esa fecha no están documentados aquí, y no se ha
                reconstruido un historial a posteriori.
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
                Recoge cambios que afectan a lo que el sitio afirma. Los ajustes
                de diseño, redacción o rendimiento no se listan.
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
                Cuando una corrección afecta a una regla de análisis, la regla se
                publica como una versión nueva: una regla publicada no se edita en
                silencio.
              </li>
            </ul>
          </section>

          <section className="border-t border-slate-200/60 pt-8">
            <h2
              className="text-xl font-semibold text-slate-900 mb-3"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Cómo informar de un error
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed mb-4">
              Si detectas una afirmación que no coincide con la normativa, o una
              fuente que ya no está disponible, escríbenos indicando la página y
              el artículo concreto. Con ese detalle se puede comprobar contra el
              texto oficial antes de cambiar nada.
            </p>
            <Link
              href="/contacto"
              className="text-sm text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors"
            >
              Cómo contactar y qué incluir →
            </Link>
          </section>
        </>
      ) : (
        <section className="cr-surface p-6 md:p-8">
          <h2
            className="text-lg font-semibold text-slate-900 mb-2"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Todavía no hay correcciones registradas
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            El registro comienza el {formatDate(CORRECTIONS_LOG_START)}. Cuando se
            aplique la primera corrección que afecte a lo que el sitio afirma, se
            publicará aquí con su fecha.
          </p>
        </section>
      )}
    </div>
  );
}
