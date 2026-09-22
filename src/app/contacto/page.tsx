/**
 * Contacto — Resolveo.
 *
 * Expanded in the 2026-09-22 post-audit pass: the page had 131 words and only
 * an address. It now says what each kind of message should contain, so a
 * correction can actually be verified against the official source.
 */
import type { Metadata } from "next";
import Link from "next/link";

const CONTACT_EMAIL = "contacto.webproyectos@gmail.com";

export const metadata: Metadata = {
  title: "Contacto",
  description:
    "Cómo contactar con Resolveo: correcciones de normativa y fuentes, errores técnicos, sugerencias y ejercicio de derechos de privacidad.",
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
        Este canal sirve para corregir el contenido y mejorar el sistema. Lo
        mantiene una sola persona, así que los mensajes se atienden por orden de
        llegada y la respuesta puede tardar.
      </p>

      <div className="cr-surface p-6 md:p-8 mb-10">
        <h2
          className="text-lg font-semibold text-slate-900 mb-2"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Correo de contacto
        </h2>
        <p className="text-slate-500 mb-4 text-sm">
          Para cualquier asunto relacionado con el sitio, la normativa publicada
          o el tratamiento de tus datos:
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

      {/* Qué incluir en cada tipo de mensaje */}
      <section className="mb-10">
        <h2
          className="text-lg font-semibold text-slate-900 mb-4"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Qué incluir según el tipo de mensaje
        </h2>

        <div className="space-y-6 text-sm text-slate-500 leading-relaxed">
          <div>
            <h3 className="font-semibold text-slate-800 mb-1">
              Si has detectado un error en la normativa o en una fuente
            </h3>
            <p className="mb-2">
              Es el mensaje más útil que podemos recibir. Para poder comprobarlo
              y corregirlo, indica:
            </p>
            <ul className="space-y-1.5 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-slate-300 mt-0.5">—</span>
                La dirección de la página afectada.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-300 mt-0.5">—</span>
                Qué dato concreto es incorrecto y por qué.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-slate-300 mt-0.5">—</span>
                La publicación oficial donde se puede comprobar (BOE, EUR-Lex),
                con el artículo y, si lo tienes, la versión consolidada.
              </li>
            </ul>
            <p className="mt-2">
              Puedes consultar qué fuente respalda cada análisis, con su artículo
              y fecha de consulta, en{" "}
              <Link
                href="/fuentes"
                className="text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors"
              >
                Fuentes normativas
              </Link>
              .
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 mb-1">
              Si algo del sitio no funciona
            </h3>
            <p>
              Describe qué hiciste, qué esperabas y qué ocurrió, e incluye la
              dirección del caso si el problema aparece en un informe concreto.
              No adjuntes documentos de tu caso en el correo: para eso ya existe
              la subida dentro del propio caso.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 mb-1">
              Si quieres ejercer tus derechos de privacidad
            </h3>
            <p>
              Escribe desde la misma dirección si es posible e incluye el
              identificador del caso: es lo único que permite localizarlo, ya que
              el sistema no pide nombres. El detalle está en la{" "}
              <Link
                href="/privacidad"
                className="text-slate-700 font-medium underline underline-offset-2 hover:text-slate-900 transition-colors"
              >
                política de privacidad
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <div className="mt-8 text-sm text-slate-400 border-t border-slate-200/60 pt-6">
        <p>
          Este canal no es un servicio de asesoría legal y no se pueden atender
          consultas individuales sobre un caso particular: cada informe ya
          detalla los pasos, los canales de reclamación y las vías disponibles.
        </p>
      </div>
    </div>
  );
}
