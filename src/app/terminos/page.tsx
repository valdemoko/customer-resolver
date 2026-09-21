/**
 * Términos de Uso — Resolveo.
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos de uso",
  description:
    "Condiciones de uso de Resolveo. Limitaciones de responsabilidad y uso del servicio.",
  alternates: { canonical: "/terminos" },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-12 md:py-16">
      <h1
        className="text-3xl md:text-4xl font-bold text-slate-900 mb-6"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        Términos de Uso
      </h1>

      <p className="text-sm text-slate-400 mb-8">Última actualización: septiembre de 2026</p>

      <div className="space-y-8 text-slate-600 leading-relaxed">
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Aceptación
          </h2>
          <p>
            Al utilizar Resolveo aceptas estos términos. Si no estás de acuerdo, no
            utilices el servicio.
          </p>
        </section>

        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Naturaleza del servicio
          </h2>
          <p className="mb-3">
            Resolveo proporciona información estructurada sobre problemas de consumo
            basándose en normativa vigente. Esta información:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>No constituye asesoría legal.</li>
            <li>No sustituye el consejo de un abogado o profesional cualificado.</li>
            <li>No garantiza resultados específicos en reclamaciones o litigios.</li>
            <li>
              Se basa en la información que tú proporcionas; su exactitud depende de esos datos.
            </li>
          </ul>
        </section>

        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Responsabilidad
          </h2>
          <p>
            El servicio se proporciona &ldquo;tal cual&rdquo;. No garantizamos la disponibilidad
            continua ni la ausencia de errores. No nos hacemos responsables de decisiones tomadas
            exclusivamente en base a la información proporcionada por Resolveo.
          </p>
        </section>

        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Propiedad intelectual
          </h2>
          <p>
            El código, diseño y contenido de Resolveo son propiedad de sus autores. No se
            autoriza su reproducción sin permiso.
          </p>
        </section>
      </div>
    </div>
  );
}
