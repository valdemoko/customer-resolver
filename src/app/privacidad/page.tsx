/**
 * Política de Privacidad — Resolveo.
 *
 * Rewritten in the 2026-09-22 post-audit pass. The previous version omitted
 * the controller, said the data "is not shared with other third parties" while
 * the code sends case text to AI providers, and did not mention retention. All
 * statements here describe what the code actually does.
 */
import type { Metadata } from "next";

const CONTACT_EMAIL = "contacto.webproyectos@gmail.com";

export const metadata: Metadata = {
  title: "Privacidad",
  description:
    "Política de privacidad de Resolveo: qué datos recopilamos, quién los trata, dónde se procesan, cuánto se conservan y qué control tienes sobre ellos.",
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
        {/* ── 1. Responsable ────────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Quién trata tus datos
          </h2>
          <p className="mb-3">
            Resolveo es un proyecto independiente que mantiene el sitio{" "}
            <span className="font-medium text-slate-800">resolveo.site</span>. La
            persona responsable del tratamiento de los datos de este sitio es
            quien lo mantiene y puede ser contactada en{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Privacidad`}
              className="text-slate-900 underline underline-offset-2 hover:text-slate-700 transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
            , que es también el canal para ejercer los derechos descritos más
            abajo.
          </p>
          <p>
            Resolveo no es un despacho jurídico, no presta servicios legales y
            no dispone de cuentas de usuario: un caso se consulta con su
            identificador único.
          </p>
        </section>

        {/* ── 2. Datos que recopilamos ──────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Qué datos recopilamos
          </h2>
          <p className="mb-3">
            Únicamente la información que proporcionas voluntariamente al crear
            un caso:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Datos del caso:</strong> fechas, importes, empresa
              implicada, descripción del problema y las respuestas que das al
              cuestionario.
            </li>
            <li>
              <strong>Documentos:</strong> los archivos que subes como
              evidencia y el texto que se extrae de ellos.
            </li>
            <li>
              <strong>Correo de contacto:</strong> si nos escribes, la dirección
              desde la que lo haces y el contenido del mensaje.
            </li>
          </ul>
          <p className="mt-3">
            No pedimos nombre, DNI, dirección postal ni datos de pago, y el
            cuestionario no los solicita. Si en la descripción incluyes datos
            personales por iniciativa propia, se tratarán con la misma finalidad
            y las mismas garantías que el resto del caso.
          </p>
        </section>

        {/* ── 3. Quién más interviene ───────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Qué proveedores técnicos intervienen
          </h2>
          <p className="mb-3">
            Para que el servicio funcione, el contenido que envías pasa por
            proveedores que actúan como encargados del tratamiento, cada uno con
            una función concreta:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong>Alojamiento:</strong> el sitio y sus funciones se ejecutan
              en infraestructura de Vercel, que puede procesar peticiones en
              centros de datos de la Unión Europea y de Estados Unidos.
            </li>
            <li>
              <strong>Base de datos:</strong> los casos se almacenan en una base
              de datos PostgreSQL gestionada por Neon, alojada en la Unión
              Europea (región de Fráncfort).
            </li>
            <li>
              <strong>Modelos de lenguaje:</strong> el texto de tu caso, tus
              respuestas y el texto extraído de los documentos se envían a
              proveedores de modelos de lenguaje (Groq y OpenAI) para
              interpretar el problema y extraer los datos que faltan. No se
              envían a esos proveedores tu dirección de correo ni tu
              identificador de caso como tal.
            </li>
            <li>
              <strong>Almacenamiento de archivos:</strong> si envías documentos,
              el archivo original se guarda en almacenamiento de objetos de
              Cloudflare (R2) cuando esa función está activa; el análisis del
              texto se realiza igualmente aunque el guardado del binario no esté
              disponible.
            </li>
            <li>
              <strong>Analítica:</strong> Plausible Analytics (Estonia, Unión
              Europea), con métricas agregadas y sin cookies.
            </li>
            <li>
              <strong>Correo:</strong> si escribes a la dirección de contacto, el
              proveedor de correo utilizado para gestionarla.
            </li>
          </ul>
          <p className="mt-3">
            Tus datos no se venden ni se ceden con fines publicitarios. La
            comunicación a estos proveedores se limita a lo necesario para
            prestar el servicio y se ampara en los contratos de encargo
            correspondientes. Cuando un proveedor está fuera del Espacio
            Económico Europeo, la transferencia se realiza con las garantías
            previstas en el RGPD (cláusulas contractuales tipo).
          </p>
        </section>

        {/* ── 4. Base jurídica ──────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Con qué base tratamos los datos
          </h2>
          <p>
            La base jurídica es tu consentimiento, que otorgas al enviar la
            información para que se analice tu caso (art. 6.1.a del RGPD).
            Puedes retirarlo en cualquier momento solicitando la eliminación del
            caso, sin que ello afecte a la licitud del tratamiento realizado
            antes. Para las métricas de audiencia, la base es el interés
            legítimo en conocer de forma agregada cómo se usa el sitio, sin
            identificar a nadie.
          </p>
        </section>

        {/* ── 5. Aviso sobre el análisis ────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Cómo se elabora el análisis
          </h2>
          <p>
            El informe no se redacta a mano para cada persona: se compone a
            partir de reglas vinculadas a normativa oficial y de la información
            que facilitas, y utiliza modelos de lenguaje para interpretar tu
            descripción y extraer datos de los documentos. Las conclusiones
            indican qué artículo y qué datos las sustentan, y el sistema declara
            expresamente los puntos que no puede determinar en lugar de
            completarlos. No constituye asesoramiento jurídico individualizado.
          </p>
        </section>

        {/* ── 6. Analítica web ──────────────────────────────────── */}
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

        {/* ── 7. Cookies ────────────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Cookies
          </h2>
          <p>
            Resolveo <strong>no utiliza cookies</strong>. Ni cookies propias ni
            de terceros, ni almacenamiento del navegador: el estado de un caso se
            guarda en el servidor. Para más detalles, consulta nuestra{" "}
            <a
              href="/cookies"
              className="text-slate-900 underline underline-offset-2 hover:text-slate-700 transition-colors"
            >
              política de cookies y almacenamiento
            </a>
            .
          </p>
        </section>

        {/* ── 8. Anuncios ───────────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Anuncios
          </h2>
          <p>
            Actualmente el sitio no muestra anuncios ni utiliza Google AdSense.
            No hay scripts de publicidad de terceros. Si en el futuro se activa
            la monetización mediante anuncios, se utilizará el sistema de
            consentimiento de Google (Privacy &amp; Messaging) para gestionar la
            decisión del usuario conforme a la normativa europea, y esta política
            se actualizará antes de activarla para identificar a los proveedores
            y detallar qué datos pueden tratar.
          </p>
        </section>

        {/* ── 9. Conservación ───────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Cuánto tiempo se conservan los datos
          </h2>
          <p className="mb-3">
            Los datos del caso se conservan mientras sean necesarios para que
            puedas consultar el informe y sus documentos asociados. No existe un
            sistema de cuentas que los mantenga indefinidamente vinculados a ti:
            el acceso requiere conocer el identificador del caso.
          </p>
          <p>
            Puedes solicitar la eliminación anticipada de un caso escribiendo a{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Eliminación de caso`}
              className="text-slate-900 underline underline-offset-2 hover:text-slate-700 transition-colors"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            e indicando su identificador. Si enviaste un correo al canal de
            contacto, se conserva únicamente mientras sea necesario para
            atenderlo.
          </p>
        </section>

        {/* ── 10. Tus derechos ──────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Tus derechos
          </h2>
          <p className="mb-3">
            Puedes solicitar el acceso, la rectificación, la supresión, la
            limitación del tratamiento, la portabilidad de tus datos y oponerte
            al tratamiento escribiendo a{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Consulta de privacidad`}
              className="text-slate-900 underline underline-offset-2 hover:text-slate-700 transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
            . Para localizar un caso necesitamos su identificador; no podemos
            buscar por nombre porque no lo pedimos.
          </p>
          <p>
            Si consideras que no hemos atendido correctamente tu solicitud,
            puedes presentar una reclamación ante la Agencia Española de
            Protección de Datos (
            <a
              href="https://www.aepd.es"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-900 underline underline-offset-2 hover:text-slate-700 transition-colors"
            >
              aepd.es
            </a>
            ).
          </p>
        </section>

        {/* ── 11. Cambios ───────────────────────────────────────── */}
        <section>
          <h2
            className="text-lg font-semibold text-slate-900 mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            Cambios en esta política
          </h2>
          <p>
            Esta política puede actualizarse cuando cambien las herramientas
            utilizadas o se modifiquen las prácticas de tratamiento de datos. La
            fecha de última actualización indica cuándo se revisó por última vez.
          </p>
        </section>
      </div>
    </div>
  );
}
