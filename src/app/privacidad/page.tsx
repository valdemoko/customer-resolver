/**
 * Política de Privacidad — Consumer Resolver.
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidad",
  description:
    "Política de privacidad de Consumer Resolver. Cómo tratamos los datos que proporcionas.",
  alternates: { canonical: "/privacidad" },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-12 md:py-16">
      <h1
        className="text-3xl md:text-4xl font-bold text-slate-900 mb-6"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        Política de Privacidad
      </h1>

      <p className="text-sm text-slate-400 mb-8">Última actualización: septiembre de 2026</p>

      <div className="space-y-8 text-slate-600 leading-relaxed">
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Qué datos recopilamos
          </h2>
          <p className="mb-3">
            Consumer Resolver recopila únicamente la información que proporcionas voluntariamente al
            crear un caso:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Datos del caso (fechas, importes, descripciones).</li>
            <li>Documentos que subas como evidencia.</li>
            <li>Datos de contacto si nos escribes por correo electrónico.</li>
          </ul>
        </section>

        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Cómo utilizamos los datos
          </h2>
          <p>
            Los datos se utilizan exclusivamente para procesar tu caso: evaluar la información según
            las normativas aplicables, generar un informe estructurado y proponer acciones. No se
            utilizan para fines publicitarios ni se comparten con terceros.
          </p>
        </section>

        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Almacenamiento
          </h2>
          <p>
            Los casos se almacenan de forma segura. Actualmente no existe un sistema de cuentas de
            usuario. El acceso a un caso se realiza mediante su identificador único.
          </p>
        </section>

        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Tus derechos
          </h2>
          <p>
            Puedes solicitar acceso, rectificación o eliminación de tus datos escribiendo a{" "}
            <a
              href="mailto:contacto.webproyectos@gmail.com?subject=Consulta de privacidad"
              className="text-slate-900 underline underline-offset-2 hover:text-slate-700 transition-colors"
            >
              contacto.webproyectos@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
