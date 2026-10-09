"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Gem, LocateFixed } from "lucide-react";
import { useLeaderboards } from "@/components/marketing/useLeaderboards";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/money";

const medal = [
  "from-[#ffe08a] to-[#f0a63c] text-[#3a2500]",
  "from-[#e9eefc] to-[#9fb0d0] text-[#1b2540]",
  "from-[#f0b08a] to-[#c0703c] text-[#3a1c08]",
];

/**
 * Ranking de los espacios más caros, a la izquierda del visor. Cada fila tiene un
 * botón que lleva la cámara hasta ese edificio (o local, tramo, panel…) y lo
 * selecciona. Los datos son los mismos que las clasificaciones de la ciudad: lo
 * que de verdad se ha pagado. En el móvil arranca recogido para no tapar el mapa.
 */
export function RankingDock({ onGo }: { readonly onGo: (unitId: string) => boolean }) {
  const state = useLeaderboards(30_000);
  const [open, setOpen] = useState(true);
  const [missing, setMissing] = useState<string | null>(null);

  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setOpen(false);
  }, []);

  if (state.status !== "ready" || !state.data.available) return null;
  const rows = state.data.valuable.slice(0, 8);

  return (
    <section
      aria-label="Los espacios más caros"
      className="absolute left-3 top-16 z-20 w-[min(18rem,calc(100%-1.5rem))] overflow-hidden rounded-3xl border border-line-strong bg-surface/85 shadow-[var(--shadow-float)] backdrop-blur-md sm:left-4"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#f0cf84]" aria-hidden="true">
          <Gem size={16} strokeWidth={1.8} />
        </span>
        <span className="display-face flex-1 text-base font-medium tracking-[-0.02em] text-ink">Los más caros</span>
        <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={cn("text-subtle transition-transform duration-300", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="max-h-[38vh] overflow-y-auto px-2 pb-2">
          {rows.length === 0 ? (
            <p className="px-2 pb-3 text-sm text-muted">Todavía no se ha comprado nada. El primer espacio que se compre abrirá el ranking.</p>
          ) : (
            <ol className="space-y-1">
              {rows.map((row, index) => (
                <li key={row.unitId} className="rk-row flex items-center gap-2.5 rounded-2xl px-2 py-2" style={{ ["--i" as string]: index }}>
                  <span
                    className={cn(
                      "display-face tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      index < 3 ? `bg-gradient-to-br ${medal[index]}` : "border border-line text-subtle",
                    )}
                    aria-label={`Puesto ${index + 1}`}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink" title={row.label}>
                      {row.label}
                    </p>
                    <p className="tnum truncate font-mono text-xs text-muted">{formatCents(row.paidCents)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMissing(onGo(row.unitId) ? null : row.unitId)}
                    aria-label={`Ir a ${row.label}`}
                    title="Ir al edificio"
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
      ) : null}
    </section>
  );
}
