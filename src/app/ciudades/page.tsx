import type { Metadata } from "next";
import { TopBar } from "@/components/layout/TopBar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { CitiesExplorer, type CityTileData } from "@/components/catalog/CitiesExplorer";
import { Reveal, SplitText } from "@/components/marketing/Reveal";
import { listCities } from "@/lib/cities/registry";
import { isCityOpenable } from "@/lib/cities/schema";
import { searchIndex } from "@/lib/search";
import { brand } from "@/lib/brand";
import type { CatalogFilter } from "@/stores/catalog";

export const metadata: Metadata = {
  title: "Ciudades",
  description: `Todas las ciudades de ${brand.name}: busca por nombre o país y abre cualquiera en 3D.`,
  alternates: { canonical: "/ciudades" },
};

type SearchParams = Promise<{ q?: string; filter?: string }>;

function parseFilter(value: string | undefined): CatalogFilter {
  if (value === "available" || value === "saved") return value;
  return "all";
}

/**
 * Catálogo completo de ciudades. A diferencia de la portada, que enseña solo
 * las destacadas, aquí vive la lista entera con búsqueda, filtros y «Mostrar más»,
 * para que el catálogo siga siendo manejable con decenas de ciudades.
 */
export default async function CitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const all = listCities();
  const tiles: CityTileData[] = all.map((city) => ({
    slug: city.slug,
    name: city.name,
    region: city.region,
    country: city.country,
    countryCode: city.countryCode,
    status: city.status,
    openable: isCityOpenable(city),
    lon: city.center[0],
    lat: city.center[1],
    index: searchIndex(city),
  }));
  const open = tiles.filter((tile) => tile.openable).length;

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-[88rem] px-4 pb-24 pt-8 sm:px-8 sm:pt-14">
        <header className="mb-10 sm:mb-14">
          <h1 className="display-face text-[clamp(3rem,9vw,7.5rem)] font-medium leading-[0.92] tracking-[-0.05em] text-ink">
            <SplitText text="Ciudades" />
          </h1>
          <Reveal delay={250}>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              {tiles.length === 1 ? "1 ciudad en el catálogo" : `${tiles.length} ciudades en el catálogo`}
              {open > 0 ? `, ${open === 1 ? "1 abierta" : `${open} abiertas`} en 3D` : ""}. Elige una para recorrerla y anunciarte
              en sus fachadas.
            </p>
          </Reveal>
        </header>
        <CitiesExplorer cities={tiles} initialQuery={params.q ?? ""} initialFilter={parseFilter(params.filter)} />
      </main>
      <SiteFooter />
    </>
  );
}
