"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Flag, Lock, MapPin, Search, SearchX, Star, X } from "lucide-react";
import { Reveal, SpotCard } from "@/components/marketing/Reveal";
import { cn } from "@/lib/cn";
import { INAUGURAL_CITY } from "@/lib/brand";
import { matchesQuery } from "@/lib/search";
import { useMounted } from "@/lib/use-mounted";
import { useCatalogStore, type CatalogFilter } from "@/stores/catalog";

/** Lo mínimo de una ciudad para pintar su ficha en el catálogo (serializable desde el servidor). */
export type CityTileData = {
  slug: string;
  name: string;
  region: string;
  country: string;
  countryCode: string;
  status: "available" | "in_preparation" | "unavailable";
  openable: boolean;
  lon: number;
  lat: number;
  /** Texto de búsqueda ya normalizado. */
  index: string;
};

const PAGE = 12;
const STATUS_LABEL = { available: "Disponible", in_preparation: "En preparación", unavailable: "No disponible" } as const;

const FILTERS: Array<{ id: CatalogFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "available", label: "Disponibles" },
  { id: "saved", label: "Guardadas" },
];

const coord = (value: number, plus: string, minus: string) => `${Math.abs(value).toFixed(2)}° ${value >= 0 ? plus : minus}`;

/** Sello circular de la ciudad inaugural: el texto gira despacio alrededor de un punto. */
function Seal() {
  return (
    <svg viewBox="0 0 120 120" width="108" height="108" aria-hidden="true" className="shrink-0">
      <defs>
        <path id="seal-circle" d="M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0" />
      </defs>
      <g className="seal-spin" style={{ transformOrigin: "60px 60px" }}>
        <text fill="currentColor" fontSize="9.4" letterSpacing="3.1" fontFamily="var(--font-geist-mono), monospace">
          <textPath href="#seal-circle">CIUDAD INAUGURAL · PRIMERA ABIERTA ·</textPath>
        </text>
      </g>
      <circle cx="60" cy="60" r="27" fill="none" stroke="currentColor" strokeOpacity=".35" />
      <circle cx="60" cy="60" r="4.5" fill="var(--c-accent)" />
    </svg>
  );
}

