"use client";

import { useLayoutEffect, useRef } from "react";
import { formatCents } from "@/lib/money";
import type { UnitView } from "@/lib/market/types";
import { UNIT_KIND_LABEL, unitKindOf } from "@/lib/market/types";
import { imageUrl } from "@/lib/scene/ads";

/** Última posición conocida del puntero: así el aviso nace junto al cursor y no en una esquina. */
const lastPointer = { x: -1, y: -1 };
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointermove",
    (event) => {
      lastPointer.x = event.clientX;
      lastPointer.y = event.clientY;
    },
    { passive: true },
  );
}

const GAP = 18;
const MARGIN = 10;

/**
 * Aviso junto al puntero (solo con ratón): al pasar sobre un espacio ya comprado
 * enseña quién lo anuncia; sobre uno libre, su precio. Nace ya colocado junto al
 * cursor (no espera al siguiente movimiento), lo sigue sin volver a renderizar en
 * cada pixel, se da la vuelta si no cabe y se aparta del ranking de la izquierda.
 */
export function UnitTooltip({ unitId, label, view }: { unitId: string; label: string; view: UnitView }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const node = ref.current;
      if (!node || lastPointer.x < 0) return;
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      let x = lastPointer.x + GAP;
      let y = lastPointer.y + GAP;
      if (x + width > window.innerWidth - MARGIN) x = lastPointer.x - GAP - width;
      if (y + height > window.innerHeight - MARGIN) y = lastPointer.y - GAP - height;
      // Si cae sobre el ranking de los más caros, se pasa a su derecha.
      const dock = document.querySelector("section[aria-label='Los espacios más caros']")?.getBoundingClientRect();
      if (dock && x < dock.right + 8 && x + width > dock.left && y < dock.bottom + 8 && y + height > dock.top) {
        x = dock.right + 12;
      }
      node.style.transform = `translate3d(${Math.max(MARGIN, Math.round(x))}px, ${Math.max(MARGIN, Math.round(y))}px, 0)`;
      node.style.visibility = "visible";
    };
    place();
    window.addEventListener("pointermove", place, { passive: true });
    return () => window.removeEventListener("pointermove", place);
  }, [unitId]);

  const owner = view.owner;
  const kind = UNIT_KIND_LABEL[unitKindOf(unitId)];
  const head = label && !label.startsWith(kind) ? `${kind} · ${label}` : label || kind;
  return (
    <div
      ref={ref}
      role="tooltip"
      className="unit-tip pointer-events-none fixed left-0 top-0 z-[25] w-72 rounded-2xl border border-line-strong bg-surface/95 p-3.5 shadow-[var(--shadow-float)] backdrop-blur-md"
      style={{ visibility: "hidden" }}
    >
      <p className="text-xs text-muted">{head}</p>
      {owner ? (
        <div className="mt-2 flex items-start gap-3">
          {owner.hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl(unitId, "logo", `${view.purchases}`)} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl border border-line object-cover" />
          ) : null}
          <div className="min-w-0">
            <p className="display-face truncate text-base font-medium leading-tight text-ink">{owner.name}</p>
            {owner.description ? <p className="mt-0.5 line-clamp-3 text-xs text-muted">{owner.description}</p> : null}
            <p className="mt-1.5 text-xs text-accent-ink">Pulsa para ver el anuncio</p>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 flex items-baseline gap-2.5">
          <span className="tnum font-mono text-2xl font-semibold text-ink">{formatCents(view.priceCents)}</span>
          <span className="text-sm text-available">Disponible</span>
        </p>
      )}
    </div>
  );
}
