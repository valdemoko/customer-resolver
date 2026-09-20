/**
 * Sobre Consumer Resolver — Info page.
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sobre Consumer Resolver",
  description:
    "Consumer Resolver es una herramienta que ayuda a las personas a entender y resolver problemas de consumo en España.",
  alternates: { canonical: "/sobre" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-12 md:py-16">
      <h1
        className="text-3xl md:text-4xl font-bold text-slate-900 mb-6"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        Sobre Consumer Resolver
      </h1>

      <div className="prose prose-slate max-w-none">
        <p className="text-lg text-slate-600 leading-relaxed mb-6">
          Consumer Resolver es una herramienta que ayuda a las personas a convertir un problema de
          consumo en un caso estructurado: hechos, evidencia, reglas aplicables y pasos concretos.
        </p>

        <h2
          className="text-xl font-semibold text-slate-900 mt-8 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Qué pretendemos
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          Muchas personas tienen problemas de consumo legítimos pero no saben por dónde empezar. No
          conocen las normativas, no saben qué documentación conservar ni cómo presentar una
          reclamación.
        </p>
        <p className="text-slate-600 leading-relaxed mb-4">
          Consumer Resolver ordena la información, identifica qué datos faltan, evalúa la situación
          según la normativa vigente y propone acciones concretas.
        </p>

        <h2
          className="text-xl font-semibold text-slate-900 mt-8 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Qué no somos
        </h2>
        <ul className="space-y-2 text-slate-600 leading-relaxed">
          <li>No somos un despacho de abogados.</li>
          <li>No prestamos asesoría legal individualizada.</li>
          <li>No resolvemos litigios.</li>
          <li>No sustituimos el consejo de un profesional.</li>
        </ul>

        <h2
          className="text-xl font-semibold text-slate-900 mt-8 mb-3"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Cómo funciona técnicamente
        </h2>
        <p className="text-slate-600 leading-relaxed mb-4">
          El sistema está construido con módulos especializados por tipo de problema. Cada módulo
          define su catálogo de hechos, sus reglas de evaluación y las fuentes normativas que
          consulta. Los resultados se presentan de forma estructurada, con trazabilidad completa de
          cada conclusión.
        </p>
      </div>
    </div>
  );
}
