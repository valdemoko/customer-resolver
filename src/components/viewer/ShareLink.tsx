"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Copia el enlace directo a un espacio (`?unit=…`): quien lo abra llega con la cámara ya sobre él. */
export function ShareLink({
  unitId,
  className = "",
  href,
  label = "Copiar enlace",
  copiedLabel = "Enlace copiado",
}: {
  readonly unitId: string;
  readonly className?: string;
  /** Enlace ya construido (por ejemplo, el privado de edición). Por defecto, el directo al espacio. */
  readonly href?: string;
  readonly label?: string;
  readonly copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    let target = href;
    if (!target) {
      const url = new URL(window.location.href);
      url.search = "";
      url.hash = "";
      url.searchParams.set("unit", unitId);
      target = url.toString();
    }
    try {
      await navigator.clipboard.writeText(target);
    } catch {
      window.prompt("Copia el enlace:", target);
      return;
    }
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`inline-flex h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-accent/60 hover:text-accent-ink ${className}`}
    >
      {copied ? <Check size={14} strokeWidth={2.2} aria-hidden="true" /> : <Link2 size={14} strokeWidth={2} aria-hidden="true" />}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}
