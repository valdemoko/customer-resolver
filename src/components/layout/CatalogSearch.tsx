"use client";

import { useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { useCatalogStore } from "@/stores/catalog";

/**
 * Buscador de ciudades. Escribe directamente en el store del catálogo, así que
 * la búsqueda es instantánea y no provoca navegación ni recarga.
 */
export function CatalogSearch({ className }: { className?: string }) {
  const query = useCatalogStore((s) => s.query);
  const setQuery = useCatalogStore((s) => s.setQuery);
  const router = useRouter();
  const pathname = usePathname();

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        // Fuera del catálogo, Intro lleva a los resultados.
        if (pathname !== "/ciudades") router.push(`/ciudades${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
      }}
      className={className}
    >
      <div className="relative">
        <Search
          size={15}
          strokeWidth={1.9}
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar ciudad o país"
          aria-label="Buscar ciudad o país"
          autoComplete="off"
          className="h-9 w-full rounded-full border border-line bg-surface/70 pl-8 pr-8 text-sm text-ink placeholder:text-subtle focus:border-accent/70 focus:bg-surface"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Borrar búsqueda"
            className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-subtle hover:text-ink"
          >
            <X size={14} strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </form>
  );
}
