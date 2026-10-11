"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

/**
 * Círculo con un ojo y el número de personas que han visto la web (el total del panel de administración).
 * Arriba en el centro del visor. Si no se puede leer el dato, no se enseña nada: ni ceros ni guiones.
 */
export function VisitorCount() {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/visits")
        .then((response) => (response.ok ? (response.json() as Promise<{ total: number | null }>) : null))
        .then((data) => {
          if (alive && data && typeof data.total === "number") setTotal(data.total);
        })
        .catch(() => undefined);
    void load();
    // Se actualiza con el visor abierto, sin recargar.
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 120_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  if (total === null) return null;
  const label = `${total.toLocaleString("es-ES")} ${total === 1 ? "persona ha visto" : "personas han visto"} este mapa`;
  return (
    <div
      role="status"
      title={label}
      aria-label={label}
      className="pointer-events-auto absolute left-1/2 top-3 z-20 hidden h-10 sm:flex -translate-x-1/2 items-center gap-2 rounded-full border border-line-strong bg-surface/85 pl-1.5 pr-4 text-sm text-ink shadow-[var(--shadow-float)] backdrop-blur-md"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-accent-ink" aria-hidden="true">
        <Eye size={15} strokeWidth={1.9} />
      </span>
      <span className="tnum font-medium">{total.toLocaleString("es-ES")}</span>
    </div>
  );
}
