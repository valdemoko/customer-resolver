"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import type { Attribution } from "@/lib/cities/schema";

/**
 * Atribuciones legales detrás de un icono «i» discreto.
 *
 * No hay pie visible, pero tampoco se esconden las atribuciones: las licencias
 * (ODbL de OpenStreetMap, INSPIRE del Catastro) las exigen y aquí están a un
 * clic, con el detalle completo en `/atribuciones`.
 */
export function AttributionButton({ attributions }: { attributions: Attribution[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      // En móvil arriba a la izquierda, bajo el botón de vuelta: la hoja inferior
      // de la ficha ocupa la esquina de abajo y taparía el icono.
      className="absolute left-3 top-14 z-30 flex flex-col-reverse items-start gap-2 sm:bottom-3 sm:left-auto sm:right-3 sm:top-auto sm:flex-col sm:items-end"
    >
      {open ? (
        <div
          role="dialog"
          aria-label="Atribuciones"
          className="w-[min(19rem,calc(100vw-1.5rem))] rounded-md border border-line bg-surface/97 p-3 text-xs text-muted shadow-[var(--shadow-float)]"
        >
          <p className="font-medium text-ink">Atribuciones</p>
          <ul className="mt-2 space-y-1">
            {attributions.map((attribution) => (
              <li key={attribution.label}>
                <a
                  href={attribution.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-ink"
                >
                  {attribution.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            href="/atribuciones"
            className="mt-2 inline-block underline underline-offset-2 hover:text-ink"
          >
            Fuentes y licencias en detalle
          </Link>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Atribuciones y fuentes"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface/92 text-muted shadow-[var(--shadow-float)] hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Info size={15} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
