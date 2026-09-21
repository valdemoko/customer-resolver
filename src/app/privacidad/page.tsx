/**
 * Política de Privacidad — Resolveo.
 *
 * Last updated to reflect:
 * - Plausible Analytics (cookieless, no consent required)
 * - AdSense not yet active
 * - No tracking cookies
 */
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidad",
  description:
    "Política de privacidad de Resolveo. Qué datos recopilamos, cómo los utilizamos y qué control tienes sobre ellos.",
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

      <p className="text-sm text-slate-400 mb-8">
        Última actualización: septiembre de 2026
      </p>

      <div className="space-y-8 text-slate-600 leading-relaxed">
        {/* ── 1. Datos que recopilamos ──────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Qué datos recopilamos
          </h2>
          <p className="mb-3">
            Resolveo recopila únicamente la información que proporcionas
            voluntariamente al crear un caso:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Datos del caso (fechas, importes, descripciones).</li>
            <li>Documentos que subas como evidencia.</li>
            <li>Datos de contacto si nos escribes por correo electrónico.</li>
          </ul>
        </section>

        {/* ── 2. Analítica web ──────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Analítica web
          </h2>
          <p className="mb-3">
            Utilizamos{" "}
            <a
              href="https://plausible.io"
              className="text-slate-900 underline underline-offset-2 hover:text-slate-700 transition-colors"
            >
              Plausible Analytics
            </a>{" "}
            para medir el tráfico de forma agregada y mejorar el servicio.
            Plausible es un proveedor de analytics con sede en la Unión Europea
            (Estonia).
          </p>
          <p className="mb-3">
            Plausible <strong>no utiliza cookies</strong> ni identificadores
            persistentes. No genera perfiles de usuario ni permite el rastreo
            entre sesiones o dispositivos. La dirección IP se utiliza únicamente
            para determinar el país de procedencia y no se almacena.
          </p>
          <p className="mb-3">
            La información procesada incluye: URL visitada, referente,
            navegador, sistema operativo, tipo de dispositivo y país. Todos los
            datos se procesan y almacenan en la UE.
          </p>
          <p className="mb-3">
            Dado que Plausible no utiliza cookies ni recopila datos personales,
            su uso no requiere consentimiento previo bajo el RGPD ni la
            Directiva ePrivacy.
          </p>
        </section>

        {/* ── 3. Cookies ────────────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Cookies
          </h2>
          <p>
            Resolveo <strong>no utiliza cookies</strong>. Ni cookies propias ni
            de terceros. Para más detalles, consulta nuestra{" "}
            <a
              href="/cookies"
              className="text-slate-900 underline underline-offset-2 hover:text-slate-700 transition-colors"
            >
              política de cookies y almacenamiento
            </a>
            .
          </p>
        </section>

        {/* ── 4. Cómo utilizamos los datos ──────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Cómo utilizamos los datos
          </h2>
          <p>
            Los datos de los casos se utilizan exclusivamente para procesar tu
            consulta: evaluar la información según las normativas aplicables,
            generar un informe estructurado y proponer acciones. Los datos de
            analytics se utilizan exclusivamente para entender el uso del
            servicio de forma agregada. No se utilizan para fines publicitarios
            ni se comparten con otros terceros.
          </p>
        </section>

        {/* ── 5. Anuncios ───────────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Anuncios
          </h2>
          <p>
            Actualmente el sitio no muestra anuncios ni utiliza Google AdSense.
            Si en el futuro se activa la monetización mediante anuncios, se
            utilizará el sistema de consentimiento de Google (Privacy &amp;
            Messaging) para gestionar el consentimiento del usuario conforme a
            la normativa europea. En ese caso, esta política se actualizará
            para reflejar los nuevos proveedores y los datos que estos puedan
            procesar.
          </p>
        </section>

        {/* ── 6. Almacenamiento ──────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Almacenamiento de casos
          </h2>
          <p>
            Los casos se almacenan de forma segura. Actualmente no existe un
            sistema de cuentas de usuario. El acceso a un caso se realiza
            mediante su identificador único.
          </p>
        </section>

        {/* ── 7. Tus derechos ───────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Tus derechos
          </h2>
          <p>
            Puedes solicitar acceso, rectificación o eliminación de tus datos
            escribiendo a{" "}
            <a
              href="mailto:contacto.webproyectos@gmail.com?subject=Consulta de privacidad"
              className="text-slate-900 underline underline-offset-2 hover:text-slate-700 transition-colors"
            >
              contacto.webproyectos@gmail.com
            </a>
            .
          </p>
        </section>

        {/* ── 8. Cambios en esta política ────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Cambios en esta política
          </h2>
          <p>
            Esta política puede actualizarse cuando cambien las herramientas
            utilizadas o se modifiquen las prácticas de tratamiento de datos.
            La fecha de última actualización indica cuándo se revisó por última
            vez.
          </p>
        </section>
      </div>
    </div>
  );
}
