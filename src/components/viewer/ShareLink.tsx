"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { postShare } from "@/lib/market/share-client";

/** Copia el enlace directo a un espacio (`?unit=…`): quien lo abra llega con la cámara ya sobre él. */
export function ShareLink({
  unitId,
  className = "",
  href,
  label = "Copiar enlace",
  copiedLabel = "Enlace copiado",
  track,
}: {
  readonly unitId: string;
  readonly className?: string;
  /** Enlace ya construido (por ejemplo, el privado de edición). Por defecto, el directo al espacio. */
  readonly href?: string;
  readonly label?: string;
  readonly copiedLabel?: string;
  /** Si se da, copiar el enlace suma un punto de compartido al anuncio (el servidor descarta al dueño). */
  readonly track?: { readonly token?: string | null; readonly onShares?: (shares: number) => void };
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
    let done = true;
    try {
      await navigator.clipboard.writeText(target);
    } catch {
      window.prompt("Copia el enlace:", target);
      done = false;
    }
    // Quien ha pedido el enlace lo va a mandar, se haya copiado solo o a mano.
    if (track) void postShare(unitId, track.token).then((result) => result && track.onShares?.(result.shares));
    if (!done) return;
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
