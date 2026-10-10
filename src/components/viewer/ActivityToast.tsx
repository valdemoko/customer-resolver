"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, X } from "lucide-react";
import { useLeaderboards } from "@/components/marketing/useLeaderboards";

type Event = { key: string; unitId: string; text: string; label: string };

/**
 * Aviso en directo: mientras se mira el mapa, si alguien compra o reclama un espacio, sale un aviso
 * abajo a la izquierda con un botón para ir a verlo. Lo que ya estaba al abrir el visor no avisa:
 * solo lo que ocurre mientras se está aquí. Se oculta solo a los ocho segundos.
 */
export function ActivityToast({ onGo, hidden }: { readonly onGo: (unitId: string) => boolean; readonly hidden: boolean }) {
  const state = useLeaderboards(30_000);
  const seen = useRef<Set<string> | null>(null);
  const [event, setEvent] = useState<Event | null>(null);

  useEffect(() => {
    if (state.status !== "ready" || !state.data.available) return;
    const rows = state.data.latest;
    const keys = rows.map((row) => `${row.unitId}|${row.createdAt}`);
    if (seen.current === null) {
      seen.current = new Set(keys); // primera lectura: línea de base, sin avisos
      return;
    }
    const known = seen.current;
    const fresh = rows.filter((row) => !known.has(`${row.unitId}|${row.createdAt}`));
    for (const key of keys) known.add(key);
    const newest = fresh[0];
    if (newest) {
      setEvent({
        key: `${newest.unitId}|${newest.createdAt}`,
        unitId: newest.unitId,
        text: `${newest.buyer} acaba de ${newest.amountCents === 0 ? "reclamar" : "comprar"}`,
        label: newest.label,
      });
    }
  }, [state]);

  useEffect(() => {
    if (!event) return;
    const timer = window.setTimeout(() => setEvent(null), 8000);
    return () => window.clearTimeout(timer);
  }, [event]);

  if (!event || hidden) return null;
  return (
    <div
      key={event.key}
      role="status"
      className="stamp-in absolute bottom-5 left-3 z-20 flex max-w-[min(20rem,calc(100%-1.5rem))] items-center gap-3 rounded-2xl border border-line-strong bg-surface/90 py-2.5 pl-4 pr-2 shadow-[var(--shadow-float)] backdrop-blur-md sm:left-4"
    >
      <span className="live-dot h-2 w-2 shrink-0 rounded-full bg-available" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-ink">
        <span className="block truncate">{event.text}</span>
        <span className="block truncate text-xs text-muted">{event.label}</span>
      </p>
      <button
        type="button"
        onClick={() => {
          onGo(event.unitId);
          setEvent(null);
        }}
        aria-label={`Ir a ${event.label}`}
        title="Ir al espacio"
        className="btn-sweep inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-muted"
      >
        <LocateFixed size={15} strokeWidth={1.9} aria-hidden="true" />
      </button>
      <button type="button" onClick={() => setEvent(null)} aria-label="Cerrar aviso" className="inline-flex h-9 w-7 shrink-0 items-center justify-center text-subtle hover:text-ink">
        <X size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
