/**
 * Guía: Cómo reclamar una incidencia de consumo.
 *
 * Process guide, not a per-problem analysis: it explains the order of the
 * channels and what each organism actually does. It deliberately states no
 * claiming deadlines, because no registered source fixes one for consumer
 * claims in general.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { GuideFaq, GuideFooter, GuideLayout } from "@/components/GuideLayout";
import { getGuideBySlug } from "@/lib/guides";

const guide = getGuideBySlug("como-reclamar")!;

export const metadata: Metadata = {
  title: guide.metaTitle,
  description: guide.description,
  alternates: { canonical: "/guias/como-reclamar" },
  openGraph: {
    title: `${guide.title} — Resolveo`,
    description: guide.description,
    type: "article",
    locale: "es_ES",
    images: ["/og.png"],
  },
};

export default function ComoReclamarPage() {
  return (
    <GuideLayout slug="como-reclamar">
      <div className="space-y-10">
        <p className="text-base text-[var(--color-ink-soft)] leading-relaxed">
          Reclamar bien es una secuencia, no un trámite suelto. Si empiezas por el organismo
          equivocado, lo más probable es que te remitan a la empresa y hayas perdido semanas. Esta
          guía ordena los pasos y explica qué hace realmente cada canal.
        </p>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Antes de nada: reúne la prueba
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            La mayoría de reclamaciones no se pierden por falta de razón, sino por falta de fecha.
            Antes de escribir nada, reúne:
          </p>
          <ul className="space-y-2">
            {[
              "El documento de compra: factura, ticket, confirmación de pedido o contrato.",
              "La fecha exacta en que ocurrió lo que reclamas (recepción, aviso, cobro, baja).",
              "Las comunicaciones con la empresa, con sus fechas, en el canal en que se produjeron.",
              "Los justificantes de gastos, si reclamas alguno.",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-sm text-[var(--color-ink-soft)] leading-relaxed"
              >
                <span className="flex-shrink-0 w-1 h-1 rounded-full bg-[var(--color-accent)] mt-2" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Paso 1: reclama a la empresa, por escrito
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            La ley no impone un modelo ni un formulario concreto, pero sí importa poder demostrar qué
            pediste y cuándo. Usa el canal oficial de la empresa —formulario del área de cliente,
            correo de atención— y pide siempre un número de referencia o un acuse.
          </p>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
            Escribe de forma concreta: qué ha pasado, con qué fechas, qué documentación adjuntas y
            qué pides exactamente (devolución del importe, reparación, baja sin coste, compensación).
            Una reclamación vaga se responde con una negativa vaga.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Paso 2: las hojas de reclamaciones
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            La hoja de reclamaciones es el documento oficial de queja. Los establecimientos abiertos
            al público deben tenerlas a disposición del cliente; el formato y la posible exención de
            locales muy pequeños dependen de la comunidad autónoma. Se rellena por triplicado y una
            copia se queda contigo: esa copia sellada es tu prueba.
          </p>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
            La hoja no resuelve el conflicto por sí sola. Acredita la queja por una vía oficial y
            gratuita y hace que el asunto entre en el circuito de consumo. En una compra online no
            hay hoja física: se reclama por el canal de la empresa o directamente ante el servicio de
            consumo que corresponda a tu domicilio.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Paso 3: los servicios públicos de consumo
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            Las oficinas municipales de información al consumidor (OMIC) y los servicios de consumo
            de las comunidades autónomas son gratuitos. Informan, tramitan reclamaciones y, sobre
            todo, median entre tú y la empresa: trasladan la queja y tratan de acercar posturas.
          </p>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
            Conviene presentar la reclamación ante el servicio que corresponde a tu domicilio, no
            ante el de la sede de la empresa. Adjunta la documentación del punto anterior y la prueba
            de que ya te has dirigido a la empresa.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Paso 4: la junta arbitral de consumo
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            El sistema arbitral de consumo es la vía gratuita que puede acabar en una decisión
            obligatoria sin ir a los tribunales. Su límite es el mismo que su fuerza: la empresa debe
            estar adherida al sistema o aceptar el arbitraje de ese caso concreto. Si rechaza el
            arbitraje, no hay laudo.
          </p>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
            Cuando la empresa acepta, el laudo que dicta la junta es vinculante para las dos partes y
            tiene el mismo valor que una sentencia firme. Antes de solicitarlo merece la pena
            comprobar si la empresa figura en la lista de adheridas.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Canales específicos según el sector
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            Algunos sectores tienen su propio organismo además del servicio de consumo, y suelen ser
            más rápidos para lo suyo:
          </p>
          <ul className="space-y-3">
            <li className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
              <strong className="text-[var(--color-ink)]">Aviación.</strong> La Agencia Estatal de
              Seguridad Aérea (AESA) vela por el cumplimiento del Reglamento 261/2004 en España.
              Para cancelaciones y retrasos, ver{" "}
              <Link
                href="/problemas/vuelo-cancelado"
                className="underline underline-offset-2 hover:text-[var(--color-ink)] transition-colors"
              >
                vuelo cancelado por la aerolínea
              </Link>
              .
            </li>
            <li className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
              <strong className="text-[var(--color-ink)]">Telecomunicaciones.</strong> La Oficina de
              Atención al Usuario de Telecomunicaciones (SETELECO) es la vía específica cuando la
              empresa no responde. Encaja con casos como{" "}
              <Link
                href="/problemas/cancelacion-cargo-posterior"
                className="underline underline-offset-2 hover:text-[var(--color-ink)] transition-colors"
              >
                el cargo posterior a una cancelación
              </Link>
              .
            </li>
            <li className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
              <strong className="text-[var(--color-ink)]">Compras a empresas de otro país de la UE.</strong>{" "}
              El Centro Europeo del Consumidor ayuda a tramitar reclamaciones transfronterizas.
            </li>
            <li className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
              <strong className="text-[var(--color-ink)]">Servicios financieros.</strong> El Banco de
              España atiende reclamaciones sobre servicios bancarios y la CNMV sobre productos de
              inversión; en ambos casos, después de reclamar al servicio de atención al cliente.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Qué no resuelve una reclamación
          </h2>
          <ul className="space-y-2">
            {[
              "No decide tu caso si la empresa mantiene su posición: la última instancia es la vía judicial.",
              "No hay un plazo único de reclamación: cada problema tiene su propia norma y sus propios plazos, y por eso las fichas de problema los detallan por separado.",
              "No convierte una queja genérica en un derecho: hay que concretar qué se pide y con qué base.",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 text-sm text-[var(--color-ink-soft)] leading-relaxed"
              >
                <span className="flex-shrink-0 w-1 h-1 rounded-full bg-[var(--color-contradicted)] mt-2" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <GuideFaq slug="como-reclamar" />
      <GuideFooter slug="como-reclamar" />
    </GuideLayout>
  );
}
