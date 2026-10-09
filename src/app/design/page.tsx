import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, SearchX, KeyRound, TriangleAlert, RefreshCw, Star } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusPill } from "@/components/ui/StatusPill";
import { CityCardSkeleton, Skeleton } from "@/components/ui/Skeleton";
import { formatCents, priceLadderCents, stripeFeeCents } from "@/lib/money";
import { cities } from "@/lib/cities/registry";

export const metadata: Metadata = {
  title: "Taller de diseño",
  robots: { index: false, follow: false },
};

/**
 * Página interna para revisar el sistema de diseño completo. Solo existe en
 * desarrollo: en producción devuelve 404. Es una herramienta de trabajo, no
 * una página del producto.
 */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const ladder = priceLadderCents(100, 4);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6">
      <header className="border-b border-line pb-6">
        <Wordmark size="lg" />
        <h1 className="mt-5 text-lg font-medium text-ink">Taller de diseño</h1>
        <p className="mt-1 text-sm text-muted">
          Solo en desarrollo · <code className="font-mono text-xs">noindex</code> · aquí se revisan
          tokens, tipografía y todos los estados.
        </p>
      </header>

      <Section title="Paleta">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Swatch name="ivory" label="Fondo" cssVar="--c-ivory" />
          <Swatch name="surface" label="Superficie" cssVar="--c-surface" />
          <Swatch name="ink" label="Texto" cssVar="--c-ink" />
          <Swatch name="muted" label="Texto secundario" cssVar="--c-ink-muted" />
          <Swatch name="line" label="Borde" cssVar="--c-border" />
          <Swatch name="accent" label="Acento" cssVar="--c-accent" />
          <Swatch name="available" label="Disponible" cssVar="--c-available" />
          <Swatch name="occupied" label="Ocupado" cssVar="--c-occupied" />
          <Swatch name="premium" label="Premium" cssVar="--c-premium" />
          <Swatch name="danger" label="Error" cssVar="--c-danger" />
        </div>
        <p className="mt-4 text-sm text-muted">
          Acento propio: <strong className="text-ink">albero quemado (#B4522A)</strong>. Terracota
          apagada, cálida y ajena al azul genérico de SaaS. Contrasta 6,2:1 sobre el fondo marfil,
          suficiente para texto normal (WCAG 2.2 AA).
        </p>
      </Section>

      <Section title="Paleta del mapa">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Swatch name="building" label="Edificio" cssVar="--m-building" />
          <Swatch name="shade" label="Sombra" cssVar="--m-building-shade" />
          <Swatch name="land" label="Suelo" cssVar="--m-land" />
          <Swatch name="street" label="Calle" cssVar="--m-street" />
          <Swatch name="water" label="Agua" cssVar="--m-water" />
          <Swatch name="green" label="Verde" cssVar="--m-green" />
        </div>
      </Section>

      <Section title="Tipografía">
        <div className="space-y-4">
          <Spec label="display · 64" className="display-face text-3xl font-semibold tracking-[-0.03em]">
            Málaga
          </Spec>
          <Spec label="display · 40" className="display-face text-2xl font-semibold tracking-[-0.03em]">
            Centro histórico
          </Spec>
          <Spec label="sans · 20" className="text-lg">
            Ubicaciones publicitarias sobre fachadas reales
          </Spec>
          <Spec label="sans · 16" className="text-base text-muted">
            El precio se calcula en el servidor con aritmética entera de céntimos.
          </Spec>
          <Spec label="sans · 14" className="text-sm text-muted">
            Texto secundario para descripciones y ayudas.
          </Spec>
          <Spec label="sans · 12" className="text-xs uppercase tracking-[0.14em] text-subtle">
            Etiqueta en versalitas
          </Spec>
          <Spec label="mono · cifras tabulares" className="tnum font-mono text-sm">
            1.250,00 € · 156,00 € · 36.7196, -4.4228
          </Spec>
        </div>
      </Section>

      <Section title="Estados de ciudad">
        <div className="flex flex-wrap gap-3">
          <StatusPill status="available" />
          <StatusPill status="in_preparation" />
          <StatusPill status="unavailable" />
        </div>
        <p className="mt-3 text-sm text-muted">
          Color + forma (● ◐ ○) + texto. Ningún estado depende solo del color (WCAG 1.4.1).
        </p>
      </Section>

      <Section title="Botones">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Comprar ubicación</Button>
          <Button variant="secondary">Ver ficha</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="primary" disabled>
            No disponible
          </Button>
          <Button variant="secondary" size="sm">
            <RefreshCw size={14} strokeWidth={2} /> Reintentar
          </Button>
        </div>
      </Section>

      <Section title="Estados vacíos">
        <div className="grid gap-5 lg:grid-cols-2">
          <EmptyState
            icon={<MapPin size={26} strokeWidth={1.5} />}
            title="Todavía no hay ciudades publicadas"
            description="El catálogo se llena cuando cada ciudad tiene su cartografía verificada."
          />
          <EmptyState
            icon={<SearchX size={26} strokeWidth={1.5} />}
            title="Sin resultados"
            description="Ninguna ciudad coincide con «xyz». Prueba con otro nombre."
          />
          <EmptyState
            icon={<KeyRound size={26} strokeWidth={1.5} />}
            title="El acceso todavía no está activo"
            description="Tus ciudades guardadas viven solo en este navegador."
          />
          <EmptyState
            icon={<TriangleAlert size={26} strokeWidth={1.5} />}
            title="No hemos podido cargar el catálogo"
            description="Reintentar vuelve a renderizar sin recargar la página."
          />
        </div>
      </Section>

      <Section title="Carga">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <CityCardSkeleton />
          <CityCardSkeleton />
          <CityCardSkeleton />
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      </Section>

      <Section title="Tarjeta de ciudad (con datos reales del registro)">
        <ul className="grid list-none gap-6 sm:grid-cols-2">
          {cities.map((city) => (
            <li
              key={city.id}
              className="rounded-md border border-line bg-surface p-4"
            >
              <div className="flex items-center justify-between">
                <span className="display-face text-xl font-semibold">{city.name}</span>
                <StatusPill status={city.status} />
              </div>
              <p className="mt-1 text-sm text-muted">
                {city.region}, {city.country}
              </p>
              <p className="tnum mt-3 font-mono text-xs text-subtle">
                {city.center[1].toFixed(4)}, {city.center[0].toFixed(4)} · zoom{" "}
                {city.initialView.zoom} · pitch {city.initialView.pitch}°
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Precios (aritmética entera)">
        <p className="text-sm text-muted">
          Escalado del mismo emplazamiento:{" "}
          <code className="font-mono text-xs">siguiente = round_half_up(actual × 125 / 100)</code>
        </p>
        <ul className="tnum mt-3 flex flex-wrap gap-2 font-mono text-sm">
          {ladder.map((cents, index) => (
            <li key={cents} className="rounded-sm border border-line bg-surface px-2.5 py-1.5">
              <span className="text-subtle">{index === 0 ? "base" : `rev. ${index}`}</span>{" "}
              {formatCents(cents)}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          Comisión de Stripe (1,5 % + 0,25 €) sobre 1,00 € inicial:{" "}
          <span className="tnum font-mono text-ink">{formatCents(stripeFeeCents(100))}</span> — el
          27,5 % del importe. Motivo por el que el precio de entrada no puede ser simbólico.
        </p>
      </Section>

      <Section title="Foco y accesibilidad">
        <p className="text-sm text-muted">
          Recorre la página con <kbd className="rounded-sm border border-line px-1">Tab</kbd>: todos
          los elementos interactivos muestran un contorno de 2 px en color de acento. Los botones
          principales miden 44 px de alto (objetivo táctil mínimo).
        </p>
        <div className="mt-3 flex gap-3">
          <Button variant="secondary" size="md">
            Enfócame
          </Button>
          <span className="inline-flex h-11 items-center gap-1.5 text-sm text-muted">
            <Star size={16} strokeWidth={1.75} /> Ejemplo no interactivo
          </span>
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="border-b border-line pb-2 text-sm font-medium uppercase tracking-[0.12em] text-subtle">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Swatch({ name, label, cssVar }: { name: string; label: string; cssVar: string }) {
  return (
    <div className="rounded-md border border-line bg-surface p-2">
      <div
        className="h-14 w-full rounded-sm border border-line"
        style={{ backgroundColor: `var(${cssVar})` }}
      />
      <p className="mt-2 text-xs font-medium text-ink">{label}</p>
      <p className="font-mono text-[10px] text-subtle">{name}</p>
    </div>
  );
}

function Spec({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-line pt-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p className={`mt-1 ${className}`}>{children}</p>
    </div>
  );
}
