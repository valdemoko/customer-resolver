"use client";

import { useEffect, useRef, useState } from "react";
import { formatCents } from "@/lib/money";

/**
 * Cifra que sube hasta su valor al entrar en pantalla. Con «reducir movimiento»
 * (o sin IntersectionObserver) muestra el valor final directamente. El texto
 * accesible es siempre el valor final.
 */
export function CountUp({
  value,
  unit = "number",
  durationMs = 1100,
}: {
  value: number;
  /** `eur`: el valor son céntimos. Se pasa un nombre y no una función: este componente se usa desde servidor. */
  unit?: "number" | "eur";
  durationMs?: number;
}) {
  const format = (n: number) => (unit === "eur" ? formatCents(n) : n.toLocaleString("es-ES"));
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const node = ref.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!node || reduce || typeof IntersectionObserver === "undefined" || value === 0) {
      setShown(value);
      return;
    }
    setShown(0);
    let frame = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          // `now` (marca del fotograma) puede ser anterior a `start`: sin el máximo la cifra salía negativa.
          const t = Math.min(1, Math.max(0, (now - start) / durationMs));
          setShown(Math.round(value * (1 - (1 - t) ** 3)));
          if (t < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className="tnum">
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
