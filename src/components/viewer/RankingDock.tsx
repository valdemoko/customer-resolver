"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Clock3, Gem, LocateFixed, Share2 } from "lucide-react";
import { useLeaderboards } from "@/components/marketing/useLeaderboards";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/money";
import { timeAgo } from "@/lib/time-ago";

const medal = [
  "from-[#ffe08a] to-[#f0a63c] text-[#3a2500]",
  "from-[#e9eefc] to-[#9fb0d0] text-[#1b2540]",
  "from-[#f0b08a] to-[#c0703c] text-[#3a1c08]",
];

type Tab = "caros" | "compartidos" | "actividad";
const TABS: Array<{ id: Tab; label: string; title: string; icon: typeof Gem }> = [
  { id: "caros", label: "Más caros", title: "Los espacios más caros", icon: Gem },
  { id: "compartidos", label: "Compartidos", title: "Los anuncios más compartidos", icon: Share2 },
  { id: "actividad", label: "Actividad", title: "Actividad en directo", icon: Clock3 },
];

type Row = { key: string; unitId: string; title: string; sub: string };

/**
 * Rankings a la izquierda del visor, con tres pestañas: los espacios más caros (lo que de verdad se ha
 * pagado), los anuncios más compartidos (un punto por persona y día que lo comparte sin ser su dueño)
 * y la actividad en directo. Cada fila lleva la cámara hasta ese espacio. En el móvil arranca recogido
 * para no tapar el mapa.
 */
export function RankingDock({ onGo }: { readonly onGo: (unitId: string) => boolean }) {
  const state = useLeaderboards(30_000);
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("caros");
  const [missing, setMissing] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setOpen(false);
  }, []);

  if (state.status !== "ready" || !state.data.available) return null;
  const current = TABS.find((item) => item.id === tab) ?? TABS[0]!;
  const Icon = current.icon;
  const { data } = state;

  const rows: Row[] =
    tab === "caros"
      ? data.valuable.slice(0, 8).map((row) => ({ key: row.unitId, unitId: row.unitId, title: row.label, sub: formatCents(row.paidCents) }))
      : tab === "compartidos"
        ? (data.shared ?? []).slice(0, 8).map((row) => ({
            key: row.unitId,
            unitId: row.unitId,
            title: row.owner ?? row.label,
            sub: `${row.shares.toLocaleString("es-ES")} ${row.shares === 1 ? "punto" : "puntos"} · ${row.label}`,
          }))
        : data.latest.slice(0, 8).map((row) => ({
            key: `${row.unitId}-${row.createdAt}`,
            unitId: row.unitId,
            title: `${row.buyer} ${row.amountCents === 0 ? "reclamó" : "compró"}`,
            sub: `${row.label} · ${timeAgo(row.createdAt)}`,
          }));
  const empty =
    tab === "caros"
      ? "Todavía no se ha comprado nada. El primer espacio que se compre abrirá el ranking."
      : tab === "compartidos"
        ? "Nadie ha compartido todavía ningún anuncio. Abre uno y copia su enlace: el primero abre el ranking."
        : "Aún no hay actividad. La próxima persona en reclamar un espacio saldrá aquí.";

  return (
    <section
      aria-label={current.title}
      className="absolute left-3 top-16 z-20 w-[min(18rem,calc(100%-1.5rem))] overflow-hidden rounded-3xl border border-line-strong bg-surface/85 shadow-[var(--shadow-float)] backdrop-blur-md sm:left-4"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#f0cf84]" aria-hidden="true">
          <Icon size={16} strokeWidth={1.8} />
        </span>
        <span className="display-face flex-1 text-base font-medium tracking-[-0.02em] text-ink">{current.label}</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={cn("text-subtle transition-transform duration-300", open && "rotate-180")} />
      </button>

      {open ? (
        <>
          <div role="tablist" aria-label="Rankings" className="mx-3 mb-2 flex gap-1 rounded-full border border-line bg-sunken/60 p-0.5">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => {
                  setTab(item.id);
                  setMissing(null);
                }}
                className={cn(
                  "h-7 flex-1 rounded-full px-1 text-[11px] font-medium transition-colors",
                  tab === item.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="slim-scroll max-h-[38vh] overflow-y-auto px-2 pb-2">
            {rows.length === 0 ? (
              <p className="px-2 pb-3 text-sm text-muted">{empty}</p>
            ) : (
              <ol className="space-y-1">
                {rows.map((row, index) => (
                  <li key={row.key} className="rk-row flex items-center gap-2.5 rounded-2xl px-2 py-2" style={{ ["--i" as string]: index }}>
                    {tab === "actividad" ? (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line text-subtle" aria-hidden="true">
                        <Clock3 size={13} strokeWidth={1.9} />
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "display-face tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          index < 3 ? `bg-gradient-to-br ${medal[index]}` : "border border-line text-subtle",
                        )}
                        aria-label={`Puesto ${index + 1}`}
                      >
                        {index + 1}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink" title={row.title}>
                        {row.title}
                      </p>
                      <p className="tnum truncate font-mono text-xs text-muted">{row.sub}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMissing(onGo(row.unitId) ? null : row.unitId)}
                      aria-label={`Ir a ${row.title}`}
                      title="Ir al espacio"
                      className="btn-sweep inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-muted"
                    >
                      <LocateFixed size={15} strokeWidth={1.9} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {missing ? <p role="status" className="px-2 pb-2 text-xs text-premium">Ese espacio no está en la zona visible del mapa.</p> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
