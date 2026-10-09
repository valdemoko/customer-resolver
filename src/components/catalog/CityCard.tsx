import Link from "next/link";
import { ArrowUpRight, Lock, Star } from "lucide-react";
import { CityThumbnail } from "./CityThumbnail";
import { StatusPill } from "@/components/ui/StatusPill";
import { cn } from "@/lib/cn";
import { isCityOpenable, type CityConfig } from "@/lib/cities/schema";

/**
 * Tarjeta del catálogo.
 *
 * Nota de honestidad: el número de parcelas solo se pinta si la configuración
 * declara `parcelCountSource === "database"`, es decir, si el dato vendrá de una
 * consulta real. Hoy Málaga declara `none`, así que la tarjeta no promete
 * ninguna cifra.
 */
export function CityCard({
  city,
  isFavorite,
  onToggleFavorite,
  priority = false,
}: {
  city: CityConfig;
  isFavorite: boolean;
  onToggleFavorite: (slug: string) => void;
  priority?: boolean;
}) {
  const openable = isCityOpenable(city);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-md border border-line bg-surface transition-[border-color,box-shadow] duration-200 ease-out-soft hover:border-line-strong">
      <div className="relative aspect-[4/3] overflow-hidden border-b border-line">
        <CityThumbnail city={city} priority={priority} />

        <div className="absolute left-3 top-3 z-20">
          <StatusPill status={city.status} />
        </div>

        <button
          type="button"
          onClick={() => onToggleFavorite(city.slug)}
          aria-pressed={isFavorite}
          aria-label={
            isFavorite ? `Quitar ${city.name} de guardadas` : `Guardar ${city.name}`
          }
          title="Guardar en este navegador"
          className={cn(
            "absolute right-2 top-2 z-20 inline-flex h-9 w-9 items-center justify-center rounded-sm border transition-colors duration-150 ease-out-soft",
            isFavorite
              ? "border-accent/40 bg-accent-soft text-accent-ink"
              : "border-line-strong bg-surface/85 text-muted hover:text-ink",
          )}
        >
          <Star size={16} strokeWidth={1.75} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="display-face text-xl font-semibold leading-tight text-ink">
          {city.name}
        </h3>
        <p className="mt-1 text-sm text-muted">
          {city.region}, {city.country}
        </p>

        {city.parcelCountSource === "database" && city.status === "available" ? (
          <p className="mt-3 text-sm text-muted">
            Ubicaciones publicitarias publicadas en la base de datos.
          </p>
        ) : null}

        <div className="mt-4 flex-1" />

        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          {openable ? (
            <Link
              href={`/city/${city.slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
            >
              Explorar en 3D
              <ArrowUpRight size={15} strokeWidth={2} />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
              {city.status === "in_preparation" ? "Vista 3D en preparación" : "No disponible"}
            </span>
          )}

          <Link
            href={`/city/${city.slug}`}
            className="text-sm text-muted underline decoration-line-strong underline-offset-4 hover:text-ink"
          >
            Ficha
          </Link>
        </div>
      </div>
    </article>
  );
}
