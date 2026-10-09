"use client";

import { useEffect, useMemo } from "react";
import { MapPin, SearchX, Search } from "lucide-react";
import { CityCard } from "./CityCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { matchesQuery, searchIndex } from "@/lib/search";
import type { CityConfig } from "@/lib/cities/schema";
import { cn } from "@/lib/cn";
import { useMounted } from "@/lib/use-mounted";
import { useCatalogStore, type CatalogFilter } from "@/stores/catalog";

const FILTERS: { id: CatalogFilter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "available", label: "Disponibles" },
  { id: "saved", label: "Guardadas" },
];

/**
 * Catálogo. Recibe las ciudades ya validadas desde el componente de servidor:
 * el filtrado ocurre en el cliente sin volver a pedir datos, así que la
 * búsqueda es instantánea.
 */
export function CatalogBrowser({
  cities,
  initialQuery,
  initialFilter,
}: {
  cities: CityConfig[];
  initialQuery: string;
  initialFilter: CatalogFilter;
}) {
  const query = useCatalogStore((s) => s.query);
  const filter = useCatalogStore((s) => s.filter);
  const sort = useCatalogStore((s) => s.sort);
  const favorites = useCatalogStore((s) => s.favorites);
  const setQuery = useCatalogStore((s) => s.setQuery);
  const setFilter = useCatalogStore((s) => s.setFilter);
  const setSort = useCatalogStore((s) => s.setSort);
  const toggleFavorite = useCatalogStore((s) => s.toggleFavorite);

  // Las preferencias del navegador no se conocen hasta el montaje. La
  // rehidratación ya se lanzó al cargar el módulo del store.
  const mounted = useMounted();

  // Sembrar desde la URL (?q= y ?filter=) una sola vez, sin pisar lo que el
  // usuario ya haya escrito en la barra.
  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
    setFilter(initialFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  const indexes = useMemo(
    () => new Map(cities.map((city) => [city.slug, searchIndex(city)])),
    [cities],
  );

  const visible = useMemo(() => {
    const filtered = cities.filter((city) => {
      if (!matchesQuery(indexes.get(city.slug) ?? "", query)) return false;
      if (filter === "available") return city.status === "available";
      if (filter === "saved") return favorites.includes(city.slug);
      return true;
    });

    if (sort === "name") {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name, "es"));
    }
    // "relevance": el orden del servidor (disponibles primero, luego alfabético).
    return filtered;
  }, [cities, indexes, query, filter, favorites, sort]);

  const isFiltering = query.trim().length > 0 || filter !== "all";

  if (cities.length === 0) {
    return (
      <EmptyState
        icon={<MapPin size={28} strokeWidth={1.5} />}
        title="Todavía no hay ninguna ciudad publicada"
        description="El catálogo se irá llenando a medida que cada ciudad tenga su cartografía verificada y su paquete de datos publicado. Preferimos no anunciar ciudades que aún no podemos mostrar."
      />
    );
  }

  return (
    <div>
      {/* Controles */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div
          role="group"
          aria-label="Filtrar ciudades"
          className="flex items-center gap-1 rounded-sm border border-line bg-surface p-0.5"
        >
          {FILTERS.map((option) => {
            const active = filter === option.id;
            const disabled = option.id === "saved" && mounted && favorites.length === 0;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => setFilter(option.id)}
                className={cn(
                  "rounded-[4px] px-2.5 py-1.5 text-sm transition-colors duration-150 ease-out-soft",
                  active ? "bg-ink text-ivory" : "text-muted hover:text-ink",
                  disabled && "cursor-not-allowed opacity-40 hover:text-muted",
                )}
              >
                {option.label}
                {option.id === "saved" && mounted && favorites.length > 0 ? (
                  <span className="tnum ml-1.5 opacity-70">{favorites.length}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          <span className="hidden sm:inline">Orden</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as "relevance" | "name")}
            className="h-8 rounded-sm border border-line bg-surface px-2 text-sm text-ink focus:outline-none"
          >
            <option value="relevance">Recomendado</option>
            <option value="name">Nombre (A–Z)</option>
          </select>
        </label>
      </div>

      {/* Recuento y aviso de favoritos locales */}
      <p className="mb-4 text-sm text-muted" aria-live="polite">
        {visible.length === 1 ? "1 ciudad" : `${visible.length} ciudades`}
        {mounted && (filter === "saved" || favorites.length > 0)
          ? " · Las guardadas se almacenan solo en este navegador"
          : null}
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon={<SearchX size={28} strokeWidth={1.5} />}
          title={filter === "saved" ? "No has guardado ninguna ciudad" : "Sin resultados"}
          description={
            filter === "saved"
              ? "Pulsa el icono de estrella en una ciudad para guardarla aquí. Cuando exista cuenta, tus favoritos se sincronizarán."
              : `Ninguna ciudad coincide con «${query}». Prueba con otro nombre, o cambia el filtro.`
          }
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              <Search size={14} strokeWidth={1.9} aria-hidden="true" />
              Ver todas las ciudades
            </Button>
          }
        />
      ) : (
        <ul className="grid list-none gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((city, index) => (
            <li key={city.id}>
              <CityCard
                city={city}
                isFavorite={mounted && favorites.includes(city.slug)}
                onToggleFavorite={toggleFavorite}
                priority={index === 0}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
