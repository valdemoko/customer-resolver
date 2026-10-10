import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { TopBar } from "@/components/layout/TopBar";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  description: "Respuestas claras sobre cómo comprar un espacio, el precio, la protección de cinco días y por qué no hay devoluciones.",
  alternates: { canonical: "/preguntas-frecuentes" },
};

const FAQ: ReadonlyArray<{ group: string; items: ReadonlyArray<{ q: string; a: React.ReactNode }> }> = [
  {
    group: "Comprar un espacio",
    items: [
      {
        q: "¿Qué estoy comprando exactamente?",
        a: "El derecho a mostrar tu anuncio (nombre, texto, web y una foto) en un espacio virtual del mapa 3D: un edificio, un local, un tramo de muralla, un panel de barco… No compras ningún inmueble ni derecho real sobre él.",
      },
      {
        q: "¿Qué son los espacios en amarillo?",
        a: "Son 100 edificios sin nombre y 20 locales que regalamos: tu primer anuncio ahí no cuesta nada. Necesitas una cuenta de Google y puedes reclamar hasta 3 por cuenta. Quedan protegidos cinco días y, después, el siguiente comprador paga 1,00 € y la escalera de precios sigue como en cualquier otro espacio.",
      },
      {
        q: "¿Qué son los camiones?",
        a: "Doce camiones de carga recorren las calles de Málaga con un anuncio en la caja, por las dos caras. Se compran como cualquier otro espacio y tu anuncio viaja con el camión.",
      },
      {
        q: "¿Cuánto cuesta?",
        a: "La primera compra de un espacio cuesta 1,00 €. Cada compra sube un 25 % el precio de la siguiente compra de ese mismo espacio: 1,00 €, 1,25 €, 1,56 €, 1,95 €… El precio exacto lo ves antes de pagar.",
      },
      {
        q: "¿Necesito cuenta?",
        a: "No. Puedes comprar como invitado. Si luego entras con Google con el mismo correo con el que pagaste, tus compras de invitado aparecen solas en Mi cuenta. Si entras antes de pagar, también quedan guardadas.",
      },
      {
        q: "¿Cómo se paga?",
        a: "Con Stripe, en su página de pago segura. Nosotros nunca vemos los datos de tu tarjeta.",
      },
      {
        q: "¿Puedo ver cómo quedará antes de pagar?",
        a: "Sí. El estudio de compra te enseña una vista previa en 3D con tu foto en las caras y el techo, y puedes ajustar el encuadre: ampliar y mover la foto a izquierda, derecha, arriba o abajo.",
      },
    ],
  },
  {
    group: "Después de comprar",
    items: [
      {
        q: "¿Pueden quitarme el espacio?",
        a: "No durante los cinco días siguientes a tu compra: el espacio queda protegido y nadie puede comprarlo. Pasados los cinco días, cualquiera puede comprarlo por el precio siguiente y su anuncio sustituirá al tuyo.",
      },
      {
        q: "¿Cuánto tiempo estará mi anuncio?",
        a: "Hasta que otra persona compre el espacio. Solo se garantizan los cinco días de protección.",
      },
      {
        q: "¿Puedo cambiar mi anuncio después de pagar?",
        a: "Sí, sin coste, mientras el espacio siga siendo tuyo. Si compraste conectado con Google, abre tu espacio en el mapa y pulsa «Editar mi anuncio». Si compraste como invitado, el navegador en el que pagaste te lo ofrece, y puedes copiar tu enlace de edición privado para usarlo en otro dispositivo. Editar no reinicia la protección de cinco días.",
      },
      {
        q: "¿Y si dos personas pagan a la vez el mismo espacio?",
        a: "Gana quien complete el pago primero. A la otra persona se le devuelve el importe completo de forma automática.",
      },
    ],
  },
  {
    group: "Devoluciones y reclamaciones",
    items: [
      {
        q: "¿Hay devoluciones?",
        a: (
          <>
            No. Las compras son definitivas, también si cambias de opinión o si alguien te sustituye pasados los cinco días. Las excepciones (pago duplicado, error técnico, pago no aplicado) están en{" "}
            <Link href="/legal/pagos-y-devoluciones" className="underline underline-offset-2 hover:text-ink">
              Pagos y sin devoluciones
            </Link>
            .
          </>
        ),
      },
      {
        q: "He visto un anuncio que incumple las normas. ¿Qué hago?",
        a: (
          <>
            Cópiale el enlace con «Copiar enlace» y escríbenos desde la página de{" "}
            <Link href="/contacto" className="underline underline-offset-2 hover:text-ink">
              contacto
            </Link>
            . Revisamos qué se puede publicar en las{" "}
            <Link href="/legal/normas-de-contenido" className="underline underline-offset-2 hover:text-ink">
              normas de contenido
            </Link>
            .
          </>
        ),
      },
    ],
  },
  {
    group: "El mapa",
    items: [
      {
        q: "¿De dónde sale el mapa?",
        a: (
          <>
            De cartografía pública (OpenStreetMap y el Catastro, entre otras). Cada capa declara su fuente y licencia en{" "}
            <Link href="/city/malaga/datos" className="underline underline-offset-2 hover:text-ink">
              datos, fuentes y licencias
            </Link>
            .
          </>
        ),
      },
      {
        q: "¿Las alturas son exactas?",
        a: "No siempre. Se toman de la mejor fuente disponible y, si no hay dato, se estiman. El mapa es una representación, no un plano oficial.",
      },
      {
        q: "¿Habrá más ciudades?",
        a: "Málaga es la ciudad inaugural. Se irán abriendo otras; las verás en la página de ciudades.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6">
        <h1 className="display-face text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">Preguntas frecuentes</h1>
        <p className="mt-4 max-w-[60ch] text-base text-muted">Lo que conviene saber antes de comprar un espacio.</p>

        <div className="mt-10 space-y-10">
          {FAQ.map((group) => (
            <section key={group.group} aria-labelledby={`faq-${group.group}`}>
              <h2 id={`faq-${group.group}`} className="display-face text-xl font-medium tracking-[-0.02em] text-ink">
                {group.group}
              </h2>
              <div className="mt-3 divide-y divide-line rounded-3xl border border-line">
                {group.items.map((item) => (
                  <details key={item.q} className="group px-5 py-4">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[0.95rem] font-medium text-ink [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <span aria-hidden="true" className="mt-0.5 text-muted transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <div className="mt-2.5 max-w-[62ch] text-sm leading-relaxed text-muted">{item.a}</div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
