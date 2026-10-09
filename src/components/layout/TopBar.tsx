"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bookmark, User } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { CatalogSearch } from "./CatalogSearch";
import { useCatalogStore } from "@/stores/catalog";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/ciudades", label: "Ciudades" },
  { href: "/como-funciona", label: "Cómo funciona" },
] as const;

/**
 * Barra superior. Fina y casi invisible sobre la portada; al hacer scroll gana un
 * fondo oscuro con desenfoque y una línea inferior. La ciudad es la protagonista.
 *
 * El acceso abre un panel informativo que declara el estado real (la
 * autenticación llega en la Fase D). No hay botón que finja un login.
 */
export function TopBar() {
  const favorites = useCatalogStore((s) => s.favorites);
  // Antes del montaje no se conoce el almacenamiento del navegador: se pinta 0
  // para que el HTML del servidor y el del cliente coincidan.
  const mounted = useMounted();
  const count = mounted ? favorites.length : 0;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled ? "border-line bg-ivory/80 backdrop-blur-md" : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-3 px-4 sm:gap-6 sm:px-8">
        <Link href="/" aria-label="Inicio" className="shrink-0">
          <Wordmark size="sm" />
        </Link>

        <nav className="hidden items-center gap-0.5 sm:flex" aria-label="Principal">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="link-draw rounded-sm px-2 py-1.5 text-sm text-muted transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex flex-1 items-center justify-end gap-2 sm:gap-3">
          <CatalogSearch className="max-w-[15rem] flex-1" />

          <Link
            href="/ciudades?filter=saved"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-sm text-muted transition-colors hover:bg-sunken hover:text-ink"
            aria-label={count > 0 ? `Guardadas: ${count}` : "Guardadas"}
            title="Guardadas en este navegador"
          >
            <Bookmark size={17} strokeWidth={1.75} />
            {count > 0 ? (
              <span className="tnum absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium leading-none text-on-accent">
                {count}
              </span>
            ) : null}
          </Link>

          <Link
            href="/cuenta"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-sm text-ink transition-colors hover:border-accent/60 hover:text-accent-ink"
          >
            <User size={15} strokeWidth={1.75} aria-hidden="true" />
            <span className="hidden sm:inline">Acceso</span>
          </Link>
        </div>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto px-3 pb-2 sm:hidden" aria-label="Principal (móvil)">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-sm px-2.5 py-1.5 text-sm text-muted hover:text-ink">
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
