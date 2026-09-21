/**
 * Política de Cookies y Almacenamiento — Resolveo.
 *
 * Documents that Resolveo does not use cookies.
 * Plausible Analytics is cookieless.
 * No localStorage is used for tracking or consent.
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookies y almacenamiento",
  description:
    "Qué tecnologías de almacenamiento utiliza Resolveo y cómo puedes gestionarlas.",
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

      <p className="text-sm text-slate-400 mb-8">
        Última actualización: septiembre de 2026
      </p>

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
            Resolveo <strong>no utiliza cookies</strong>. Ni cookies propias ni
            de terceros. No instalamos cookies de análisis, publicidad ni redes
            sociales.
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
            , una herramienta de medición de tráfico web que opera{" "}
            <strong>sin cookies</strong>.
          </p>
          <p className="mb-3">
            Plausible no utiliza cookies, localStorage ni ninguna tecnología de
            almacenamiento del navegador. Genera un identificador temporal
            diario a partir de la dirección IP y el navegador, que se elimina
            cada 24 horas. No es posible vincular una visita con otra o con un
            usuario concreto.
          </p>
          <p className="mb-3">
            Plausible procesa los siguientes datos de forma agregada: URL
            visitada, referente, navegador, sistema operativo, tipo de
            dispositivo y país de procedencia. La dirección IP no se almacena.
          </p>
          <p>
            Plausible tiene su sede en Estonia (Unión Europea) y todos los
            datos se procesan y almacenan en servidores de la UE.
          </p>
        </section>

        {/* ── Google / AdSense ──────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Google y publicidad
          </h2>
          <p>
            Actualmente Resolveo no muestra anuncios ni integra Google AdSense.
            No se utilizan cookies de publicidad ni scripts de Google para
            publicidad. Si en el futuro se activa la publicidad, se utilizará
            el sistema de consentimiento de Google (CMP) y esta política se
            actualizará para reflejar las cookies y tecnologías que los
            proveedores publicitarios puedan utilizar.
          </p>
        </section>

        {/* ── Almacenamiento ────────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Almacenamiento local
          </h2>
          <p>
            Resolveo no utiliza{" "}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">
              localStorage
            </code>{" "}
            ni{" "}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">
              sessionStorage
            </code>{" "}
            para fines de analytics, tracking o consentimiento. El navegador no
            almacena datos de Resolveo más allá de la caché normal del
            navegador.
          </p>
        </section>
      </div>
    </div>
  );
}
