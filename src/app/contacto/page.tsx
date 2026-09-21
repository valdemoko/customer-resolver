/**
 * Contacto — Resolveo.
 */
import type { Metadata } from "next";

const CONTACT_EMAIL = "contacto.webproyectos@gmail.com";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Canal de contacto de Resolveo para sugerencias, correcciones técnicas y consultas sobre privacidad.",
  alternates: { canonical: "/contacto" },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-12 md:py-16">
      <h1
        className="text-3xl md:text-4xl font-bold text-slate-900 mb-4"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        Contacto
      </h1>

      <p className="text-lg text-slate-500 leading-relaxed mb-8">
        Si has detectado un error técnico, tienes una sugerencia o deseas ejercer tus derechos de
        privacidad, puedes escribirnos por correo electrónico.
      </p>

      <div className="cr-surface p-6 md:p-8">
        <h2
          className="text-lg font-semibold text-slate-900 mb-2"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Correo de contacto
        </h2>
        <p className="text-slate-500 mb-4 text-sm">
          Para sugerencias, correcciones técnicas, consultas sobre privacidad o cualquier otra
          cuestión:
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=Contacto desde Resolveo`}
          className="cr-btn-secondary inline-flex"
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

      <div className="mt-8 text-sm text-slate-400">
        <p>
          Este canal de contacto no es un servicio de asesoría legal. No podemos responder a
          preguntas individuales sobre tu caso particular.
        </p>
      </div>
    </div>
  );
}
