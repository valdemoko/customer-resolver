import { cn } from "@/lib/cn";
import { brand } from "@/lib/brand";
import { isCityOpenable, type CityConfig } from "@/lib/cities/schema";

/**
 * Miniatura de una ciudad.
 *
 * Regla de producto: la imagen es un render propio de la escena 3D, nunca una
 * fotografía de stock con licencia dudosa. Mientras el paquete de datos no
 * exista (`city.thumbnail === null`), NO se inventa una imagen: se muestra un
 * marco cartográfico neutro que declara el estado real.
 */
export function CityThumbnail({
  city,
  className,
  priority = false,
}: {
  city: CityConfig;
  className?: string;
  priority?: boolean;
}) {
  if (city.thumbnail) {
    // El render existe: se sirve con next/image y dimensiones declaradas para
    // evitar saltos de layout (CLS).
    // eslint-disable-next-line @next/next/no-img-element -- se sustituye por next/image cuando exista el fichero
    return (
      <img
        src={city.thumbnail.src}
        width={city.thumbnail.width}
        height={city.thumbnail.height}
        alt={city.thumbnail.alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        className={cn("h-full w-full object-cover", className)}
      />
    );
  }

  // Tres estados, no dos: la ciudad puede estar publicada sin que exista todavía
  // el archivo de miniatura. Decir «Vista 3D sin publicar» en una ciudad que sí
  // se puede abrir sería falso, y es justo el error que apareció al publicar
  // Málaga: el catálogo ofrecía abrirla mientras la miniatura decía que no había
  // nada publicado.
  const openable = isCityOpenable(city);

  return (
    <div
      role="img"
      aria-label={
        openable
          ? `Vista 3D disponible para ${city.name}, sin miniatura generada todavía`
          : `Sin vista 3D publicada todavía para ${city.name}`
      }
      className={cn(
        "relative flex h-full w-full flex-col items-center justify-start overflow-hidden",
        className,
      )}
      style={{ backgroundColor: "var(--m-land)" }}
    >
      {/* Retícula cartográfica: estructura, no decoración. */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="none"
        viewBox="0 0 200 150"
      >
        <defs>
          <pattern id={`grid-${city.slug}`} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M20 0H0V20" fill="none" stroke="var(--c-border-strong)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="200" height="150" fill={`url(#grid-${city.slug})`} opacity="0.55" />
        {/* Ejes de referencia del centro y de los límites del paquete. */}
        {/* Cruce de referencia del centro, por debajo de la etiqueta para que
            las coordenadas no lo tapen. */}
        <line x1="0" y1="108" x2="200" y2="108" stroke="var(--c-border-strong)" strokeWidth="0.6" />
        <line x1="100" y1="0" x2="100" y2="150" stroke="var(--c-border-strong)" strokeWidth="0.6" />
        <circle cx="100" cy="108" r="3" fill="var(--c-accent)" />
        <circle cx="100" cy="108" r="8.5" fill="none" stroke="var(--c-accent)" strokeWidth="0.7" opacity="0.5" />
      </svg>

      {/* El relleno superior deja sitio a la píldora de estado, que va anclada
          en la esquina. `pointer-events-none` es obligatorio: sin él esta capa
          cubre los controles superpuestos de la tarjeta (estado y guardar) y
          se come los clics con el puntero. */}
      <div className="pointer-events-none relative z-10 flex w-full flex-col items-center px-4 pb-4 pt-12 text-center">
        <span className="display-face text-2xl font-semibold text-ink/80">{city.name}</span>
        <span className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          {city.countryCode} · {city.center[1].toFixed(4)}, {city.center[0].toFixed(4)}
        </span>
        <span className="mt-2.5 rounded-sm border border-line-strong bg-surface/90 px-2 py-[3px] text-[11px] text-muted">
          {openable ? "Vista 3D disponible · miniatura pendiente" : "Vista 3D sin publicar"}
        </span>
      </div>

      <span className="absolute bottom-2 right-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted/70">
        {brand.name}
      </span>
    </div>
  );
}
