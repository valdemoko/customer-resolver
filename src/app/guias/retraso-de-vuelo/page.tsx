/**
 * Guía: Vuelo retrasado — derechos del pasajero.
 *
 * The cancellation problem page covers art. 5; delay is a different regime
 * (art. 6 for assistance, art. 8.1(a) for reimbursement, and the CJEU doctrine
 * that puts a three-hour delay on the same footing as a cancellation for
 * compensation). Kept as a guide because there is no delay analysis module.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { GuideFaq, GuideFooter, GuideLayout } from "@/components/GuideLayout";
import { getGuideBySlug } from "@/lib/guides";

const guide = getGuideBySlug("retraso-de-vuelo")!;

export const metadata: Metadata = {
  title: guide.metaTitle,
  description: guide.description,
  alternates: { canonical: "/guias/retraso-de-vuelo" },
  openGraph: {
    title: `${guide.title} — Resolveo`,
    description: guide.description,
    type: "article",
    locale: "es_ES",
    images: ["/og.png"],
  },
};

export default function RetrasoDeVueloPage() {
  return (
    <GuideLayout slug="retraso-de-vuelo">
      <div className="space-y-10">
        <p className="text-base text-[var(--color-ink-soft)] leading-relaxed">
          Un retraso no es una cancelación, pero comparte con ella casi todas sus consecuencias. Lo
          que cambia son los umbrales: el derecho a asistencia se activa por horas de espera según
          la distancia, el reembolso llega a partir de cinco horas y la compensación depende de la
          llegada al destino.
        </p>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Cuándo se aplica el Reglamento 261/2004
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
            El Reglamento (CE) 261/2004 protege a los pasajeros en los vuelos que salen de la Unión
            Europea y en los que llegan a la Unión desde fuera cuando el transportista es
            comunitario. Solo cuenta si tienes una reserva confirmada y te presentas al embarque
            dentro del horario indicado, salvo que la aerolínea te haya denegado el embarque.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Derecho a asistencia según la duración del retraso
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            El artículo 6 fija los umbrales de tiempo a partir de los cuales la aerolínea debe
            ocuparse de ti mientras esperas:
          </p>
          <ul className="space-y-2 mb-4">
            {[
              "Dos horas o más en vuelos de hasta 1.500 km.",
              "Tres horas o más en vuelos intracomunitarios de más de 1.500 km y en el resto de vuelos de entre 1.500 y 3.500 km.",
              "Cuatro horas o más en el resto de los vuelos.",
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
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
            Esa asistencia —comida y bebida en proporción al tiempo de espera, alojamiento cuando
            hay que pernoctar, transporte entre el aeropuerto y el alojamiento y dos llamadas o
            comunicaciones— se presta sin coste adicional. Si la aerolínea no la ofrece, conserva los
            justificantes de lo que hayas pagado por tu cuenta.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Reembolso si el retraso alcanza las cinco horas
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
            A partir de cinco horas de retraso puedes optar por el reembolso del precio del billete
            —y, si el retraso rompe el propósito del viaje, del trayecto ya realizado— o por un
            transporte alternativo hasta el destino final en condiciones comparables. El reembolso
            debe abonarse en un plazo máximo de siete días.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Compensación a partir de tres horas
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            El texto del Reglamento escribió la compensación para las cancelaciones, pero el
            Tribunal de Justicia de la Unión Europea resolvió que un retraso de tres horas o más en
            la llegada al destino final recibe el mismo trato. A partir de ahí, las cuantías son las
            del artículo 7.1, según la distancia:
          </p>
          <ul className="space-y-2">
            {[
              "250 euros para vuelos de hasta 1.500 km.",
              "400 euros para vuelos intracomunitarios de más de 1.500 km y para los demás vuelos de entre 1.500 y 3.500 km.",
              "600 euros para el resto de los vuelos.",
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
            Cuándo la aerolínea no compensa
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            La exención exige que el retraso se deba a circunstancias extraordinarias que no podrían
            haberse evitado incluso tomando todas las medidas razonables, y es la aerolínea quien
            tiene que demostrarlo, no tú quien deba justificarse.
          </p>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
            La jurisprudencia interpreta esa excepción de forma estricta: un problema técnico no
            suele considerarse una circunstancia extraordinaria. Cuando la aerolínea la invoque,
            pídele por escrito en qué consiste y guarda la respuesta.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Cómo reclamarlo
          </h2>
          <ol className="space-y-4">
            {[
              "Reclama primero a la aerolínea por su canal oficial, indicando vuelo, fechas, el retraso sufrido y qué pides: asistencia no cubierta, reembolso y compensación.",
              "Adjunta la reserva, el justificante del retraso (correo o mensaje de la aerolínea, tarjeta de embarque) y los gastos que reclames.",
              "Conserva el acuse: si no hay respuesta razonable, la reclamación pasa a la Agencia Estatal de Seguridad Aérea (AESA), que es el organismo competente en España.",
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-4">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-ink)] text-[var(--surface-paper)] text-xs font-medium flex items-center justify-center mt-0.5">
                  {index + 1}
                </span>
                <span className="text-sm text-[var(--color-ink-soft)] leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-xs text-[var(--color-ink-muted)] leading-relaxed">
            Si lo que ocurrió fue una cancelación, el supuesto es distinto y tiene su propio módulo
            de análisis:{" "}
            <Link
              href="/problemas/vuelo-cancelado"
              className="underline underline-offset-2 hover:text-[var(--color-ink)] transition-colors"
            >
              vuelo cancelado por la aerolínea
            </Link>
            . Los canales generales de reclamación están en la guía{" "}
            <Link
              href="/guias/como-reclamar"
              className="underline underline-offset-2 hover:text-[var(--color-ink)] transition-colors"
            >
              cómo reclamar una incidencia de consumo
            </Link>
            .
          </p>
        </section>
      </div>

      <GuideFaq slug="retraso-de-vuelo" />
      <GuideFooter slug="retraso-de-vuelo" />
    </GuideLayout>
  );
}
