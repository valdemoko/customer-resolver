"use client";

import dynamic from "next/dynamic";
import type { CityConfig } from "@/lib/cities/schema";

/**
 * Cargador del visor 3D.
 *
 * POR QUÉ ES UN COMPONENTE DE CLIENTE APARTE: three.js necesita `window`, así que
 * el visor se importa con `ssr: false` para que no entre en el renderizado del
 * servidor. Desde Next.js 16, `ssr: false` NO se admite en un componente de
 * servidor y el build falla; por eso el import diferido vive aquí, en un
 * componente de cliente mínimo, y la página (servidor) solo lo monta.
 *
 * Y POR QUÉ IMPORTA TAMBIÉN PARA EL PESO: es lo que hace que el catálogo no
 * descargue ni un byte de three.js. Ni three.js ni MapLibre: el visor ya no usa
 * MapLibre, y las dos librerías no conviven en ningún bundle.
 */
const CityViewer = dynamic(
  () => import("@/components/viewer/CityViewer").then((module) => module.CityViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-sky">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-subtle">
          Preparando la ciudad…
        </p>
      </div>
    ),
  },
);

export function CityViewerLoader({ city }: { city: CityConfig }) {
  return <CityViewer city={city} />;
}
