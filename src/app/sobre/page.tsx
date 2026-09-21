/**
 * Sobre Resolveo — About page.
 *
 * Explains what Resolveo is, its methodology, sources, and limitations.
 * No invented credentials, teams, or professional affiliations.
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sobre Resolveo",
  description:
    "Qué es Resolveo, cómo analiza problemas de consumo, qué fuentes utiliza y cuáles son sus limitaciones.",
  alternates: { canonical: "/sobre" },
  openGraph: {
    title: "Sobre Resolveo",
    description:
      "Qué es Resolveo, cómo analiza problemas de consumo y qué fuentes utiliza.",
    type: "website",
    locale: "es_ES",
  },
};

export default function AboutPage() {
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
          Sobre Resolveo
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed">
          Una herramienta que transforma problemas de consumo reales en análisis
          estructurados, con fuentes verificables y acciones concretas.
        </p>
      </header>

      {/* What is Resolveo */}
      <section className="mb-14">
        <h2
          className="text-2xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Qué es Resolveo
        </h2>
        <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
          <p>
            Resolveo es una herramienta de análisis de problemas de consumo para
            España. Cuando algo sale mal con una compra, un servicio o un vuelo,
            Resolveo te ayuda a entender tu situación: qué dice la normativa
            aplicable, qué documentación necesitas y qué puedes hacer a
            continuación.
          </p>
          <p>
            El sistema no ofrece opiniones ni interpretaciones libres. Cada
            conclusión se apoya en reglas deterministas vinculadas a normativa
            vigente, con trazabilidad completa hasta la fuente oficial.
          </p>
        </div>
      </section>

      {/* What problem it solves */}
      <section className="mb-14">
        <h2
          className="text-2xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          El problema que resuelve
        </h2>
        <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
          <p>
            Muchas personas tienen problemas de consumo legítimos pero no saben
            por dónde empezar. No conocen las normativas aplicables, no saben
            qué documentación conservar, no distinguen entre garantía legal y
            garantía comercial, o no saben cómo presentar una reclamación
            correctamente.
          </p>
          <p>
            La información legal está dispersa en BOE, EUR-Lex y normativa
            sectorial. Interpretarla requiere tiempo y conocimiento que la
            mayoría de consumidores no tiene. Resolveo ordena esa información
            y la aplica a tu caso concreto.
          </p>
        </div>
      </section>

      {/* What types of cases */}
      <section className="mb-14">
        <h2
          className="text-2xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Qué tipo de casos analiza
        </h2>
        <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
          <p>
            Actualmente Resolveo dispone de módulos de análisis para los
            siguientes problemas:
          </p>
          <ul className="space-y-2 ml-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                <strong>Cancelación y cargo posterior:</strong> cancelaste un
                servicio y te han cobrado después. Se analizan fechas,
                contrato, permanencia y normativa aplicable.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                <strong>Pedido no llega o no se reembolsa:</strong> realizaste
                un pedido que no llegó correctamente. Se evalúan plazos de
                entrega, derecho de resolución y obligación de reembolso.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                <strong>Garantía rechazada:</strong> el vendedor rechazó tu
                solicitud por falta de conformidad. Se verifican plazos,
                presunciones legales y vías de actuación.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                <strong>Vuelo cancelado por la aerolínea:</strong> la
                aerolínea canceló tu vuelo. Se evalúa compensación,
                transporte alternativo, reembolso y asistencia.
              </span>
            </li>
          </ul>
          <p>
            Si tu problema no coincide con ninguno de estos módulos, puedes
            describirlo con tus palabras. El sistema recoge la información y
            orienta sobre los siguientes pasos, pero no genera conclusiones
            jurídicas a partir de datos incompletos.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mb-14">
        <h2
          className="text-2xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Cómo funciona a nivel general
        </h2>
        <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
          <p>El proceso tiene cinco pasos:</p>
          <ol className="space-y-3 ml-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                1
              </span>
              <span>
                Describes tu problema con tus palabras. No necesitas conocer
                la categoría legal.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                2
              </span>
              <span>
                El sistema confirma los datos necesarios: fechas, importes,
                comunicaciones, documentación.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                3
              </span>
              <span>
                Puedes aportar evidencia: facturas, contratos, emails,
                capturas de pantalla.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                4
              </span>
              <span>
                El sistema evalúa la información contra reglas basadas en
                normativa vigente, con cada conclusión vinculada a su fuente.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
                5
              </span>
              <span>
                Obtienes un informe estructurado con claims verificados,
                fuentes identificadas y acciones concretas.
              </span>
            </li>
          </ol>
          <p>
            <Link
              href="/como-funciona"
              className="text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors"
            >
              Ver el proceso completo →
            </Link>
          </p>
        </div>
      </section>

      {/* Documentation */}
      <section className="mb-14">
        <h2
          className="text-2xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Qué documentación puede utilizar
        </h2>
        <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
          <p>
            Resolveo procesa documentación que el usuario proporciona como
            evidencia de su caso:
          </p>
          <ul className="space-y-2 ml-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Facturas, tickets o extractos de compra.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Contratos o condiciones del servicio.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Comunicaciones con el proveedor (emails, SMS, chat).
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Confirmaciones de cancelación o rechazos.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Capturas de pantalla relevantes.
            </li>
          </ul>
          <p>
            La calidad del análisis depende directamente de la información y
            documentación que proporciones. Sin datos suficientes, el sistema
            indica qué falta en lugar de inventar respuestas.
          </p>
        </div>
      </section>

      {/* Sources */}
      <section className="mb-14">
        <h2
          className="text-2xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Cómo se utilizan las fuentes oficiales
        </h2>
        <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
          <p>
            Cada regla de análisis está vinculada a una fuente oficial
            concreta. Las fuentes utilizadas incluyen:
          </p>
          <ul className="space-y-2 ml-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                <strong>BOE</strong> (Boletín Oficial del Estado) — legislación
                nacional publicada.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                <strong>EUR-Lex</strong> — regulaciones europeas directamente
                aplicables en España.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                <strong>Código Civil</strong> — normativa civil general
                aplicable.
              </span>
            </li>
          </ul>
          <p>
            No se utilizan blogs jurídicos, foros ni opiniones como fuente
            primaria. Cada conclusión muestra a qué normativa concreta se
            remite, con versión y referencia identificable.
          </p>
          <p>
            <Link
              href="/fuentes"
              className="text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors"
            >
              Ver el listado completo de fuentes →
            </Link>
          </p>
        </div>
      </section>

      {/* How info is prepared */}
      <section className="mb-14">
        <h2
          className="text-2xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Cómo se prepara la información
        </h2>
        <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
          <p>
            La información que presenta Resolveo se genera mediante un proceso
            estructurado:
          </p>
          <ul className="space-y-2 ml-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Los datos del caso se organizan en hechos confirmados con
              evidencia vinculada.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Las reglas de evaluación se aplican de forma determinista: los
              mismos datos producen los mismos resultados.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Cada conclusión se clasifica como confirmada, potencial o
              insuficiente, según la evidencia disponible.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Si la información no es suficiente para una conclusión, el
              sistema lo indica explícitamente.
            </li>
          </ul>
          <p>
            La tecnología de inteligencia artificial se utiliza como herramienta
            interna de interpretación y estructuración de datos, no como
            fuente de conclusiones jurídicas.
          </p>
        </div>
      </section>

      {/* Limitations */}
      <section className="mb-14">
        <h2
          className="text-2xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Limitaciones del servicio
        </h2>
        <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
          <p>Resolveo tiene limitaciones importantes que debes conocer:</p>
          <ul className="space-y-2 ml-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                No constituye asesoría legal profesional ni sustituye el
                consejo de un abogado.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                No resuelve litigios judiciales ni presenta reclamaciones en
                tu nombre.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                Los resultados dependen de la información que proporciones.
                Datos incompletos producen conclusiones parciales.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                La normativa cambia. Las reglas se basan en la legislación
                vigente en el momento de la consulta, pero pueden no reflejar
                cambios posteriores.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                No cubre todos los tipos de problemas de consumo. Los módulos
                disponibles se limitan a los casos actualmente implementados.
              </span>
            </li>
          </ul>
          <p className="text-slate-500">
            Para decisiones legales importantes, consulta con un profesional
            cualificado.
          </p>
        </div>
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
