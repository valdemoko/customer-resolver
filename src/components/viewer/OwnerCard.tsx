"use client";

import { ExternalLink } from "lucide-react";
import type { UnitView } from "@/lib/market/types";
import { imageUrl } from "@/lib/scene/ads";

/**
 * El cartel de quien ha comprado el espacio: logotipo, nombre, descripción y
 * enlace. Es lo que se ve al pulsar una unidad comprada.
 */
export function OwnerCard({ unitId, view }: { unitId: string; view: UnitView }) {
  const owner = view.owner;
  if (!owner) return null;
  const version = `${view.purchases}`;
  const since = owner.since ? new Date(owner.since).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "";
  return (
    <article className="owner-card relative mt-3 overflow-hidden rounded-md border border-accent/40 bg-accent-soft/60 p-3">
      <div className="flex items-start gap-3">
        {owner.hasLogo ? (
          // Imagen del comprador, reducida en su navegador: no hay optimizador porque es un data URL propio.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl(unitId, "logo", version)}
            alt={`Logotipo de ${owner.name}`}
            width={56}
            height={56}
            className="h-14 w-14 shrink-0 rounded-sm border border-line bg-surface object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <p className="display-face truncate text-lg font-semibold leading-tight text-ink">{owner.name}</p>
          {since ? <p className="text-xs text-muted">Anunciante desde el {since}</p> : null}
        </div>
      </div>
      {owner.description ? <p className="mt-2 whitespace-pre-line text-sm text-ink">{owner.description}</p> : null}
      {owner.url ? (
        <a
          href={owner.url}
          target="_blank"
          rel="noopener noreferrer nofollow sponsored"
          className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-accent/50 bg-surface px-2.5 py-1.5 text-sm font-medium text-accent-ink hover:bg-accent-soft"
        >
          Visitar su web
          <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
        </a>
      ) : null}
    </article>
  );
}
