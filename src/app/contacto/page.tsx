import type { Metadata } from "next";

const CONTACT_EMAIL = "contacto.webproyectos@gmail.com";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Canal de contacto de Consumer Resolver para sugerencias, correcciones técnicas y consultas sobre privacidad.",
  alternates: { canonical: "/contacto" },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 mb-4">
        Contacto
      </h1>

      <p className="text-lg text-gray-600 leading-relaxed mb-8">
        Si has detectado un error técnico, tienes una sugerencia o deseas
        ejercer tus derechos de privacidad, puedes escribirnos por correo
        electrónico.
      </p>

      <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Correo de contacto
        </h2>
        <p className="text-gray-600 mb-4">
          Para sugerencias, correcciones técnicas, consultas sobre privacidad o
          cualquier otra cuestión:
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=Contacto desde Consumer Resolver`}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-base font-semibold text-gray-900 hover:bg-gray-100 transition-colors"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
          {CONTACT_EMAIL}
        </a>
      </div>

      <div className="mt-8 text-sm text-gray-500">
        <p>
          Este canal de contacto no es un servicio de asesoría legal. No podemos
          responder a preguntas individuales sobre tu caso particular.
        </p>
      </div>
    </div>
  );
}
