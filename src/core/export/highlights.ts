/**
 * Key figures of a case: the amounts and dates the whole claim turns on.
 *
 * Why: the report listed every answer in the order it was stored, so the number
 * the person is actually claiming (and the dates the deadlines are computed
 * from) were buried among the yes/no answers. This extracts exactly those, in
 * reading order (importes → fechas → cantidades), so the first thing the person
 * sees is the case in numbers.
 *
 * Only facts the case already has, only with a human name: never a raw key,
 * never a value the analysis invented.
 *
 * PURE: no I/O, no clock.
 */
import {
  factDisplayLabel,
  formatFactValue,
  type AnswerLabels,
  type AnswerSourceFact,
} from "./answers";

export interface CaseHighlight {
  /** Human name of the fact (a question or the catalogue description). */
  readonly label: string;
  /** Formatted value ("249,90 €", "10/08/2026"). */
  readonly value: string;
  readonly kind: "money" | "date" | "number";
  /** Fact it came from (for tests and future linking). */
  readonly factKey: string;
}

function kindOf(value: unknown): CaseHighlight["kind"] | null {
  if (typeof value !== "object" || value === null) return null;
  const wrapped = value as { type?: unknown };
  if (wrapped.type === "money") return "money";
  if (wrapped.type === "date" || wrapped.type === "datetime") return "date";
  if (wrapped.type === "number") return "number";
  return null;
}

const ORDER: Readonly<Record<CaseHighlight["kind"], number>> = {
  money: 0,
  date: 1,
  number: 2,
};

/**
 * Amounts and dates of a case, ready to render. Facts appear in the order the
 * kinds matter to the reader, then in storage order (stable, deterministic).
 */
export function buildCaseHighlights(
  facts: readonly AnswerSourceFact[],
  labels: AnswerLabels,
): readonly CaseHighlight[] {
  const highlights: CaseHighlight[] = [];
  const seen = new Set<string>();

  for (const fact of facts) {
    if (fact.status !== undefined && fact.status !== "CONFIRMED") continue;
    if (seen.has(fact.key)) continue;

    const kind = kindOf(fact.value);
    if (!kind) continue;

    const label = factDisplayLabel(fact.key, labels);
    if (label === null) continue;

    const value = formatFactValue(fact.value);
    if (value === null) continue;

    seen.add(fact.key);
    highlights.push({ label, value, kind, factKey: fact.key });
  }

  return highlights.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}
