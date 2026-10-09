"use client";

import { ExternalLink, Lock } from "lucide-react";
import { UNIT_KIND_LABEL, unitKindOf } from "@/lib/market/types";
import type { UnitView } from "@/lib/market/types";
import { imageUrl } from "@/lib/scene/ads";
import { lockHour } from "@/lib/market/lock-label";
import { ShareLink } from "./ShareLink";

/**
 * Panel de la derecha con los datos del anunciante de un espacio ya comprado:
 * su foto, nombre, desde cuándo anuncia, descripción y enlace. Aparece al pasar el
 * ratón por un espacio comprado y se queda mientras ese espacio esté seleccionado.
 * Si el espacio está libre no hay panel: de eso se ocupa el aviso del cursor y la
 * ficha de compra de la izquierda.
 */
export function OwnerSidePanel({ unitId, label, view }: { readonly unitId: string; readonly label: string; readonly view: UnitView }) {
  const owner = view.owner;
  if (!owner) return null;
  const version = `${view.purchases}`;
  const since = owner.since ? new Date(owner.since).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "";
  const kind = UNIT_KIND_LABEL[unitKindOf(unitId)];
  const protectedUntil = lockHour(view.lockedUntil);
  return (
    <aside
      key={unitId}
      aria-label={`Anunciante de ${label}`}
      className="owner-card pointer-events-auto absolute right-3 top-16 z-20 w-[min(21rem,calc(100%-1.5rem))] overflow-hidden rounded-3xl border border-line-strong bg-surface/90 shadow-[var(--shadow-float)] backdrop-blur-md sm:right-4"
    >
      {owner.hasLogo ? (
        // La foto del anunciante, encuadrada sin deformarla. Es un data URL propio: no hay optimizador.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl(unitId, "logo", version)} alt={`Foto de ${owner.name}`} className="h-40 w-full object-cover" />
      ) : null}
      <div className="p-5">
        <p className="text-xs text-muted">
          {kind}
          {label && !label.startsWith(kind) ? ` · ${label}` : ""}
        </p>
        <h2 className="display-face mt-1 text-xl font-medium leading-tight tracking-[-0.02em] text-ink">{owner.name}</h2>
        {since ? <p className="mt-0.5 text-xs text-muted">Anunciante desde el {since}</p> : null}
        {protectedUntil ? (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line-strong px-3 py-1 text-xs text-muted">
            <Lock size={12} strokeWidth={2} aria-hidden="true" />
            Protegido hasta las <span className="tnum font-medium text-ink">{protectedUntil}</span>
          </p>
        ) : null}
        {owner.description ? <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink/90">{owner.description}</p> : null}
        {owner.url ? (
          <a
            href={owner.url}
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            className="btn-sweep mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-accent/50 px-4 text-sm font-medium text-accent-ink"
          >
            Visitar su web
            <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
          </a>
        ) : null}
        <div className="mt-3">
          <ShareLink unitId={unitId} />
        </div>
      </div>
    </aside>
  );
}
