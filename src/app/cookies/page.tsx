/**
 * Política de Cookies y Almacenamiento — Resolveo.
 *
 * Documents that Resolveo does not use cookies, localStorage or sessionStorage.
 * Plausible Analytics is cookieless.
 *
 * History of this page, because it is a claim about the code and has been wrong
 * twice: it first said nothing was stored in the browser while the questionnaire
 * used sessionStorage, and later documented that sessionStorage key while the
 * search bar was the only writer. The search bar now navigates to `/resolver`
 * (deterministically for a known problem), nothing writes browser storage, and
 * the page says so. The case state lives on the server.
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookies y almacenamiento",
  description: "Qué tecnologías de almacenamiento utiliza Resolveo y cómo puedes gestionarlas.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-12 md:py-16">
      <h1
        className="text-3xl md:text-4xl font-bold text-slate-900 mb-6"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        Cookies y almacenamiento
      </h1>

      <p className="text-sm text-slate-400 mb-8">Última actualización: septiembre de 2026</p>

      <div className="space-y-8 text-slate-600 leading-relaxed">
        {/* ── Resumen ──────────────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Resumen
          </h2>
          <p>
            Resolveo <strong>no utiliza cookies</strong>. Ni cookies propias ni de terceros. No
            instalamos cookies de análisis, publicidad ni redes sociales.
          </p>
        </section>

        {/* ── Plausible ────────────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Analítica web: Plausible Analytics
          </h2>
          <p className="mb-3">
            Utilizamos{" "}
            <a
              href="https://plausible.io"
              className="text-slate-900 underline underline-offset-2 hover:text-slate-700 transition-colors"
            >
              Plausible Analytics
            </a>
            , una herramienta de medición de tráfico web que opera <strong>sin cookies</strong>.
          </p>
          <p className="mb-3">
            Plausible no utiliza cookies, localStorage ni ninguna tecnología de almacenamiento del
            navegador. Genera un identificador temporal diario a partir de la dirección IP y el
            navegador, que se elimina cada 24 horas. No es posible vincular una visita con otra o
            con un usuario concreto.
          </p>
          <p className="mb-3">
            Plausible procesa los siguientes datos de forma agregada: URL visitada, referente,
            navegador, sistema operativo, tipo de dispositivo y país de procedencia. La dirección IP
            no se almacena.
          </p>
          <p>
            Plausible tiene su sede en Estonia (Unión Europea) y todos los datos se procesan y
            almacenan en servidores de la UE.
          </p>
        </section>

        {/* ── Google / AdSense ──────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Google y publicidad
          </h2>{" "}
          <p className="mb-3">
            Resolveo publica el archivo{" "}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">ads.txt</code> con el
            identificador de publicador de Google AdSense, que sirve para identificar el dominio
            ante las plataformas de anuncios. Mientras tanto, el sitio no carga la etiqueta de
            Google AdSense: no se utilizan cookies de publicidad ni scripts de Google para
            publicidad.
          </p>
          <p>
            Si en el futuro se activa la publicidad, se utilizará el sistema de consentimiento de
            Google (CMP certificado) y esta política se actualizará para reflejar las cookies y
            tecnologías que los proveedores publicitarios puedan utilizar.
          </p>
        </section>

        {/* ── Almacenamiento ────────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Almacenamiento en el navegador
          </h2>
          <p className="mb-4">
            Resolveo no utiliza cookies, ni{" "}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">localStorage</code> ni{" "}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">sessionStorage</code> . El
            estado de un caso vive en el servidor, y la pantalla lo consulta cada vez que lo
            necesita: no se guarda nada en tu navegador para identificarte, medir audiencia ni
            mostrar publicidad.
          </p>

          <p className="mb-4">
            El único dato que permanece en tu navegador al usar Resolveo es el identificador del
            caso, que aparece en la barra de direcciones de la página de tu caso. Si guardas ese
            enlace, podrás volver a consultarlo; si no, desaparece al cerrar la pestaña.
          </p>

          <p className="mt-4">
            Al no haber cookies, no existe un banner de cookies: no hay nada que aceptar o rechazar
            por navegar.
          </p>
        </section>
      </div>
    </div>
  );
}