function CityTile({
  city,
  saved,
  onToggle,
  inaugural,
}: {
  readonly city: CityTileData;
  readonly saved: boolean;
  readonly onToggle: (slug: string) => void;
  readonly inaugural: boolean;
}) {
  return (
    <SpotCard
      tilt
      as="article"
      className={cn(
        "group relative flex h-full flex-col rounded-3xl border bg-surface/70 p-6 backdrop-blur-sm sm:p-7",
        inaugural ? "border-accent/45" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {inaugural ? (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-ink">
              <Flag size={12} strokeWidth={2} aria-hidden="true" />
              Ciudad inaugural
            </p>
          ) : null}
          <h3 className={cn("display-face font-medium leading-[0.95] tracking-[-0.04em] text-ink", inaugural ? "text-[2.6rem] sm:text-6xl" : "text-[2rem] sm:text-[2.4rem]")}>
            {city.name}
          </h3>
          <p className="mt-2 text-sm text-muted">
            {city.region}, {city.country}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {inaugural ? (
            <span className="hidden text-accent-ink/80 sm:block">
              <Seal />
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onToggle(city.slug)}
            aria-pressed={saved}
            aria-label={saved ? `Quitar ${city.name} de guardadas` : `Guardar ${city.name}`}
            title="Guardar en este navegador"
            className={cn(
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,transform] duration-300 hover:scale-110",
              saved ? "border-accent/50 bg-accent/15 text-accent" : "border-line-strong text-muted hover:text-ink",
            )}
          >
            <Star size={16} strokeWidth={1.8} fill={saved ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      <p className="tnum mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-subtle">
        <span>{coord(city.lat, "N", "S")}</span>
        <span>{coord(city.lon, "E", "O")}</span>
        <span className="rounded-full border border-line px-2 py-0.5">{city.countryCode}</span>
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-8">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
            city.openable ? "border-available/35 bg-available-soft text-available" : "border-line-strong bg-occupied-soft text-muted",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", city.openable ? "bg-available" : "bg-occupied")} aria-hidden="true" />
          {STATUS_LABEL[city.status]}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {city.openable ? (
            <Link
              href={`/city/${city.slug}/viewer`}
              className="cta btn-sweep inline-flex h-11 items-center gap-2 rounded-full bg-accent pl-5 pr-2 text-sm font-medium text-on-accent hover:text-[#1d0d06]"
            >
              Abrir en 3D
              <span className="btn-dot flex h-8 w-8 items-center justify-center rounded-full bg-on-accent text-accent">
                <ArrowUpRight size={15} strokeWidth={2.2} aria-hidden="true" className="cta-arrow" />
              </span>
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
              Próximamente
            </span>
          )}
          <Link
            href={`/city/${city.slug}`}
            className="inline-flex h-11 items-center rounded-full border border-line-strong px-4 text-sm text-ink transition-colors hover:border-accent/60"
          >
            Ficha
          </Link>
        </span>
      </div>
    </SpotCard>
  );
}

/**
 * Catálogo completo de ciudades. Pensado para crecer: búsqueda instantánea,
 * filtro por país y estado, orden, y «Mostrar más» de 12 en 12 en lugar de una
 * lista interminable. La ciudad inaugural ocupa dos columnas con su sello.
 */
export function CitiesExplorer({
  cities,
  initialQuery,
  initialFilter,
}: {
  readonly cities: CityTileData[];
  readonly initialQuery: string;
  readonly initialFilter: CatalogFilter;
}) {
  const query = useCatalogStore((s) => s.query);
  const filter = useCatalogStore((s) => s.filter);
  const sort = useCatalogStore((s) => s.sort);
  const favorites = useCatalogStore((s) => s.favorites);
  const setQuery = useCatalogStore((s) => s.setQuery);
  const setFilter = useCatalogStore((s) => s.setFilter);
  const setSort = useCatalogStore((s) => s.setSort);
  const toggleFavorite = useCatalogStore((s) => s.toggleFavorite);
  const mounted = useMounted();
  const [country, setCountry] = useState("all");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
    setFilter(initialFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);
  useEffect(() => setShown(PAGE), [query, filter, sort, country]);

  const countries = useMemo(() => {
    const byCode = new Map<string, { name: string; count: number }>();
    for (const city of cities) {
      const entry = byCode.get(city.countryCode) ?? { name: city.country, count: 0 };
      entry.count += 1;
      byCode.set(city.countryCode, entry);
    }
    return [...byCode].map(([code, value]) => ({ code, ...value })).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [cities]);

  const visible = useMemo(() => {
    const rank = { available: 0, in_preparation: 1, unavailable: 2 } as const;
    const list = cities.filter((city) => {
      if (!matchesQuery(city.index, query)) return false;
      if (country !== "all" && city.countryCode !== country) return false;
      if (filter === "available") return city.status === "available";
      if (filter === "saved") return favorites.includes(city.slug);
      return true;
    });
    return list.sort((a, b) => {
      if (a.slug === INAUGURAL_CITY && sort !== "name") return -1;
      if (b.slug === INAUGURAL_CITY && sort !== "name") return 1;
      if (sort === "name") return a.name.localeCompare(b.name, "es");
      return rank[a.status] - rank[b.status] || a.name.localeCompare(b.name, "es");
    });
  }, [cities, query, country, filter, favorites, sort]);

  const filtering = query.trim().length > 0 || filter !== "all" || country !== "all";
  const page = visible.slice(0, shown);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-[16rem] flex-1 sm:max-w-md">
            <span className="sr-only">Buscar ciudad o país</span>
            <Search size={16} strokeWidth={1.9} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar ciudad o país"
              autoComplete="off"
              className="h-12 w-full rounded-full border border-line-strong bg-surface/70 pl-11 pr-10 text-base text-ink placeholder:text-subtle focus:border-accent/70"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Borrar búsqueda" className="absolute right-2.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-subtle hover:text-ink">
                <X size={15} strokeWidth={2} />
              </button>
            ) : null}
          </label>

          <div role="group" aria-label="Filtrar ciudades" className="flex items-center gap-1 rounded-full border border-line-strong bg-surface/70 p-1">
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
                    "rounded-full px-4 py-2 text-sm transition-colors duration-300",
                    active ? "bg-ink text-ivory" : "text-muted hover:text-ink",
                    disabled && "cursor-not-allowed opacity-40",
                  )}
                >
                  {option.label}
                  {option.id === "saved" && mounted && favorites.length > 0 ? <span className="tnum ml-1.5 opacity-70">{favorites.length}</span> : null}
                </button>
              );
            })}
          </div>

          <label className="ml-auto flex items-center gap-2 text-sm text-muted">
            <span className="hidden sm:inline">Orden</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as "relevance" | "name")}
              className="h-11 rounded-full border border-line-strong bg-surface/70 px-4 text-sm text-ink"
            >
              <option value="relevance">Recomendado</option>
              <option value="name">Nombre (A–Z)</option>
            </select>
          </label>
        </div>

        {countries.length > 1 ? (
          <div role="group" aria-label="Filtrar por país" className="flex flex-wrap gap-2">
            {[{ code: "all", name: "Todos los países", count: cities.length }, ...countries].map((entry) => (
              <button
                key={entry.code}
                type="button"
                aria-pressed={country === entry.code}
                onClick={() => setCountry(entry.code)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-300",
                  country === entry.code ? "border-accent/60 bg-accent/10 text-accent-ink" : "border-line text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {entry.name} <span className="tnum opacity-60">{entry.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="mb-5 text-sm text-muted" aria-live="polite">
        {visible.length === 1 ? "1 ciudad" : `${visible.length} ciudades`}
        {filtering ? ` de ${cities.length}` : ""}
        {mounted && favorites.length > 0 ? " · Las guardadas se almacenan solo en este navegador" : ""}
      </p>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-line-strong bg-surface/40 px-6 py-16 text-center">
          <SearchX size={28} strokeWidth={1.5} aria-hidden="true" className="text-subtle" />
          <h3 className="display-face mt-4 text-xl font-medium text-ink">{filter === "saved" ? "No has guardado ninguna ciudad" : "Sin resultados"}</h3>
          <p className="mt-2 max-w-sm text-sm text-muted">
            {filter === "saved"
              ? "Pulsa la estrella de una ciudad para guardarla aquí."
              : `Ninguna ciudad coincide${query ? ` con «${query}»` : ""}. Prueba con otro nombre o quita un filtro.`}
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
              setCountry("all");
            }}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-full border border-line-strong px-5 text-sm text-ink hover:border-accent/60"
          >
            <MapPin size={15} strokeWidth={1.9} aria-hidden="true" />
            Ver todas las ciudades
          </button>
        </div>
      ) : (
        <>
          <ul className="grid list-none grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {page.map((city, index) => {
              const inaugural = city.slug === INAUGURAL_CITY && sort !== "name";
              return (
                <Reveal as="li" key={city.slug} delay={Math.min(index, 8) * 70} className={cn("min-w-0", inaugural && "md:col-span-2")}>
                  <CityTile city={city} saved={mounted && favorites.includes(city.slug)} onToggle={toggleFavorite} inaugural={inaugural} />
                </Reveal>
              );
            })}
          </ul>
          {visible.length > shown ? (
            <div className="mt-10 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="btn-sweep inline-flex h-12 items-center rounded-full border border-line-strong px-7 text-base text-ink"
              >
                Mostrar más ciudades
              </button>
              <p className="tnum text-xs text-subtle">
                {shown} de {visible.length}
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
