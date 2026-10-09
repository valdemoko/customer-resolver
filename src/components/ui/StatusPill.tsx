import type { CityStatus } from "@/lib/cities/schema";
import { cn } from "@/lib/cn";

/**
 * Estado de una ciudad o de una parcela.
 *
 * Accesibilidad (WCAG 1.4.1): cada estado combina color + FORMA + texto. Nunca
 * se depende solo del color.
 *
 * Las formas se dibujan con SVG en línea y no con caracteres Unicode: los
 * glifos como ◐ o ● no existen en todas las fuentes del sistema y aparecían
 * como cajas. La misma construcción se reutiliza en el mapa para las parcelas.
 */
type Tone = CityStatus;

const styles: Record<Tone, { label: string; className: string }> = {
  available: {
    label: "Disponible",
    className: "border-available/35 bg-available-soft text-available",
  },
  in_preparation: {
    label: "En preparación",
    className: "border-premium/35 bg-premium-soft text-premium",
  },
  unavailable: {
    label: "No disponible",
    className: "border-line-strong bg-occupied-soft text-occupied",
  },
};

/** Forma distintiva por estado: círculo lleno, semicírculo y anillo vacío. */
export function StatusGlyph({
  status,
  size = 10,
  className,
}: {
  status: Tone;
  size?: number;
  className?: string;
}) {
  const filled = status === "available";
  const half = status === "in_preparation";

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 10 10"
      className={cn("shrink-0", className)}
    >
      <circle cx="5" cy="5" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {filled ? <circle cx="5" cy="5" r="4.1" fill="currentColor" /> : null}
      {half ? <path d="M5 0.9 A4.1 4.1 0 0 0 5 9.1 Z" fill="currentColor" /> : null}
    </svg>
  );
}

export function StatusPill({
  status,
  label,
  className,
}: {
  status: Tone;
  label?: string;
  className?: string;
}) {
  const style = styles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-[3px] text-xs font-medium",
        style.className,
        className,
      )}
    >
      <StatusGlyph status={status} />
      {label ?? style.label}
    </span>
  );
}

/** Etiquetas reutilizables en el HTML accesible del visor. */
export const statusLabels: Record<Tone, string> = {
  available: styles.available.label,
  in_preparation: styles.in_preparation.label,
  unavailable: styles.unavailable.label,
};
