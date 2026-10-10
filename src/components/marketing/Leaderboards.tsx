"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CircleAlert, Clock3, Crown, Gem, Layers, Share2 } from "lucide-react";
import { CountUp } from "./CountUp";
import { Reveal, SpotCard } from "./Reveal";
import { useLeaderboards } from "./useLeaderboards";
import type { LeaderboardsPayload } from "@/lib/market/service";

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
const dateFormat = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

/** «hace 3 horas», «ayer»… para fechas pasadas; la fecha exacta va en el atributo `title`. */
function relative(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "hace un momento";
}

type Tone = { ring: string; text: string; glow: string; bar: string };
const TONES: Record<"gold" | "cyan" | "violet" | "green", Tone> = {
  gold: { ring: "border-[#e8c066]/30", text: "text-[#f0cf84]", glow: "from-[#e8c066]/14", bar: "from-[#e8c066] to-[#d9965a]" },
  cyan: { ring: "border-accent/30", text: "text-accent-ink", glow: "from-accent/12", bar: "from-[#ff7a4d] to-[#ffb08a]" },
  green: { ring: "border-available/30", text: "text-available", glow: "from-available/12", bar: "from-[#3fae82] to-[#9be0bd]" },
  violet: { ring: "border-[#9fb4d8]/30", text: "text-[#c3d1ea]", glow: "from-[#9fb4d8]/12", bar: "from-[#8fa6cf] to-[#c3d1ea]" },
};

/** Medalla del puesto: oro, plata y bronce para el podio; número discreto para el resto. */
function Medal({ n }: { readonly n: number }) {
  const podium = [
    "from-[#ffe08a] to-[#f0a63c] text-[#3a2500]",
    "from-[#e9eefc] to-[#9fb0d0] text-[#1b2540]",
    "from-[#f0b08a] to-[#c0703c] text-[#3a1c08]",
  ];
  if (n <= 3) {
    return (
      <span
        className={`display-face tnum inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold shadow-[0_4px_14px_-4px_rgb(0_0_0/0.6)] ${podium[n - 1]}`}
        aria-label={`Puesto ${n}`}
      >
        {n}
      </span>
    );
  }
  return (
    <span
      className="display-face tnum inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-sm text-subtle"
      aria-label={`Puesto ${n}`}
    >
      {n}
    </span>
  );
}

function Panel({
  id,
  tone,
  icon,
  title,
  note,
  delay,
  children,
}: {
  readonly id: string;
  readonly tone: Tone;
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly note: string;
  readonly delay: number;
  readonly children: React.ReactNode;
}) {
  return (
    <Reveal variant="clip" delay={delay} className="h-full min-w-0">
      <SpotCard
        as="section"
        labelledBy={id}
        className={`flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border bg-surface/70 backdrop-blur-sm ${tone.ring}`}
      >
        <header className={`relative flex items-start gap-3.5 bg-gradient-to-b to-transparent px-5 pb-4 pt-5 ${tone.glow}`}>
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 ${tone.text}`}
            aria-hidden="true"
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h3 id={id} className="display-face text-[1.3rem] font-medium leading-tight tracking-[-0.025em] text-ink">
              {title}
            </h3>
            <p className="mt-1 text-sm text-muted">{note}</p>
          </div>
        </header>
        {children}
      </SpotCard>
    </Reveal>
  );
}

/** Puestos libres: estado vacío con intención (nadie ha comprado todavía), nunca gente inventada. */
function GhostPodium({ text }: { readonly text: string }) {
  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-5">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          style={{ ["--i" as string]: n - 1 }}
          className="rk-ghost flex items-center gap-3 rounded-2xl border border-dashed border-line-strong px-3.5 py-3"
        >
          <Medal n={n} />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">Puesto libre</p>
            <span className="mt-1.5 block h-1.5 w-2/3 rounded-full bg-sunken" />
          </div>
        </div>
      ))}
      <p className="mt-1 px-1 text-sm text-muted">{text}</p>
      <Link
        href="/city/malaga/viewer"
        className="cta inline-flex h-11 items-center justify-between rounded-full border border-accent/50 bg-accent/10 px-5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent/20"
      >
        Conseguir el puesto 1
        <ArrowUpRight size={16} strokeWidth={2.2} aria-hidden="true" className="cta-arrow" />
      </Link>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-5" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl bg-sunken/40 px-3.5 py-3">
          <span className="h-8 w-8 animate-pulse rounded-full bg-sunken" />
          <span className="h-4 flex-1 animate-pulse rounded-full bg-sunken" style={{ maxWidth: `${72 - i * 7}%` }} />
          <span className="h-4 w-14 animate-pulse rounded-full bg-sunken" />
        </div>
      ))}
    </div>
  );
}

function Unavailable() {
  return (
    <div role="status" className="flex items-start gap-3 rounded-3xl border border-premium/35 bg-premium-soft p-6 text-sm text-premium">
      <CircleAlert size={18} strokeWidth={1.9} aria-hidden="true" className="mt-0.5 shrink-0" />
      <p>
        Las clasificaciones no están disponibles ahora mismo. No mostramos datos de ejemplo: vuelve a
        intentarlo en unos minutos.
      </p>
    </div>
  );
}

/** Una fila de ranking. `lead` agranda el puesto 1; `fresh` marca lo recién llegado. */
function Row({
  index,
  fresh,
  lead,
  title,
  sub,
  value,
  tone,
  bar,
  href,
}: {
  readonly index: number;
  readonly fresh: boolean;
  readonly lead: boolean;
  readonly title: string;
  readonly sub?: React.ReactNode;
  readonly value: React.ReactNode;
  readonly tone: Tone;
  readonly bar?: number;
  /** Si se da, toda la fila lleva a ese espacio en el mapa. */
  readonly href?: string;
}) {
  const leadClasses = `rk-shine rounded-2xl border bg-gradient-to-r to-transparent p-4 ${tone.ring} ${tone.glow}`;
  return (
    <li
      style={{ ["--i" as string]: index }}
      className={`rk-row relative ${href ? "group/row transition-colors hover:bg-sunken/60" : ""} ${fresh ? "rk-fresh" : ""} ${lead ? leadClasses : "rounded-2xl px-3.5 py-2.5"} flex items-center gap-3`}
    >
      <Medal n={index + 1} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-ink ${lead ? "display-face text-lg font-medium tracking-[-0.02em]" : "text-sm"}`} title={title}>
          {title}
        </p>
        {sub ? <p className="truncate text-xs text-subtle">{sub}</p> : null}
        {bar === undefined ? null : (
          <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-sunken/70">
            <span className={`rk-bar block h-full rounded-full bg-gradient-to-r ${tone.bar}`} style={{ width: `${Math.max(6, bar * 100)}%` }} />
          </span>
        )}
      </div>
      <div className={`tnum shrink-0 text-right font-mono ${lead ? `text-xl font-semibold ${tone.text}` : "text-sm text-ink"}`}>{value}</div>
      {href ? (
        <>
          <ArrowUpRight size={14} strokeWidth={2.2} aria-hidden="true" className="shrink-0 text-subtle transition-transform group-hover/row:-translate-y-0.5 group-hover/row:translate-x-0.5 group-hover/row:text-ink" />
          <Link href={href} aria-label={`Ver ${title} en el mapa`} className="absolute inset-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" />
        </>
      ) : null}
    </li>
  );
}

