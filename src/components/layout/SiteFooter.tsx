import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { brand } from "@/lib/brand";

/** Pie común: avisos legales reales y la aclaración de que no es una oferta inmobiliaria. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[88rem] gap-8 px-4 py-10 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark size="sm" />
          <p className="mt-4 max-w-sm text-sm text-muted">
            Publicidad virtual sobre cartografía real. No es una oferta inmobiliaria ni promete
            revalorización.
          </p>
        </div>
        <nav aria-label="Explorar" className="text-sm">
          <p className="text-subtle">Explorar</p>
          <ul className="mt-3 space-y-2">
            <li><Link href="/ciudades" className="text-muted hover:text-ink">Ciudades</Link></li>
            <li><Link href="/como-funciona" className="text-muted hover:text-ink">Cómo funciona</Link></li>
            <li><Link href="/city/malaga/datos" className="text-muted hover:text-ink">Datos, fuentes y licencias</Link></li>
            <li><Link href="/atribuciones" className="text-muted hover:text-ink">Atribuciones</Link></li>
          </ul>
        </nav>
        <nav aria-label="Legal" className="text-sm">
          <p className="text-subtle">Legal</p>
          <ul className="mt-3 space-y-2">
            <li><Link href="/legal/aviso-legal" className="text-muted hover:text-ink">Aviso legal</Link></li>
            <li><Link href="/legal/privacidad" className="text-muted hover:text-ink">Privacidad</Link></li>
            <li><Link href="/legal/cookies" className="text-muted hover:text-ink">Cookies</Link></li>
            <li><Link href="/legal/condiciones" className="text-muted hover:text-ink">Condiciones</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[88rem] px-4 py-4 text-xs text-subtle sm:px-8">
          © {new Date().getFullYear()} {brand.name}
        </p>
      </div>
    </footer>
  );
}
