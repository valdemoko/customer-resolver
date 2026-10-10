"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Poll = { options: Array<{ id: string; label: string; votes: number }>; total: number; mine: string | null };

/**
 * Encuesta de la próxima ciudad. Se vota con un clic y se puede cambiar el voto; los resultados se
 * ven siempre, con barras que se llenan en proporción al total. Quien tenga sesión vota con su
 * cuenta y el resto con una cookie aleatoria: una persona, un voto.
 */
export function CityPoll() {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/poll", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setPoll((await response.json()) as Poll);
      setError(null);
    } catch {
      setError("No se pudo cargar la encuesta. Recarga la página en unos segundos.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function vote(optionId: string) {
    if (pending || poll?.mine === optionId) return;
    setPending(optionId);
    setError(null);
    try {
      const response = await fetch("/api/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });
      const data = (await response.json()) as Poll & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo registrar el voto.");
      setPoll(data);
      const chosen = data.options.find((option) => option.id === optionId);
      setAnnounce(`Voto registrado: ${chosen?.label ?? ""}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo registrar el voto.");
    } finally {
      setPending(null);
    }
  }

  const total = poll?.total ?? 0;
  const top = poll ? Math.max(1, ...poll.options.map((option) => option.votes)) : 1;

  return (
    <div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {poll
          ? poll.options.map((option) => {
              const mine = poll.mine === option.id;
              const share = total > 0 ? Math.round((option.votes / total) * 100) : 0;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => void vote(option.id)}
                  disabled={pending !== null}
                  aria-pressed={mine}
                  className={cn(
                    "group relative flex h-16 items-center gap-3 overflow-hidden rounded-2xl border px-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    mine ? "border-accent/70 bg-accent/10" : "border-line-strong bg-surface/60 hover:border-accent/50",
                    pending === option.id ? "opacity-70" : "",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn("absolute inset-y-0 left-0 transition-[width] duration-700 ease-out", mine ? "bg-accent/20" : "bg-sunken/70")}
                    style={{ width: `${total > 0 ? Math.max(3, (option.votes / top) * 100) : 0}%` }}
                  />
                  <span className="relative flex min-w-0 flex-1 items-center gap-2.5">
                    <span className="truncate text-base font-medium text-ink">{option.label}</span>
                    {mine ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-on-accent">
                        <Check size={12} strokeWidth={2.6} aria-hidden="true" />
                        Tu voto
                      </span>
                    ) : null}
                  </span>
                  <span className="relative tnum font-mono text-sm text-muted">
                    {total > 0 ? `${share} %` : ""}
                    <span className="sr-only">{`${option.votes} ${option.votes === 1 ? "voto" : "votos"}`}</span>
                  </span>
                </button>
              );
            })
          : Array.from({ length: 6 }, (_, i) => <div key={i} aria-hidden="true" className="h-16 animate-pulse rounded-2xl border border-line bg-sunken/40" />)}
      </div>
      <p className="mt-4 text-sm text-muted" aria-live="polite">
        {error ? <span className="text-danger">{error}</span> : poll ? (total === 0 ? "Todavía no hay votos: sé la primera persona en votar." : `${total.toLocaleString("es-ES")} ${total === 1 ? "voto" : "votos"}. Puedes cambiar el tuyo cuando quieras.`) : "Cargando…"}
      </p>
      <p className="sr-only" role="status">
        {announce}
      </p>
    </div>
  );
}
