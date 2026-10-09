import { cn } from "@/lib/cn";

/** Bloque de esqueleto. El color es plano (sin shimmer decorativo). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-sm bg-sunken", className)}
    />
  );
}

/** Esqueleto de una tarjeta del catálogo, con las mismas dimensiones reales. */
export function CityCardSkeleton() {
  return (
    <div className="hairline overflow-hidden rounded-md bg-surface">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  );
}

export function CityGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Cargando catálogo de ciudades"
      className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, i) => (
        <CityCardSkeleton key={i} />
      ))}
    </div>
  );
}
