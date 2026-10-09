import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Database, FileCheck2, Layers, ShieldAlert } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCityBySlug, getPublishBlockers, getVerificationSummary, cities } from "@/lib/cities/registry";
import { isCityOpenable } from "@/lib/cities/schema";
import { formatShare, summarizeHeightSources } from "@/lib/cities/heights";
import { mapPalette } from "@/lib/scene/palette";
import { brand } from "@/lib/brand";
import { formatBytes } from "@/lib/bytes";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return cities.map((city) => ({ slug: city.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) return { title: "Ciudad no encontrada" };
  return {
    title: `Datos, fuentes y licencias de ${city.name}`,
    description: `Qué zona de ${city.name} está cubierta, de dónde sale cada altura y con qué licencias se usan las fuentes de datos.`,
    alternates: { canonical: `/city/${city.slug}/datos` },
  };
}

/**
 * Datos, fuentes y licencias de una ciudad. Antes vivía al final de la ficha de la
 * ciudad; se movió aquí (y se enlaza desde el pie) para que la ficha quede limpia.
 * El contenido es el mismo: cobertura verificada, origen de cada altura, licencias.
 */
export default async function CityDataPage({ params }: { params: Params }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) notFound();

  const openable = isCityOpenable(city);
  const publishBlockers = getPublishBlockers(city.slug);
  const verification = getVerificationSummary(city.slug);
  const heights = summarizeHeightSources(city.report?.heightSources ?? {});
  const bounds = city.bounds;
  const kmWide = (bounds.east - bounds.west) * 89.3 * Math.cos((city.center[1] * Math.PI) / 180);
  const kmTall = (bounds.north - bounds.south) * 111.1;
  const unverifiedLicenses = city.sources.filter((s) => !s.attribution.verified);

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-[88rem] px-4 pb-24 pt-6 sm:px-8">
        <Link href={`/city/${city.slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} strokeWidth={1.9} aria-hidden="true" />
          Volver a {city.name}
        </Link>
        <header className="mt-6 flex flex-wrap items-center gap-3">
          <h1 className="display-face text-4xl font-medium tracking-[-0.04em] text-ink sm:text-6xl">
            Datos, fuentes y licencias
          </h1>
          <StatusPill status={city.status} />
        </header>
        <p className="mt-3 text-base text-muted">
          {city.name} · {city.region}, {city.country}
        </p>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-8">
            {openable ? null : (
              <section aria-labelledby="preparacion">
                <h2 id="preparacion" className="text-lg font-medium text-ink">
                  Estado del visor 3D
                </h2>
                <div className="mt-3">
                  <EmptyState
                    icon={<Layers size={26} strokeWidth={1.5} />}
                    title={
                      city.tiles
                        ? "El paquete de datos está generado; falta la última comprobación"
                        : "La vista 3D de esta ciudad todavía no está publicada"
                    }
                    description={
                      city.tiles
                        ? "Los datos existen y pasan las comprobaciones del paquete, pero la publicación está bloqueada por lo que se enumera abajo. No se abre el visor con la evidencia a medias."
                        : "Estamos construyendo el paquete de datos (edificios con altura real, red viaria y terreno). Publicamos el visor cuando la geometría pasa la verificación geográfica contra ortofoto. Hasta entonces, aquí no hay nada que enseñar: no mostramos un mapa de ejemplo que parezca real."
                    }
                    className="items-start text-left"
                  />
                </div>
                {publishBlockers.length > 0 ? (
                  <ul className="mt-4 space-y-2">
                    {publishBlockers.map((blocker) => (
                      <li
                        key={blocker}
                        className="flex gap-2 rounded-sm border border-premium/35 bg-premium-soft p-2.5 text-xs text-premium/90"
                      >
                        <ShieldAlert size={14} strokeWidth={1.9} aria-hidden="true" className="mt-[1px] shrink-0" />
                        {blocker}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            )}

            <section aria-labelledby="cobertura">
              <h2 id="cobertura" className="text-lg font-medium text-ink">
                Qué zona está cubierta
              </h2>
              <p className="mt-2 text-sm text-muted">
                La cobertura es un rectángulo del centro histórico, no el término municipal
                completo. Estas son las coordenadas exactas de lo que se modela:
              </p>
              <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Metric label="Longitud oeste" value={`${bounds.west.toFixed(4)}°`} />
                <Metric label="Longitud este" value={`${bounds.east.toFixed(4)}°`} />
                <Metric label="Latitud sur" value={`${bounds.south.toFixed(4)}°`} />
                <Metric label="Latitud norte" value={`${bounds.north.toFixed(4)}°`} />
                <Metric
                  label="Extensión aproximada"
                  value={`${kmWide.toFixed(2)} × ${kmTall.toFixed(2)} km`}
                />
                <Metric
                  label="Puntos de control verificados"
                  value={
                    verification
                      ? `${verification.verifiedPoints} de ${verification.totalControlPoints} (coordenada independiente)`
                      : "Sin verificación publicada"
                  }
                />
                <Metric
                  label="A menos de 40 m de la geometría"
                  value={
                    verification
                      ? `${verification.pointsWithin40mOfPublishedGeometry} de ${verification.totalControlPoints}`
                      : "Sin verificación publicada"
                  }
                />
              </dl>

              <h3 className="mt-6 text-sm font-medium text-ink">Zonas cargables</h3>
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {city.zones.map((zone) => (
                  <li key={zone.id} className="flex items-center justify-between gap-4 py-2.5">
                    <span className="text-sm text-ink">{zone.name}</span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-subtle">
                      {zone.detail === "full"
                        ? "Detalle completo"
                        : zone.detail === "reduced"
                          ? "Detalle reducido"
                          : "Sin detalle"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {city.report ? (
              <section aria-labelledby="alturas">
                <h2 id="alturas" className="text-lg font-medium text-ink">
                  De dónde sale cada altura
                </h2>
                <p className="mt-2 text-sm text-muted">
                  La altura de un edificio no sale siempre del mismo sitio. Estos recuentos los
                  escribe el pipeline al fusionar las fuentes, sobre {city.report.buildings.toLocaleString("es-ES")}{" "}
                  edificios. Ninguna de estas alturas es una medición sobre el terreno: son datos
                  declarados por sus fuentes, un dato oficial derivado de ellos, o el valor por
                  defecto cuando no hay dato.
                </p>

                <ul className="mt-4 space-y-2">
                  {heights.groups.map((group) => (
                    <li
                      key={group.kind}
                      className="flex items-center gap-3 rounded-sm border border-line bg-surface p-3"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-4 w-4 shrink-0 rounded-[2px] border"
                        style={{
                          backgroundColor:
                            group.kind === "estimado"
                              ? mapPalette.buildingEstimated
                              : group.kind === "derivado"
                                ? mapPalette.buildingMid
                                : mapPalette.buildingHigh,
                          borderColor: mapPalette.buildingEdge,
                        }}
                      />
                      <span className="flex-1 text-sm text-ink">
                        {group.kind === "estimado"
                          ? "Estimación (no es un dato)"
                          : group.kind === "derivado"
                            ? "Dato oficial derivado"
                            : "Dato declarado por la fuente"}
                      </span>
                      <span className="tnum font-mono text-xs text-muted">
                        {group.buildings.toLocaleString("es-ES")} · {formatShare(group.share)}
                      </span>
                    </li>
                  ))}
                </ul>

                <ul className="mt-4 divide-y divide-line border-y border-line">
                  {heights.sources.map((source) => (
                    <li key={source.id} className="py-2.5">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-ink">{source.label}</span>
                        <span className="tnum font-mono text-xs text-muted">
                          {source.buildings.toLocaleString("es-ES")} · {formatShare(source.share)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted">{source.detail}</p>
                    </li>
                  ))}
                </ul>

                <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  <Metric
                    label="Contraste Catastro ↔ OSM"
                    value={
                      city.report.crossCheck
                        ? `${city.report.crossCheck.compared.toLocaleString("es-ES")} edificios comparables`
                        : "No se pudo contrastar"
                    }
                  />
                  <Metric
                    label="Acuerdo dentro de 1 planta"
                    value={
                      city.report.crossCheck
                        ? formatShare(city.report.crossCheck.agreeWithinOneFloorShare)
                        : "—"
                    }
                  />
                  <Metric
                    label="Diferencia media"
                    value={
                      city.report.crossCheck
                        ? `${city.report.crossCheck.meanAbsoluteFloorDelta} plantas`
                        : "—"
                    }
                  />
                  <Metric
                    label="Plantas declaradas por el Catastro"
                    value={`${city.report.catastroDeclaredFloorsAvailable} edificios`}
                  />
                </dl>

                <p className="mt-4 text-xs text-muted">
                  El Catastro no publica el número de plantas de estos edificios: se midió sobre
                  las respuestas reales del servicio y el campo viene vacío en todas. Lo que sí
                  publica es la superficie construida total, y de ahí se derivan las plantas. Por
                  eso «derivado» no es «declarado», y por eso van separados.
                </p>
              </section>
            ) : null}

            <section aria-labelledby="fuentes">
              <h2 id="fuentes" className="text-lg font-medium text-ink">
                Fuentes de datos y licencias
              </h2>
              <p className="mt-2 text-sm text-muted">
                Cada capa del mapa declara de dónde viene y con qué condiciones se reutiliza.
              </p>
              <ul className="mt-4 space-y-4">
                {city.sources.map((source) => (
                  <li key={source.id} className="rounded-md border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-ink">{source.name}</h3>
                      {source.attribution.verified ? (
                        <span className="inline-flex items-center gap-1 text-xs text-available">
                          <FileCheck2 size={13} strokeWidth={1.9} aria-hidden="true" />
                          Licencia revisada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-premium">
                          <ShieldAlert size={13} strokeWidth={1.9} aria-hidden="true" />
                          Licencia pendiente de revisión literal
                        </span>
                      )}
                    </div>
                    <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
                      <div className="flex gap-2">
                        <dt className="text-muted">Licencia</dt>
                        <dd className="min-w-0 break-words text-ink">{source.attribution.license}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-muted">Extraída</dt>
                        <dd className="tnum text-ink">{source.extractedAt ?? "Aún no extraída"}</dd>
                      </div>
                      <div className="flex gap-2 sm:col-span-2">
                        <dt className="text-muted">Atribución</dt>
                        <dd className="min-w-0 break-words text-ink">
                          {source.attribution.label}{" "}
                          <a
                            href={source.attribution.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-accent underline underline-offset-2"
                          >
                            ({source.attribution.url.replace(/^https:\/\//, "").replace(/\/$/, "")})
                          </a>
                        </dd>
                      </div>
                      <div className="flex gap-2 sm:col-span-2">
                        <dt className="text-muted">Aporta</dt>
                        <dd className="min-w-0 break-words text-ink">{source.attribution.contributed}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-md border border-line bg-surface p-4">
              <h2 className="text-sm font-medium text-ink">Ficha técnica</h2>
              <dl className="mt-3 space-y-2.5 text-sm">
                <Row label="Identificador" value={city.id} mono />
                <Row label="Ruta" value={`/city/${city.slug}`} mono />
                <Row
                  label="Paquete de datos"
                  value={
                    city.tiles
                      ? `${city.tiles.dataVersion} · ${formatBytes(city.tiles.bytes) ?? "peso no medido"}`
                      : "Sin publicar"
                  }
                />
                <Row label="Estado de datos" value={city.dataStatus} mono />
                <Row
                  label="Parcelas"
                  value={
                    city.parcelCountSource === "database"
                      ? "Consultadas en la base de datos por área visible"
                      : "Todavía no hay parcelas registradas"
                  }
                />
              </dl>
            </section>

            <section className="rounded-md border border-line bg-surface p-4">
              <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
                <Database size={15} strokeWidth={1.9} aria-hidden="true" />
                Atribución obligatoria
              </h2>
              <ul className="mt-3 space-y-1.5 text-sm">
                {city.attributions.map((attribution) => (
                  <li key={attribution.label}>
                    <a
                      href={attribution.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-accent underline underline-offset-2"
                    >
                      {attribution.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            {unverifiedLicenses.length > 0 ? (
              <section className="rounded-md border border-premium/35 bg-premium-soft p-4">
                <h2 className="text-sm font-medium text-premium">
                  Pendiente antes de publicar
                </h2>
                <p className="mt-2 text-sm text-premium/90">
                  {unverifiedLicenses.length === 1
                    ? "Una fuente tiene la licencia pendiente de lectura literal."
                    : `${unverifiedLicenses.length} fuentes tienen la licencia pendiente de lectura literal.`}{" "}
                  La atribución se muestra igualmente, que es la opción conservadora.
                </p>
              </section>
            ) : null}

            <section className="rounded-md border border-line bg-surface p-4">
              <h2 className="text-sm font-medium text-ink">Responsable</h2>
              <p className="mt-2 text-sm text-muted">
                {brand.name} ofrece publicidad virtual sobre espacios urbanos. No vende
                inmuebles ni participa en el mercado inmobiliario.
              </p>
            </section>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-line pt-2.5">
      <dt className="text-xs uppercase tracking-[0.1em] text-subtle">{label}</dt>
      <dd className="tnum mt-1 font-mono text-sm text-ink">{value}</dd>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`text-right text-ink ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
