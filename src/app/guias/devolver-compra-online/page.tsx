/**
 * Guía: Devolver una compra online — derecho de desistimiento.
 *
 * Covers the intent the problem pages do not: returning something that arrived
 * fine because you changed your mind. It is not a module, so it explains the
 * TRLGDCU rules (arts. 102–108) in prose instead of evaluating a case.
 */
import type { Metadata } from "next";
import Link from "next/link";

import { GuideFaq, GuideFooter, GuideLayout } from "@/components/GuideLayout";
import { getGuideBySlug } from "@/lib/guides";

const guide = getGuideBySlug("devolver-compra-online")!;

export const metadata: Metadata = {
  title: guide.metaTitle,
  description: guide.description,
  alternates: { canonical: "/guias/devolver-compra-online" },
  openGraph: {
    title: `${guide.title} — Resolveo`,
    description: guide.description,
    type: "article",
    locale: "es_ES",
    images: ["/og.png"],
  },
};

const EXCEPTIONS = [
  "Bienes confeccionados conforme a tus especificaciones o claramente personalizados.",
  "Bienes que puedan deteriorarse o caducar con rapidez.",
  "Bienes precintados que no sean aptos para su devolución por razones de higiene o salud y que hayas desprecintado.",
  "Grabaciones sonoras o de vídeo y programas informáticos precintados que hayas desprecintado.",
  "Contenido digital sin soporte material, cuando su ejecución haya comenzado con tu consentimiento previo y tu renuncia al derecho.",
  "Servicios ya prestados por completo, cuando la ejecución haya comenzado con tu consentimiento previo.",
];

export default function DevolverCompraOnlinePage() {
  return (
    <GuideLayout slug="devolver-compra-online">
      <div className="space-y-10">
        <p className="text-base text-[var(--color-ink-soft)] leading-relaxed">
          Que un producto llegue bien y no te convenza es un supuesto distinto de reclamar un
          defecto o un pedido que nunca apareció. Ese «he cambiado de idea» es el derecho de
          desistimiento, y tiene su propio plazo, sus excepciones y sus reglas sobre quién paga la
          vuelta.
        </p>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Qué es el derecho de desistimiento
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            Es la facultad de dejar sin efecto una compra sin necesidad de justificar la decisión ni
            alegar ningún defecto. Lo regula el Texto Refundido de la Ley General para la Defensa de
            los Consumidores y Usuarios (arts. 102 y siguientes).
          </p>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
            Se aplica a los contratos a distancia —online, teléfono, catálogo— y a los celebrados
            fuera del establecimiento, pero <strong className="text-[var(--color-ink)]">no</strong>{" "}
            a las compras en tienda física. En una compra presencial, devolver algo es una política
            comercial voluntaria de la tienda, no un derecho legal.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            El plazo: 14 días naturales
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            En la compra de bienes el plazo empieza cuando recibes el producto. La empresa está
            obligada a informarte de que ese derecho existe y de cómo ejercerlo; si no lo hace, el
            incumplimiento tiene consecuencias:
          </p>
          <ul className="space-y-2 mb-4">
            {[
              "Sin información, el plazo de desistimiento se amplía a doce meses.",
              "Si la empresa te informa dentro de esos doce meses, los 14 días empiezan a contar desde ese momento.",
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
            Para desistir no necesitas un formulario concreto: basta una comunicación inequívoca
            —un correo, el formulario de la web, una carta— en la que conste tu voluntad de dejar la
            compra sin efecto. Si la empresa ofrece un modelo de formulario, está obligada a
            facilitártelo, pero usarlo no es obligatorio.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Quién paga la devolución y cuándo te reembolsan
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            El reparto de gastos depende de lo que la empresa te informó antes de contratar:
          </p>
          <ul className="space-y-2 mb-4">
            {[
              "Si te advirtió de que asumirías el coste directo de devolver el producto, pagas tú el envío de vuelta.",
              "Si no te lo advirtió, ese coste no puede exigírtelo.",
              "El reembolso es de todo lo pagado, incluido el envío estándar de ida; los envíos adicionales que hayas elegido no se devuelven.",
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
            El reembolso debe producirse en un máximo de 14 días naturales desde que comunicas el
            desistimiento, con el mismo medio de pago que usaste salvo que acordéis otro. La empresa
            puede retener el dinero hasta recibir el producto o una prueba de que lo has enviado, si
            no se ofreció a recogerlo. Y tú tienes que devolver el bien sin demora indebida y, en
            todo caso, dentro de los 14 días siguientes a la comunicación.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Excepciones: cuándo no existe este derecho
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed mb-4">
            La ley excluye un listado cerrado de supuestos, entre ellos:
          </p>
          <ul className="space-y-2">
            {EXCEPTIONS.map((item) => (
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

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Haber abierto el producto no elimina el derecho
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
            Puedes desistir aunque hayas manipulado el bien para comprobar su naturaleza,
            características o funcionamiento. Lo que sí se descuenta es la pérdida de valor que
            resulte de una manipulación que vaya más allá de esa comprobación. Desprecintar un
            producto, por sí solo, no equivale a una devolución imposible salvo en los supuestos de
            higiene y de software o grabaciones que aparecen entre las excepciones.
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Desistimiento y garantía no son lo mismo
          </h2>
          <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">
            Si el producto está defectuoso, lo que tienes no es un desistimiento sino una falta de
            conformidad: cambian los plazos, los gastos y lo que puedes exigir. Ese caso tiene su
            propio análisis, con la regla de los tres años de responsabilidad y la presunción de los
            dos años, en{" "}
            <Link
              href="/problemas/garantia-rechazada"
              className="underline underline-offset-2 hover:text-[var(--color-ink)] transition-colors"
            >
              garantía rechazada
            </Link>
            . Y si el pedido directamente no llegó, el supuesto es{" "}
            <Link
              href="/problemas/pedido-no-llega"
              className="underline underline-offset-2 hover:text-[var(--color-ink)] transition-colors"
            >
              pedido que no llega
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
            Cómo hacerlo, paso a paso
          </h2>
          <ol className="space-y-4">
            {[
              "Localiza la fecha de recepción del producto: es el inicio del plazo de 14 días.",
              "Comunica el desistimiento por el canal oficial de la empresa y guarda el acuse o el número de referencia.",
              "Devuelve el bien dentro de los 14 días siguientes a esa comunicación, conservando el justificante de envío.",
              "Revisa que el reembolso llegue en el plazo de 14 días y por el medio de pago original.",
              "Si no llega, reclama por escrito y, si sigue sin resolverse, acude al servicio de consumo o a la hoja de reclamaciones.",
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
            El proceso completo de reclamación, con los canales y organismos, está en la guía{" "}
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

      <GuideFaq slug="devolver-compra-online" />
      <GuideFooter slug="devolver-compra-online" />
    </GuideLayout>
  );
}
