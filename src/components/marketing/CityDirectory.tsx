import Link from "next/link";
import { ArrowUpRight, Flag, Lock } from "lucide-react";
import { INAUGURAL_CITY } from "@/lib/brand";
import { Reveal, SpotCard } from "./Reveal";
import { isCityOpenable, type CityConfig } from "@/lib/cities/schema";
import { unitCatalogCounts } from "@/lib/market/units";

const fmt = (value: number) => value.toLocaleString("es-ES");

/**
 * Directorio de la red. Una fila por ciudad REAL del registro; hoy solo Málaga,
 * así que su ficha es detallada y no se rellena con tarjetas de ciudades que no
 * existen. Las cifras de Málaga salen del paquete de datos publicado.
 */
export function CityDirectory({ cities }: { cities: CityConfig[] }) {
  const counts = unitCatalogCounts();
  return (
    <ul className="space-y-4">
      {cities.map((city, index) => {
        const openable = isCityOpenable(city);
        return (
          <Reveal as="li" key={city.slug} delay={index * 80}>
            <SpotCard tilt className="group grid gap-8 rounded-3xl border border-line bg-surface/60 p-6 backdrop-blur-sm transition-colors hover:border-accent/50 sm:p-9 lg:grid-cols-[1.1fr_1.4fr_auto] lg:items-end lg:gap-12">
              <div>
                {city.slug === INAUGURAL_CITY ? (
                  <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-medium text-accent-ink">
                    <Flag size={12} strokeWidth={2} aria-hidden="true" />
                    Ciudad inaugural
                  </p>
                ) : null}
                <p className="flex items-center gap-2 text-sm text-muted">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${openable ? "bg-available" : "bg-occupied"}`}
                  />
                  {openable ? "Disponible" : city.status === "in_preparation" ? "En preparación" : "No disponible"}
                </p>
                <h3 className="display-face mt-3 text-[2.4rem] font-medium leading-none tracking-[-0.035em] text-ink sm:text-6xl">
                  {city.name}
                </h3>
                <p className="mt-3 text-base text-muted">
                  {city.region}, {city.country}
                </p>
              </div>

              {openable ? (
                <dl className="grid grid-cols-3 gap-4 border-l border-line pl-6 sm:pl-8">
                  {(
                    [
                      ["Edificios", counts.buildings],
                      ["Locales", counts.parcels],
                      ["Muralla", counts.walls],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-sm text-muted">{label}</dt>
                      <dd className="display-face tnum mt-1 text-[1.6rem] font-medium tracking-[-0.03em] text-ink sm:text-[2rem]">
                        {fmt(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="max-w-sm border-l border-line pl-6 text-sm text-muted sm:pl-8">
                  La vista 3D de esta ciudad todavía no está publicada.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                {openable ? (
                  <Link
                    href={`/city/${city.slug}/viewer`}
                    className="cta btn-sweep inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-base font-medium text-on-accent"
                  >
                    Abrir en 3D
                    <ArrowUpRight size={17} strokeWidth={2.2} aria-hidden="true" className="cta-arrow" />
                  </Link>
                ) : (
                  <span className="inline-flex h-11 items-center gap-2 text-sm text-muted">
                    <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
                    Próximamente
                  </span>
                )}
                <Link
                  href={`/city/${city.slug}`}
                  className="inline-flex h-12 items-center rounded-full border border-line-strong px-6 text-base text-ink transition-colors hover:border-accent/60"
                >
                  Ficha y clasificación
                </Link>
              </div>
            </SpotCard>
          </Reveal>
        );
      })}
    </ul>
  );
}
