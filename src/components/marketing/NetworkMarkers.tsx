"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

export type MapCity = {
  slug: string;
  name: string;
  country: string;
  lon: number;
  lat: number;
  /** ¿Se puede abrir el visor 3D? Solo entonces el marcador está «activo». */
  openable: boolean;
  statusLabel: string;
};

/**
 * Marcadores de las ciudades del catálogo sobre el mapa de puntos. Cada uno es un
 * enlace real a la ficha de su ciudad; al pasar el ratón o enfocarlo con el
 * teclado aparece un panel con el estado y la acción de abrir el visor 3D.
 * `points` son las posiciones en píxeles que calcula el escenario del mapa.
 */
export function NetworkMarkers({
  cities,
  points,
}: {
  readonly cities: MapCity[];
  readonly points: Record<string, [number, number]>;
}) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <ul className="absolute inset-0 m-0 list-none p-0">
      {cities.map((city) => {
        const point = points[city.slug];
        if (!point) return null;
        const open = active === city.slug;
        return (
          <li
            key={city.slug}
            className="absolute"
            style={{ left: point[0], top: point[1] }}
            onMouseEnter={() => setActive(city.slug)}
            onMouseLeave={() => setActive((current) => (current === city.slug ? null : current))}
            onFocus={() => setActive(city.slug)}
            onBlur={() => setActive((current) => (current === city.slug ? null : current))}
          >
            <Link
              href={`/city/${city.slug}`}
              aria-label={`${city.name}, ${city.country}. ${city.statusLabel}. Abrir la ficha de la ciudad.`}
              className="group absolute -left-6 -top-6 flex h-12 w-12 items-center justify-center rounded-full outline-offset-2"
            >
              {city.openable ? (
                <span aria-hidden="true" className="pointer-events-none absolute inset-0">
                  <span className="beacon-ring absolute inset-0 rounded-full border border-accent/70" />
                  <span className="beacon-ring absolute inset-0 rounded-full border border-accent/70" />
                </span>
              ) : null}
              <span
                aria-hidden="true"
                className={`relative block h-3 w-3 rounded-full transition-transform duration-200 group-hover:scale-125 ${city.openable ? "bg-accent ring-4 ring-accent/25" : "bg-subtle"}`}
              />
            </Link>

            <div
              role="group"
              aria-label={`${city.name}: resumen`}
              className={`absolute z-10 w-64 -translate-x-1/2 rounded-2xl border border-line-strong bg-surface/90 p-4 shadow-[var(--shadow-float)] backdrop-blur-md transition-[opacity,transform] duration-300 ease-out-soft ${open ? "pointer-events-auto translate-y-0 scale-100 opacity-100" : "pointer-events-none -translate-y-2 scale-95 opacity-0"}`}
              style={{ left: 0, top: 30 }}
            >
              <p className="display-face text-xl font-medium leading-tight text-ink">{city.name}</p>
              <p className="mt-0.5 text-sm text-muted">{city.country}</p>
              <p className="mt-2.5 flex items-center gap-2 text-xs text-muted">
                <span className={`h-1.5 w-1.5 rounded-full ${city.openable ? "bg-available" : "bg-occupied"}`} aria-hidden="true" />
                {city.statusLabel}
              </p>
              {city.openable ? (
                <Link
                  href={`/city/${city.slug}/viewer`}
                  tabIndex={open ? 0 : -1}
                  className="cta mt-3.5 inline-flex h-10 w-full items-center justify-between rounded-full bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover"
                >
                  Abrir en 3D
                  <ArrowUpRight size={16} strokeWidth={2.2} aria-hidden="true" className="cta-arrow" />
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
