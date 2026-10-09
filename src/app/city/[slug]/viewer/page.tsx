import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Layers } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { CityViewerLoader } from "@/components/viewer/CityViewerLoader";
import { getCityBySlug } from "@/lib/cities/registry";
import { isCityOpenable } from "@/lib/cities/schema";

type Params = Promise<{ slug: string }>;

export const metadata: Metadata = {
  title: "Visor 3D",
  robots: { index: false, follow: true },
};

export default async function ViewerPage({ params }: { params: Params }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) notFound();

  if (!isCityOpenable(city)) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4">
        <EmptyState
          icon={<Layers size={26} strokeWidth={1.5} />}
          title="La vista 3D todavía no está publicada"
          description={`${city.name} aún no tiene paquete de datos publicado, así que no hay nada que mostrar. No ponemos un mapa de ejemplo en su lugar.`}
          action={
            <Link
              href={`/city/${city.slug}`}
              className="text-sm text-accent underline underline-offset-4"
            >
              Ver la ficha de {city.name}
            </Link>
          }
          className="items-start text-left"
        />
      </main>
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <CityViewerLoader city={city} />

      {/* Alternativa textual: la información no puede depender de poder ver el
          3D. Es requisito de accesibilidad, no un extra. */}
      <section className="sr-only-focusable absolute left-3 top-14 z-30 max-w-sm rounded-md border border-line bg-surface/97 p-3 text-sm">
        <h2 className="font-medium text-ink">Información de la zona en texto</h2>
        <p className="mt-1 text-muted">
          {city.name}, {city.region}: {city.tiles?.layers.length ?? 0} capas de datos publicadas en
          la versión {city.tiles?.dataVersion}. Zonas con datos completos:{" "}
          {city.zones
            .filter((zone) => zone.detail === "full")
            .map((zone) => zone.name)
            .join(", ")}
          .
        </p>
        <p className="mt-2 text-muted">
          Fuentes: {city.attributions.map((attribution) => attribution.label).join(", ")}.{" "}
          <Link href="/atribuciones" className="underline">
            Detalle de fuentes y licencias
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
