import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { brand } from "@/lib/brand";
import { legalEntity } from "@/lib/legal-entity";

const COLUMNS: ReadonlyArray<{ title: string; links: ReadonlyArray<{ href: string; label: string }> }> = [
  {
    title: "Explorar",
    links: [
      { href: "/ciudades", label: "Ciudades" },
      { href: "/city/malaga/viewer", label: "Málaga en 3D" },
      { href: "/como-funciona", label: "Cómo funciona" },
      { href: "/preguntas-frecuentes", label: "Preguntas frecuentes" },
      { href: "/cuenta", label: "Mi cuenta" },
    ],
  },
  {
    title: "Comprar",
    links: [
      { href: "/legal/condiciones", label: "Condiciones de contratación" },
      { href: "/legal/pagos-y-devoluciones", label: "Pagos y sin devoluciones" },
      { href: "/legal/normas-de-contenido", label: "Normas de contenido" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/aviso-legal", label: "Aviso legal" },
      { href: "/legal/privacidad", label: "Privacidad" },
      { href: "/legal/cookies", label: "Cookies" },
    ],
  },
  {
    title: "Datos",
    links: [
      { href: "/city/malaga/datos", label: "Fuentes y licencias" },
      { href: "/atribuciones", label: "Atribuciones" },
      { href: "/contacto", label: "Contacto" },
    ],
  },
];

/** Pie común: navegación completa, avisos legales y la aclaración de que no es una oferta inmobiliaria. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[88rem] gap-10 px-4 py-12 sm:px-8 md:grid-cols-[1.5fr_repeat(4,1fr)]">
        <div>
          <Wordmark size="sm" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            Publicidad virtual sobre cartografía real. No es una oferta inmobiliaria ni promete revalorización.
          </p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Las compras son definitivas: no hay devoluciones. Tras comprar, tu espacio queda protegido cinco días.
          </p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="text-sm">
            <p className="font-medium text-ink">{column.title}</p>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-muted transition-colors hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[88rem] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 text-xs text-subtle sm:px-8">
          <p>
            © {new Date().getFullYear()} {legalEntity.name || brand.name}. Todos los derechos reservados.
          </p>
          <p>Pagos procesados por Stripe. Mapa con datos de OpenStreetMap y Catastro.</p>
        </div>
      </div>
    </footer>
  );
}
