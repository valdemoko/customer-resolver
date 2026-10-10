import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight, Building2, Layers, Plane, ShieldAlert, Ship, Sailboat, Store, Castle, Truck } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { StatusPill } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { CountUp } from "@/components/marketing/CountUp";
import { CityNumbers } from "@/components/marketing/LiveStats";
import { Leaderboards } from "@/components/marketing/Leaderboards";
import { Magnetic, Reveal, SpotCard, SplitText } from "@/components/marketing/Reveal";
import { getCityBySlug, getPublishBlockers, cities } from "@/lib/cities/registry";
import { isCityOpenable } from "@/lib/cities/schema";
import { unitCatalogCounts } from "@/lib/market/units";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return cities.map((city) => ({ slug: city.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) return { title: "Ciudad no encontrada" };

  const title = `${city.name} en 3D — ubicaciones publicitarias`;
  const description =
    city.status === "available"
      ? `Explora el centro de ${city.name} en 3D y consulta las ubicaciones publicitarias disponibles sobre fachadas y espacios urbanos reales.`
      : `Ficha de ${city.name}: qué zona está cubierta, qué fuentes de datos se usan y en qué estado está el visor 3D.`;

  return {
    title,
    description,
    alternates: { canonical: `/city/${city.slug}` },
    openGraph: { title, description, type: "website" },
  };
}

/**
 * Página de la ciudad: portada con el acceso al visor 3D, cifras reales de la red y
 * las tres clasificaciones. Los datos, fuentes y licencias viven en `/city/[slug]/datos`
 * (enlazado desde el pie): aquí no hay tablas de metodología.
 */
export default async function CityPage({ params }: { params: Params }) {
  const { slug } = await params;
  const city = getCityBySlug(slug);
  if (!city) notFound();

  const openable = isCityOpenable(city);
  const publishBlockers = getPublishBlockers(city.slug);
  const counts = unitCatalogCounts();
  const kinds = [
    { icon: Building2, label: "Edificios", value: counts.buildings },
    { icon: Store, label: "Locales", value: counts.parcels },
    { icon: Castle, label: "Tramos de muralla", value: counts.walls },
    { icon: Ship, label: "Paneles de crucero", value: counts.cruisePanels },
    { icon: Sailboat, label: "Velas", value: counts.sails },
    { icon: Truck, label: "Camiones", value: counts.trucks },
    { icon: Plane, label: "Avionetas", value: counts.planes },
  ] as const;

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-[88rem] px-4 pb-24 pt-6 sm:px-8">
        <header className="pt-4 sm:pt-12">
          <Reveal>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
              <span>
                {city.region}, {city.country}
              </span>
              <span aria-hidden="true" className="text-line-strong">
                /
              </span>
              <span className="tnum font-mono text-xs text-subtle">
                {Math.abs(city.center[1]).toFixed(4)}° {city.center[1] >= 0 ? "N" : "S"}, {Math.abs(city.center[0]).toFixed(4)}°{" "}
                {city.center[0] >= 0 ? "E" : "O"}
              </span>
              <StatusPill status={city.status} />
            </p>
          </Reveal>
          <h1 className="display-face mt-4 text-[clamp(3.6rem,12vw,11rem)] font-medium leading-[0.9] tracking-[-0.05em] text-ink">
            <SplitText text={city.name} />
          </h1>
          <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <Reveal delay={200}>
              <p className="max-w-xl text-lg leading-relaxed text-muted">
                {openable
                  ? `El centro histórico de ${city.name}, levantado en 3D con datos públicos. Cada edificio, cada local de planta baja y cada tramo de la Alcazaba y Gibralfaro es un espacio publicitario con su precio.`
                  : `Ficha de ${city.name}: qué zona está cubierta, qué fuentes se usan y en qué estado está el visor 3D.`}
              </p>
            </Reveal>
            {openable ? (
              <Reveal delay={320} variant="scale">
                <Magnetic>
<Link
                  href={`/city/${city.slug}/viewer`}
                  className="cta btn-sweep inline-flex h-[4.25rem] items-center justify-between gap-8 rounded-full bg-accent pl-8 pr-6 text-[1.25rem] font-medium text-on-accent hover:text-[#1d0d06] sm:min-w-[23rem]"
                >
                  Open Málaga in 3D
                  <span className="btn-dot flex h-11 w-11 items-center justify-center rounded-full bg-on-accent text-accent">
                    <ArrowUpRight size={22} strokeWidth={2.2} aria-hidden="true" className="cta-arrow" />
                  </span>
                </Link>
</Magnetic>
              </Reveal>
            ) : null}
          </div>
        </header>

        {openable ? (
          <>
            <Reveal className="mt-14" delay={80}>
              <CityNumbers />
            </Reveal>

            <section aria-labelledby="que-se-vende" className="mt-20 sm:mt-28">
              <Reveal className="mb-8 max-w-2xl">
                <h2 id="que-se-vende" className="display-face text-[2rem] font-medium tracking-[-0.035em] text-ink sm:text-5xl">
                  Todo lo que se puede anunciar
                </h2>
              </Reveal>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {kinds.map((kind, index) => (
                  <Reveal as="li" key={kind.label} delay={index * 70} variant="scale">
                    <SpotCard tilt className="h-full rounded-3xl border border-line bg-surface/70 p-5 backdrop-blur-sm transition-colors hover:border-accent/50">
                      <kind.icon size={22} strokeWidth={1.6} aria-hidden="true" className="text-accent" />
                      <p className="display-face tnum mt-6 text-[2rem] font-medium leading-none tracking-[-0.04em] text-ink">
                        <CountUp value={kind.value} />
                      </p>
                      <p className="mt-2 text-sm text-muted">{kind.label}</p>
                    </SpotCard>
                  </Reveal>
                ))}
              </ul>
            </section>

            <section aria-labelledby="clasificaciones" className="mt-24 sm:mt-32">
              <Reveal className="mb-8 max-w-2xl">
                <h2 id="clasificaciones" className="display-face text-[2rem] font-medium tracking-[-0.035em] text-ink sm:text-5xl">
                  Clasificaciones de Málaga
                </h2>
                <p className="mt-3 text-base text-muted">
                  Calculadas con las compras completadas. Solo se publican los nombres que cada
                  anunciante ya muestra en el mapa.
                </p>
              </Reveal>
              <Leaderboards />
            </section>
          </>
        ) : (
          <section aria-labelledby="preparacion" className="mt-14">
            <h2 id="preparacion" className="display-face text-2xl font-medium text-ink">
              Estado del visor 3D
            </h2>
            <div className="mt-4">
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
                className="items-start rounded-3xl text-left"
              />
            </div>
            {publishBlockers.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {publishBlockers.map((blocker) => (
                  <li key={blocker} className="flex gap-2 rounded-2xl border border-premium/35 bg-premium-soft p-3 text-xs text-premium/90">
                    <ShieldAlert size={14} strokeWidth={1.9} aria-hidden="true" className="mt-[1px] shrink-0" />
                    {blocker}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        )}

        <Reveal className="mt-20 sm:mt-28">
          <Link
            href={`/city/${city.slug}/datos`}
            className="cta group flex items-center justify-between gap-4 rounded-3xl border border-line bg-surface/50 px-6 py-5 transition-colors hover:border-accent/50"
          >
            <span>
              <span className="display-face block text-lg font-medium tracking-[-0.02em] text-ink">Datos, fuentes y licencias</span>
              <span className="mt-0.5 block text-sm text-muted">Qué zona cubre el mapa, de dónde sale cada altura y con qué licencias.</span>
            </span>
            <ArrowRight size={20} strokeWidth={1.9} aria-hidden="true" className="shrink-0 text-subtle transition-transform duration-300 group-hover:translate-x-1 group-hover:text-accent" />
          </Link>
        </Reveal>
      </main>
      <SiteFooter />
    </>
  );
}
