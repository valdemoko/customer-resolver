"use client";

import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Carcasa de la ficha inferior izquierda: el ÚNICO elemento de texto sobre el
 * mapa. La comparten la ficha de un edificio y la de un local.
 *
 * Va abajo a la izquierda y deja libre el centro de la pantalla, que es donde
 * está la ciudad. En móvil pasa a ser una hoja inferior arrastrable: se puede
 * recoger para ver más ciudad (solo asoma el título) y desplegar para leer.
 */
export function PanelShell({
  ariaLabel,
  title,
  badge,
  onClose,
  children,
}: {
  ariaLabel: string;
  title: string;
  badge?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Hoja móvil: altura en píxeles mientras se arrastra, o `null` en reposo.
  const [expanded, setExpanded] = useState(true);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);

  const onHandleDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startHeight: sheet.offsetHeight, moved: false };
  }, []);

  const onHandleMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const state = drag.current;
    if (!state) return;
    const delta = state.startY - event.clientY;
    if (Math.abs(delta) > 4) state.moved = true;
    const max = Math.round(window.innerHeight * 0.62);
    setDragHeight(Math.min(max, Math.max(84, state.startHeight + delta)));
  }, []);

  const onHandleUp = useCallback(() => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    const max = Math.round(window.innerHeight * 0.62);
    if (!state.moved) {
      setExpanded((value) => !value);
    } else if (dragHeight !== null) {
      setExpanded(dragHeight > (84 + max) / 2);
    }
    setDragHeight(null);
  }, [dragHeight]);

  return (
    <aside
      ref={sheetRef}
      aria-live="polite"
      aria-label={ariaLabel}
      style={dragHeight !== null ? { height: dragHeight } : undefined}
      className={cn(
        "absolute z-20 overflow-hidden border border-line-strong bg-surface/92 shadow-[var(--shadow-float)] backdrop-blur-md",
        // Móvil: hoja inferior a lo ancho. Escritorio: tarjeta abajo a la izquierda.
        "inset-x-0 bottom-0 rounded-t-3xl",
        dragHeight === null && (expanded ? "max-h-[62%]" : "max-h-[84px]"),
        dragHeight === null && "transition-[max-height] duration-200 motion-reduce:transition-none",
        "sm:inset-x-auto sm:bottom-4 sm:left-4 sm:max-h-[70%] sm:w-[22rem] sm:rounded-3xl",
      )}
    >
      <button
        type="button"
        aria-label={expanded ? "Recoger la ficha" : "Desplegar la ficha"}
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        className="flex h-5 w-full touch-none items-center justify-center sm:hidden"
      >
        <span aria-hidden="true" className="h-1 w-9 rounded-full bg-line-strong" />
      </button>

      <div className="max-h-[inherit] overflow-auto p-5 pt-1 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="display-face text-xl font-medium leading-tight tracking-[-0.02em] text-ink">{title}</h2>
            {badge}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar la ficha"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </aside>
  );
}

export function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={cn("text-right text-ink", mono && "tnum font-mono text-xs")}>{value}</dd>
    </div>
  );
}
