import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { listCities } from "@/lib/cities/registry";
import { TERRAIN_NOTE } from "@/lib/scene/model";

export const metadata: Metadata = {
  title: "Atribuciones y fuentes de datos",
  description:
    "De dónde sale cada dato de las ciudades en 3D: fuentes, licencias, fechas de extracción y límites conocidos.",
};

/**
 * Detalle de fuentes y licencias. El visor 3D no lleva pie de atribuciones:
 * enseña un icono «i» con el resumen y remite aquí. Las obligaciones de
 * atribución de las licencias se cumplen igual, con un clic de por medio.
 */
export default function AttributionsPage() {
  const cities = listCities().filter((city) => city.tiles !== null);

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} strokeWidth={1.9} aria-hidden="true" />
          Volver al catálogo
        </Link>
        <h1 className="display-face mt-6 text-3xl font-semibold tracking-[-0.03em] text-ink">
          Atribuciones y fuentes de datos
        </h1>
        <p className="mt-3 text-base text-muted">
          Cada edificio, calle y árbol de las ciudades sale de las fuentes que se listan aquí. Las
          alturas son datos declarados, derivados o estimaciones, y la ficha de cada edificio dice
          cuál es cuál.
        </p>

        {cities.map((city) => (
          <section key={city.id} className="mt-10">
            <h2 className="display-face text-xl font-semibold text-ink">{city.name}</h2>
            <ul className="mt-4 space-y-5">
              {city.sources.map((source) => (
                <li key={source.id} className="border-l-2 border-line-strong pl-4">
                  <p className="font-medium text-ink">{source.name}</p>
                  <p className="mt-1 text-sm text-muted">
                    Extraído el {source.extractedAt ?? "—"} · Capas: {source.layers.join(", ")}
                  </p>
                  <p className="mt-1 text-sm text-muted">{source.attribution.contributed}</p>
                  <p className="mt-1 text-sm">
                    <a
                      href={source.attribution.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      {source.attribution.label}
                    </a>
                    {" · "}
                    {source.attribution.licenseUrl ? (
                      <a
                        href={source.attribution.licenseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        {source.attribution.license}
                      </a>
                    ) : (
                      source.attribution.license
                    )}
                  </p>
                  {source.attribution.verified ? null : (
                    <p className="mt-1 text-sm text-premium">
                      Licencia pendiente de lectura literal: la atribución se muestra igualmente
                      por prudencia y la tarea sigue abierta.
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <h3 className="mt-8 text-sm font-medium text-ink">Límites conocidos</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              <li>{TERRAIN_NOTE}</li>
              <li>
                Los árboles que no están en OpenStreetMap (parques, jardines y los paseos con
                palmeras) se rellenan con una regla determinista y son una estimación, no un
                dato.
              </li>
              <li>
                La zona cubierta tiene los bordes difuminados: más allá no hay datos y no se
                inventa nada.
              </li>
              <li>
                Los edificios emblemáticos llevan una altura verificada en una fuente documentada
                o, si no la hay, el valor del paquete; los modelos propios se marcan como tales.
              </li>
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
