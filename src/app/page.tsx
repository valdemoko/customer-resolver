import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ArrowUpRight, Eye, MousePointerClick, CreditCard } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { CityDirectory } from "@/components/marketing/CityDirectory";
import { CountUp } from "@/components/marketing/CountUp";
import { HeroStage } from "@/components/marketing/HeroStage";
import { LiveStats, Metric } from "@/components/marketing/LiveStats";
import { Magnetic, Reveal, SpotCard, SplitText } from "@/components/marketing/Reveal";
import type { MapCity } from "@/components/marketing/NetworkMarkers";
import { isCityOpenable } from "@/lib/cities/schema";
import { listCities } from "@/lib/cities/registry";
import { unitCatalogCounts } from "@/lib/market/units";
import { brand } from "@/lib/brand";
import type { CatalogFilter } from "@/stores/catalog";

export const metadata: Metadata = {
  title: `${brand.name} — Publicidad sobre las fachadas de la ciudad`,
  description: brand.description,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${brand.name} — Publicidad sobre las fachadas de la ciudad`,
    description: brand.description,
    type: "website",
  },
};

type SearchParams = Promise<{ q?: string; filter?: string }>;

function parseFilter(value: string | undefined): CatalogFilter {
  if (value === "available" || value === "saved") return value;
  return "all";
}

const STEPS = [
  {
    icon: Eye,
    title: "Recorre la ciudad",
    body: "Málaga está levantada en 3D con cartografía pública. Gira, acércate y pasa el ratón por un espacio para ver su precio.",
  },
  {
    icon: MousePointerClick,
    title: "Elige un espacio",
    body: "Un edificio, un local de planta baja, un tramo de la Alcazaba o Gibralfaro, un panel de crucero, una vela o una avioneta.",
  },
  {
    icon: CreditCard,
    title: "Pon tu anuncio y paga",
    body: "Sube una foto por cara, tu logo y tu web, y paga con Stripe. La primera compra cuesta 1 €; cada compra siguiente sube el precio un 25 %.",
  },
] as const;

/**
 * Portada: entrada a la red de ciudades. Server Component; el motor 3D no se
 * carga aquí, vive en /city/[slug]/viewer. Son cliente solo el escenario de
 * puntos del mapa, las cifras de compras, el revelado y el fondo.
 */
export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // Las búsquedas y filtros del catálogo viven en /ciudades: las URLs antiguas (/?q=…, /?filter=…) siguen funcionando.
  if (params.q || parseFilter(params.filter) !== "all") {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.filter) query.set("filter", params.filter);
    redirect(`/ciudades?${query.toString()}`);
  }
  const cities = listCities();
  const openable = cities.filter(isCityOpenable);
  const counts = unitCatalogCounts();
  const forSale = counts.buildings + counts.parcels + counts.walls + counts.mobile;

  const mapCities: MapCity[] = cities.map((city) => ({
    slug: city.slug,
    name: city.name,
    country: city.country,
    lon: city.center[0],
    lat: city.center[1],
    openable: isCityOpenable(city),
    statusLabel: isCityOpenable(city) ? "Disponible" : city.status === "in_preparation" ? "En preparación" : "No disponible",
  }));
  const primary = openable[0];
  const ticker = [
    `${counts.buildings.toLocaleString("es-ES")} edificios`,
    `${counts.parcels.toLocaleString("es-ES")} locales`,
    `${counts.walls} tramos de muralla`,
    `${counts.cruisePanels} paneles de crucero`,
    `${counts.sails} velas`,
    `${counts.planes} avionetas con cartel`,
    "desde 1 €",
    "pago con Stripe",
  ];

  return (
    <>
      <TopBar />
      <main>
        {/* ------------------------------------------------------------ portada */}
        <HeroStage cities={mapCities}>
          <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr] lg:items-end lg:gap-16">
            <h1
              id="titulo"
              className="display-face text-[clamp(2.7rem,7.2vw,6.8rem)] font-medium leading-[0.96] tracking-[-0.045em] text-ink"
            >
              <SplitText text="Tu marca, sobre las fachadas de la ciudad." lines={["Tu marca,", "sobre las fachadas", "de la ciudad."]} />
            </h1>
            <div>
              <Reveal delay={500}>
                <p className="max-w-md text-lg leading-relaxed text-muted">
                  Recorre {primary ? primary.name : "la ciudad"} en 3D, elige un edificio, un local o un tramo
                  de muralla y anúnciate desde 1 €. Cada compra sube el precio del espacio un 25 %.
                </p>
              </Reveal>
              <Reveal delay={700} variant="scale" className="mt-7 flex flex-wrap items-center gap-3">
                {primary ? (
                  <Magnetic>
<Link
                    href={`/city/${primary.slug}/viewer`}
                    className="cta btn-sweep inline-flex h-14 items-center gap-3 rounded-full bg-accent pl-7 pr-2.5 text-base font-medium text-on-accent hover:text-[#1d0d06]"
                  >
                    Explore Málaga in 3D
                    <span className="btn-dot flex h-10 w-10 items-center justify-center rounded-full bg-on-accent text-accent">
                      <ArrowUpRight size={19} strokeWidth={2.2} aria-hidden="true" className="cta-arrow" />
                    </span>
                  </Link>
</Magnetic>
                ) : null}
                <a
                  href="/ciudades"
                  className="btn-sweep inline-flex h-14 items-center gap-2 rounded-full border border-line-strong bg-surface/40 px-6 text-base text-ink backdrop-blur-sm transition-colors hover:border-accent/60"
                >
                  Ver todas las ciudades
                  <ArrowRight size={16} strokeWidth={2} aria-hidden="true" />
                </a>
              </Reveal>
            </div>
          </div>
        </HeroStage>

        {/* ---------------------------------------------------------- cifras */}
        <section aria-label="Cifras de la red" className="mx-auto max-w-[88rem] px-4 sm:px-8">
          <Reveal variant="clip">
            <dl className="flex flex-wrap divide-x divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface/60 backdrop-blur-sm [&>*]:min-w-[50%] [&>*]:flex-1 sm:[&>*]:min-w-[25%]">
              <Metric label="Ciudades abiertas" node={<CountUp value={openable.length} />} />
              <Metric label="Espacios a la venta" node={<CountUp value={forSale} />} />
              <LiveStats />
            </dl>
          </Reveal>
        </section>

        {/* ---------------------------------------------------------- ticker */}
        <Reveal className="ticker mt-14 overflow-hidden" delay={120}>
          <div className="ticker-track" aria-hidden="true">
            {[0, 1].map((copy) => (
              <ul key={copy} className="flex shrink-0 items-center">
                {ticker.map((item) => (
                  <li key={`${copy}-${item}`} className="display-face flex items-center whitespace-nowrap text-[2rem] font-medium tracking-[-0.03em] text-ink/80 sm:text-5xl">
                    {item}
                    <span className="mx-6 h-2 w-2 rounded-full bg-accent sm:mx-10" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
          <p className="sr-only">{ticker.join(", ")}</p>
        </Reveal>

        {/* ------------------------------------------------------------ red */}
        <section id="red" aria-labelledby="red-titulo" className="mx-auto max-w-[88rem] scroll-mt-20 px-4 pb-4 pt-24 sm:px-8 sm:pt-36">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="red-titulo" className="display-face text-[2rem] font-medium tracking-[-0.035em] text-ink sm:text-6xl">
                <SplitText text="Explora la red" />
              </h2>
              <Reveal delay={200}>
                <p className="mt-3 max-w-xl text-base text-muted">
                  Cada ciudad se reconstruye con datos públicos y se abre cuando su geometría pasa la
                  verificación. El resto del mapa está por abrir.
                </p>
              </Reveal>
            </div>
            <Reveal delay={300}>
              <p className="tnum text-sm text-subtle">
                {cities.length === 1 ? "1 ciudad en el catálogo" : `${cities.length} ciudades en el catálogo`}
              </p>
            </Reveal>
          </div>

          <CityDirectory cities={cities.slice(0, 3)} />
          <Reveal delay={150} className="mt-8 flex justify-center">
            <Link
              href="/ciudades"
              className="btn-sweep inline-flex h-14 items-center gap-3 rounded-full border border-line-strong bg-surface/50 px-8 text-base text-ink"
            >
              {cities.length === 1 ? "Ver el catálogo de ciudades" : `Ver las ${cities.length} ciudades`}
              <ArrowRight size={17} strokeWidth={2} aria-hidden="true" />
            </Link>
          </Reveal>
        </section>

        {/* ------------------------------------------------------- cómo funciona */}
        <section aria-labelledby="como" className="mx-auto max-w-[88rem] px-4 pt-24 sm:px-8 sm:pt-36">
          <div className="mb-10 max-w-3xl">
            <h2 id="como" className="display-face text-[2rem] font-medium tracking-[-0.035em] text-ink sm:text-6xl">
              <SplitText text="De la fachada a tu anuncio, en tres pasos" />
            </h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <Reveal as="li" key={step.title} delay={index * 140} variant={index === 0 ? "left" : index === 2 ? "right" : "rise"}>
                <SpotCard tilt className="group h-full rounded-3xl border border-line bg-surface/60 p-7 backdrop-blur-sm transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-accent/50 sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent transition-transform duration-300 group-hover:scale-110 group-hover:rotate-[-6deg]">
                      <step.icon size={22} strokeWidth={1.7} aria-hidden="true" />
                    </span>
                    <span className="display-face tnum text-5xl font-medium tracking-[-0.05em] text-line-strong" aria-hidden="true">
                      {index + 1}
                    </span>
                  </div>
                  <h3 className="display-face mt-8 text-[1.5rem] font-medium tracking-[-0.03em] text-ink">{step.title}</h3>
                  <p className="mt-3 text-base leading-relaxed text-muted">{step.body}</p>
                </SpotCard>
              </Reveal>
            ))}
          </ol>
          <Reveal delay={200}>
            <p className="mt-6 text-sm text-muted">
              ¿Quieres los detalles de datos, licencias y límites?{" "}
              <Link href="/como-funciona" className="text-accent-ink underline decoration-accent/40 underline-offset-4 hover:decoration-accent">
                Cómo funciona
              </Link>
              .
            </p>
          </Reveal>
        </section>

        {/* -------------------------------------------------------- cierre */}
        {primary ? (
          <section aria-labelledby="cierre" className="mx-auto max-w-[88rem] px-4 pb-24 pt-24 sm:px-8 sm:pb-36 sm:pt-36">
            <Reveal variant="scale">
              <div className="relative overflow-hidden rounded-[2rem] border border-line-strong bg-surface/70 px-6 py-16 backdrop-blur-sm sm:px-16 sm:py-24">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:url(/brand/contours-b.svg)] [background-size:cover]" />
                <h2
                  id="cierre"
                  className="display-face relative max-w-3xl text-[clamp(2.2rem,5vw,4.6rem)] font-medium leading-[0.98] tracking-[-0.04em] text-ink"
                >
                  <SplitText text={`${primary.name} ya está abierta. Elige tu fachada.`} />
                </h2>
                <div className="relative mt-9">
                  <Magnetic>
<Link
                    href={`/city/${primary.slug}/viewer`}
                    className="cta btn-sweep inline-flex h-14 items-center gap-3 rounded-full bg-accent pl-7 pr-2.5 text-base font-medium text-on-accent hover:text-[#1d0d06]"
                  >
                    Explore Málaga in 3D
                    <span className="btn-dot flex h-10 w-10 items-center justify-center rounded-full bg-on-accent text-accent">
                      <ArrowUpRight size={19} strokeWidth={2.2} aria-hidden="true" className="cta-arrow" />
                    </span>
                  </Link>
</Magnetic>
                </div>
              </div>
            </Reveal>
          </section>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
