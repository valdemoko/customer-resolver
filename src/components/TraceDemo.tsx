/**
 * TraceDemo — how a conclusion is reached, from the real rule set.
 *
 * Renders the chain the product is built on, using only data that already
 * exists in the modules:
 *
 *   SITUACIÓN (ejemplo) → HECHO que lee la regla → REGLA → FUENTE oficial (artículo)
 *   → CONCLUSIÓN del ejemplo
 *
 * It is a server component: nothing here ships to the browser beyond the markup.
 * No amount, deadline or article is written in this file.
 */
import type { ProblemTrace } from "@/lib/trace";

interface TraceDemoProps {
  readonly trace: ProblemTrace;
  /** Illustrative situation (from the catalogue). */
  readonly scenario: string;
  /** Lines the analysis would return for that situation (from the catalogue). */
  readonly outcome: readonly string[];
  /** `compact` drops the per-rule source text blocks (used on /como-funciona). */
  readonly variant?: "full" | "compact";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

export function TraceDemo({ trace, scenario, outcome, variant = "full" }: TraceDemoProps) {
  const label = (
    <p className="text-[10px] font-medium tracking-wider uppercase text-[var(--color-ink-faint)] mb-2">
      Ejemplo ilustrativo
    </p>
  );

  return (
    <div className="border border-[var(--border-light)] bg-[var(--surface-warm)]">
      {/* Header + disclaimer */}
      <div className="p-5 border-b border-[var(--border-light)]">
        {label}
        <p className="text-sm text-[var(--color-ink-soft)] leading-relaxed">{scenario}</p>
        <p className="text-xs text-[var(--color-ink-muted)] mt-3 leading-relaxed">
          Ejemplo ilustrativo de cómo trabaja el análisis. No es un caso real ni asesoramiento
          jurídico, y no describe la situación de ninguna persona concreta.
        </p>
      </div>

      {/* The chain: hecho → regla → fuente */}
      <div className="p-5 space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-ink-faint)]">
          {["Hecho", "Regla", "Artículo", "Fuente", "Conclusión"].map((step, index) => (
            <span key={step} className="flex items-center gap-2">
              <span className="px-2 py-0.5 border border-[var(--border-light)] bg-[var(--surface-paper)]">
                {step}
              </span>
              {index < 4 && <span aria-hidden="true">→</span>}
            </span>
          ))}
        </div>

        {trace.rules.map((rule, ruleIndex) => (
          <div
            key={rule.key}
            className="border border-[var(--border-light)] bg-[var(--surface-paper)] p-4"
          >
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-xs text-[var(--color-ink-faint)] tabular-nums">
                {String(ruleIndex + 1).padStart(2, "0")}
              </span>
              <h3 className="text-sm font-semibold text-[var(--color-ink)] leading-snug">
                {rule.title}
              </h3>
            </div>

            {/* Facts the rule reads — the inputs the questionnaire collects. */}
            <p className="text-[10px] font-medium tracking-wider uppercase text-[var(--color-ink-faint)] mb-2">
              Hechos que lee esta regla
            </p>
            <ul className="flex flex-wrap gap-1.5 mb-3">
              {rule.facts.map((fact) => (
                <li
                  key={fact.key}
                  title={fact.key}
                  className="text-[11px] px-2 py-0.5 bg-[var(--surface-warm)] border border-[var(--border-light)] text-[var(--color-ink-muted)]"
                >
                  {fact.label}
                  {fact.derived && (
                    <span className="text-[var(--color-ink-faint)]"> · calculado</span>
                  )}
                </li>
              ))}
              {rule.facts.length === 0 && (
                <li className="text-[11px] text-[var(--color-ink-faint)]">
                  Sin hechos: la regla evalúa siempre.
                </li>
              )}
            </ul>

            {/* Official source backing the rule. */}
            <p className="text-[10px] font-medium tracking-wider uppercase text-[var(--color-ink-faint)] mb-2">
              Fuente que cita
            </p>
            <ul className="space-y-2">
              {rule.sources.map((source) => (
                <li key={source.id} className="text-xs text-[var(--color-ink-muted)] leading-relaxed">
                  <span className="text-[var(--color-ink-soft)] font-medium">{source.title}</span>
                  <span className="block text-[var(--color-ink-faint)]">
                    {source.externalId} · {source.versionIdentifier} · consultada el{" "}
                    {formatDate(source.retrievedAt)}
                  </span>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-[var(--color-ink)] transition-colors break-all"
                  >
                    {source.publisher} →
                  </a>
                  {variant === "full" && source.relevantSection && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)] transition-colors">
                        Texto del artículo aplicado por esta regla
                      </summary>
                      <p className="mt-2 text-[11px] text-[var(--color-ink-muted)] leading-relaxed whitespace-pre-line">
                        {source.relevantSection}
                      </p>
                    </details>
                  )}
                </li>
              ))}
              {rule.sources.length === 0 && (
                <li className="text-xs text-[var(--color-ink-faint)]">
                  Sin fuente publicada: la regla no se evalúa.
                </li>
              )}
            </ul>
          </div>
        ))}

        {/* Conclusion of the illustrative case. */}
        <div>
          <p className="text-[10px] font-medium tracking-wider uppercase text-[var(--color-ink-faint)] mb-2">
            Conclusión del ejemplo
          </p>
          <ul className="space-y-2">
            {outcome.map((line) => (
              <li key={line} className="flex items-start gap-3 text-sm">
                <span className="flex-shrink-0 w-1 h-1 rounded-full bg-[var(--color-accent)] mt-2" />
                <span className="text-[var(--color-ink-soft)] leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-[var(--color-ink-faint)] leading-relaxed border-t border-[var(--border-light)] pt-4">
          {trace.rules.length} reglas publicadas · {trace.factCount} hechos distintos ·{" "}
          {trace.sourceCount} fuentes oficiales para este problema. Cada regla solo se publica con
          al menos una fuente verificada.
        </p>
      </div>
    </div>
  );
}
