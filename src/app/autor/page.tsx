/**
 * Autor — Resolveo.
 *
 * Editorial identity page. Uses real project metadata only —
 * no invented credentials, titles, or professional affiliations.
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Autor",
  description:
    "Quién mantiene Resolveo, cómo se revisa el contenido, qué fuentes se utilizan y cuál es el objetivo editorial del proyecto.",
  alternates: { canonical: "/autor" },
  openGraph: {
    title: "Autor — Resolveo",
    description: "Quién mantiene Resolveo y cómo se revisa el contenido del proyecto.",
    type: "website",
    locale: "es_ES",
    images: ["/og.png"],
  },
};

export default function AuthorPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-12 md:py-16">
      {/* Header */}
      <header className="mb-12">
        <p className="text-slate-400 text-sm font-medium tracking-wide uppercase mb-3">Resolveo</p>
        <h1
          className="text-3xl md:text-4xl font-bold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Autor
        </h1>
      </header>

      {/* Project identity */}
      <section className="mb-12">
        <div className="cr-surface p-6 md:p-8">
          <div className="flex items-start gap-5">
            {/* Logo mark */}
            <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center">
              <span
                className="text-white font-bold text-xl"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                R
              </span>
            </div>

            <div>
              <h2
                className="text-xl font-semibold text-slate-900 mb-1"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                Resolveo
              </h2>
              <p className="text-sm text-slate-500 mb-3">
                Proyecto de ingeniería de software orientado a problemas de consumo
              </p>
              <p className="text-sm text-slate-500 leading-relaxed">
                Herramienta de análisis de problemas de consumo con información estructurada, reglas
                deterministas y fuentes oficiales verificables.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who maintains it */}
      <section className="mb-12">
        <h2
          className="text-xl font-semibold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Quién mantiene el contenido
        </h2>
        <div className="space-y-4 text-sm text-slate-500 leading-relaxed">
          <p>
            Resolveo es mantenido por un desarrollador de software. No es un despacho jurídico, una
            empresa de servicios legales ni una asociación de consumidores.
          </p>
          <p>
            El contenido de las páginas públicas — descripciones de problemas, explicaciones de
            proceso, información sobre fuentes — está escrito y revisado por la persona que
            desarrolla el proyecto. No hay un equipo editorial externo ni colaboradores jurídicos.
          </p>
        </div>
      </section>

      {/* How content is reviewed */}
      <section className="mb-12">
        <h2
          className="text-xl font-semibold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Cómo se revisa el contenido
        </h2>
        <div className="space-y-4 text-sm text-slate-500 leading-relaxed">
          <p>El proceso de revisión tiene dos niveles:</p>
          <ul className="space-y-2 ml-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                <strong>Contenido textual:</strong> las descripciones de problemas, páginas
                informativas y textos de interfaz son escritos directamente por el desarrollador y
                se revisan antes de publicarse.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                <strong>Reglas de análisis:</strong> cada módulo de problema tiene reglas vinculadas
                a normativa oficial concreta (BOE, EUR-Lex). Las reglas se documentan con su fuente,
                versión y lógica de evaluación, y se cubren con pruebas automatizadas que se
                ejecutan en cada cambio del proyecto.
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* Automated vs human review */}
      <section className="mb-12">
        <h2
          className="text-xl font-semibold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Qué se comprueba automáticamente y qué revisa una persona
        </h2>
        <div className="space-y-4 text-sm text-slate-500 leading-relaxed">
          <p>Merece la pena distinguir dos cosas, porque no se revisan igual:</p>
          <ul className="space-y-3 ml-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                <strong className="text-slate-700">Automático:</strong> el código impide publicar
                una regla sin fuente verificada, una regla publicada no puede modificarse sin crear
                una versión nueva, y las pruebas comprueban en cada cambio que cada regla concluye
                lo que debe concluir con cada combinación de datos. Si una regla publicada cambia de
                comportamiento, el proyecto no compila.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              <span>
                <strong className="text-slate-700">Revisión humana:</strong>
                interpretar un artículo y decidir qué consecuencias tiene para un caso no es algo
                que una prueba automática pueda resolver. La verificación de las fuentes exige una
                nota de revisión fechada, y las reglas que todavía no han pasado esa revisión
                permanecen fuera del conjunto publicado en lugar de aplicarse igualmente.
              </span>
            </li>
          </ul>
          <p>
            Las fuentes que el sistema utiliza están publicadas, con artículo y fecha de consulta,
            en{" "}
            <Link
              href="/fuentes"
              className="text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors"
            >
              Fuentes normativas
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Sources */}
      <section className="mb-12">
        <h2
          className="text-xl font-semibold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Qué fuentes se utilizan
        </h2>
        <div className="space-y-4 text-sm text-slate-500 leading-relaxed">
          <p>
            Toda la normativa utilizada es legislación vigente en España y regulaciones europeas
            directamente aplicables:
          </p>
          <ul className="space-y-2 ml-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              BOE (Boletín Oficial del Estado)
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              EUR-Lex (legislación europea)
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Código Civil
            </li>
          </ul>
          <p>
            No se utilizan blogs jurídicos, foros, redes sociales ni opiniones como fuente primaria
            para las reglas de análisis.
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

      {/* How pages are updated */}
      <section className="mb-12">
        <h2
          className="text-xl font-semibold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Cómo se actualizan las páginas
        </h2>
        <div className="space-y-4 text-sm text-slate-500 leading-relaxed">
          <p>Las páginas de Resolveo se actualizan cuando:</p>
          <ul className="space-y-2 ml-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Cambia la normativa aplicable a un tipo de problema.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Se incorpora un nuevo módulo de análisis.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Se detecta un error en la información publicada.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Se mejora la precisión de las descripciones o explicaciones.
            </li>
          </ul>
          <p>
            Las reglas de análisis viven en el repositorio del proyecto junto con las pruebas que
            las cubren y el registro de fuentes que citan.
          </p>
          <p>
            El registro público de correcciones, con fecha y alcance de cada cambio, está en{" "}
            <Link
              href="/correcciones"
              className="text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors"
            >
              Correcciones
            </Link>
            .
          </p>
        </div>
      </section>

      {/* How to report an error */}
      <section className="mb-12">
        <h2
          className="text-xl font-semibold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Cómo informar de un error
        </h2>
        <div className="space-y-4 text-sm text-slate-500 leading-relaxed">
          <p>
            Si una afirmación no coincide con la normativa, o si una fuente ya no está disponible,
            el canal es la página de contacto. Para poder comprobarlo hace falta el dato concreto:
          </p>
          <ul className="space-y-2 ml-4">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              La página o el problema donde aparece el texto.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              La norma y el artículo que, según tu criterio, deberían aplicarse.
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
              Si es posible, el enlace a la publicación oficial donde consta.
            </li>
          </ul>
          <p>
            Cada corrección que se aplica se publica con su fecha en el registro de correcciones. Si
            una regla de análisis cambia, se publica como una versión nueva en lugar de editarse en
            silencio.
          </p>
          <p>
            <Link
              href="/contacto"
              className="text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors"
            >
              Ir a contacto →
            </Link>
          </p>
        </div>
      </section>

      {/* Scope */}
      <section className="mb-12">
        <h2
          className="text-xl font-semibold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Qué cubre Resolveo y qué no
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)]">
            <p className="text-xs font-medium tracking-wider uppercase text-[var(--color-ink-faint)] mb-3">
              Qué cubre
            </p>
            <ul className="space-y-2 text-sm text-slate-500 leading-relaxed">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
                Problemas de consumo con normativa estatal o europea directamente aplicable en
                España.
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
                Explicar qué hechos son relevantes, qué reglas pueden aplicarse y qué documentación
                conviene conservar.
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
                Indicar pasos concretos y canales de reclamación verificados.
              </li>
            </ul>
          </div>
          <div className="p-5 bg-[var(--surface-paper)] border border-[var(--border-light)]">
            <p className="text-xs font-medium tracking-wider uppercase text-[var(--color-ink-faint)] mb-3">
              Qué no cubre
            </p>
            <ul className="space-y-2 text-sm text-slate-500 leading-relaxed">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
                Asesoramiento jurídico personalizado ni representación en reclamaciones.
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
                Materias sin normativa registrada: en esos casos el sistema lo declara en lugar de
                concluir.
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 text-slate-300 mt-0.5">—</span>
                Garantizar un resultado: el análisis indica posiciones defendibles, no resultados de
                un procedimiento.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Editorial objective */}
      <section className="mb-12">
        <h2
          className="text-xl font-semibold text-slate-900 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Objetivo editorial
        </h2>
        <div className="space-y-4 text-sm text-slate-500 leading-relaxed">
          <p>
            El objetivo de Resolveo es ofrecer información clara, verificable y sin ambigüedades
            sobre problemas de consumo comunes en España.
          </p>
          <p>
            Cada página está diseñada para que una persona sin conocimientos legales pueda entender
            su situación, saber qué documentación necesita y conocer los pasos concretos que puede
            dar.
          </p>
          <p>
            Cuando la información disponible no es suficiente para una conclusión, Resolveo lo
            declara en lugar de fabricar una respuesta. La transparencia sobre las limitaciones es
            parte del diseño del proyecto, no una deficiencia.
          </p>
        </div>
      </section>

      {/* Disclaimer */}
      <section className="border-t border-slate-200/60 pt-8">
        <p className="text-xs text-slate-400 leading-relaxed">
          Resolveo es un proyecto de ingeniería de software. No es un despacho jurídico ni una
          empresa de servicios legales. La información proporcionada por el sistema tiene carácter
          orientativo y no constituye asesoría legal profesional.
        </p>
      </section>
    </div>
  );
}