/** Claves que acaban de aparecer respecto a la lectura anterior (para el destello de «nuevo»). */
function useFresh(keys: readonly string[]): Set<string> {
  const previous = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const signature = keys.join("|");
  useEffect(() => {
    const now = new Set(keys);
    const before = previous.current;
    if (before) {
      const added = new Set([...now].filter((key) => !before.has(key)));
      if (added.size > 0) setFresh(added);
    }
    previous.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` resume `keys`
  }, [signature]);
  return fresh;
}

function Valuable({ rows }: { readonly rows: LeaderboardsPayload["valuable"] }) {
  const fresh = useFresh(rows.map((row) => `${row.unitId}:${row.paidCents}`));
  const tone = TONES.gold;
  return (
    <Panel id="rk-valor" tone={tone} icon={<Gem size={20} strokeWidth={1.8} />} title="Espacios más valiosos" note="El mayor importe pagado por un espacio, en un solo pago." delay={0}>
      {rows.length === 0 ? (
        <GhostPodium text="Todavía no se ha completado ninguna compra en Málaga. El espacio que abra el ranking queda en lo más alto." />
      ) : (
        <ol className="flex flex-1 flex-col gap-1.5 px-3 pb-4" aria-label={`Los ${rows.length} espacios con el pago más alto`}>
          {rows.map((row, index) => (
            <Row
              key={row.unitId}
              index={index}
              lead={index === 0}
              fresh={fresh.has(`${row.unitId}:${row.paidCents}`)}
              tone={tone}
              title={row.label}
              href={`/city/malaga/viewer?unit=${encodeURIComponent(row.unitId)}`}
              sub={`${row.kind}${row.owner ? ` · ${row.owner}` : ""}${row.purchases > 1 ? ` · ${row.purchases} compras` : ""}`}
              value={<CountUp value={row.paidCents} unit="eur" />}
            />
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Owners({ rows }: { readonly rows: LeaderboardsPayload["owners"] }) {
  const max = Math.max(1, ...rows.map((row) => row.units));
  const fresh = useFresh(rows.map((row) => `${row.name}:${row.units}`));
  const tone = TONES.cyan;
  return (
    <Panel id="rk-duenos" tone={tone} icon={<Crown size={20} strokeWidth={1.8} />} title="Mayores propietarios" note="Anunciantes con más espacios en su poder ahora." delay={120}>
      {rows.length === 0 ? (
        <GhostPodium text="Todavía no hay anunciantes con espacios en Málaga. Quien compre primero lidera la tabla." />
      ) : (
        <ol className="flex flex-1 flex-col gap-1.5 px-3 pb-4" aria-label={`Los ${rows.length} anunciantes con más espacios`}>
          {rows.map((row, index) => (
            <Row
              key={row.name}
              index={index}
              lead={index === 0}
              fresh={fresh.has(`${row.name}:${row.units}`)}
              tone={tone}
              title={row.name}
              sub={row.units === 1 ? "1 espacio" : `${row.units} espacios`}
              bar={row.units / max}
              value={<CountUp value={row.units} />}
            />
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Shared({ rows }: { readonly rows: LeaderboardsPayload["shared"] }) {
  const max = Math.max(1, ...rows.map((row) => row.shares));
  const fresh = useFresh(rows.map((row) => `${row.unitId}:${row.shares}`));
  const tone = TONES.green;
  return (
    <Panel id="rk-compartidos" tone={tone} icon={<Share2 size={20} strokeWidth={1.8} />} title="Anuncios más compartidos" note="Un punto cada vez que alguien que no es su dueño comparte el anuncio (una vez al día por persona)." delay={240}>
      {rows.length === 0 ? (
        <GhostPodium text="Nadie ha compartido todavía ningún anuncio. Abre uno en el mapa y copia su enlace: el primero en compartirse abre el ranking." />
      ) : (
        <ol className="flex flex-1 flex-col gap-1.5 px-3 pb-4" aria-label={`Los ${rows.length} anuncios más compartidos`}>
          {rows.map((row, index) => (
            <Row
              key={row.unitId}
              index={index}
              lead={index === 0}
              fresh={fresh.has(`${row.unitId}:${row.shares}`)}
              tone={tone}
              title={row.owner ?? row.label}
              href={`/city/malaga/viewer?unit=${encodeURIComponent(row.unitId)}`}
              sub={`${row.label}${row.owner ? "" : ` · ${row.kind}`}`}
              bar={row.shares / max}
              value={<CountUp value={row.shares} />}
            />
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Latest({ rows }: { readonly rows: LeaderboardsPayload["latest"] }) {
  const fresh = useFresh(rows.map((row) => `${row.unitId}:${row.createdAt}`));
  const tone = TONES.violet;
  return (
    <Panel id="rk-ultimos" tone={tone} icon={<Clock3 size={20} strokeWidth={1.8} />} title="Actividad en directo" note="Lo último que pasa en Málaga: espacios comprados o reclamados, del más reciente al más antiguo." delay={360}>
      {rows.length === 0 ? (
        <GhostPodium text="Aún no hay compras completadas. La próxima en aparecer aquí puede ser la tuya." />
      ) : (
        <ol className="flex flex-1 flex-col gap-1.5 px-3 pb-4" aria-label={`Las ${rows.length} últimas compras`}>
          {rows.map((row, index) => (
            <Row
              key={`${row.unitId}-${row.createdAt}`}
              index={index}
              lead={index === 0}
              fresh={fresh.has(`${row.unitId}:${row.createdAt}`)}
              tone={tone}
              title={`${row.buyer} ${row.amountCents === 0 ? "reclamó" : "compró"}`}
              href={`/city/malaga/viewer?unit=${encodeURIComponent(row.unitId)}`}
              sub={
                <>
                  {row.label} ·{" "}
                  <time dateTime={row.createdAt} title={dateFormat.format(new Date(row.createdAt))}>
                    {relative(row.createdAt)}
                  </time>
                </>
              }
              value={row.amountCents === 0 ? "Gratis" : <CountUp value={row.amountCents} unit="eur" />}
            />
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** Las tres clasificaciones de Málaga, con datos reales de la base de datos y refresco cada 30 s. */
export function Leaderboards() {
  const state = useLeaderboards(30_000);
  if (state.status === "error" || (state.status === "ready" && !state.data.available)) return <Unavailable />;
  if (state.status === "loading") {
    const loading: Array<[string, Tone, React.ReactNode]> = [
      ["Espacios más valiosos", TONES.gold, <Gem key="g" size={20} strokeWidth={1.8} />],
      ["Mayores propietarios", TONES.cyan, <Crown key="c" size={20} strokeWidth={1.8} />],
      ["Anuncios más compartidos", TONES.green, <Share2 key="s" size={20} strokeWidth={1.8} />],
      ["Actividad en directo", TONES.violet, <Clock3 key="l" size={20} strokeWidth={1.8} />],
    ];
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Cargando clasificaciones">
        {loading.map(([title, tone, icon], index) => (
          <Panel key={title} id={`sk-${index}`} tone={tone} icon={icon} title={title} note="Cargando…" delay={index * 100}>
            <SkeletonRows />
          </Panel>
        ))}
      </div>
    );
  }
  const { data } = state;
  return (
    <div>
      <div className="mb-5 flex items-center gap-2.5 text-sm text-muted">
        <span className="live-dot h-2 w-2 rounded-full bg-available" aria-hidden="true" />
        En directo · se actualiza cada 30 s
        <Layers size={14} strokeWidth={1.8} aria-hidden="true" className="ml-1 text-subtle" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Valuable rows={data.valuable} />
        <Owners rows={data.owners} />
        <Shared rows={data.shared ?? []} />
        <Latest rows={data.latest} />
      </div>
    </div>
  );
}
