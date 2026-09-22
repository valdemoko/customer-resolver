/**
 * Turn a case's confirmed facts into readable answers for the report.
 *
 * Why: the exported report listed conclusions but not the data behind them, so it
 * could not be checked against reality ("did I really say 10 August?"). This
 * builds that section — only from facts already stored in the case.
 *
 * Two hard rules:
 *  - A fact is only listed when its human name is known. Printing the raw key
 *    (`payer.charge_amount`) would be worse than omitting it.
 *  - Values are formatted for reading, never re-interpreted: booleans become
 *    Sí/No, ISO dates become dd/mm/yyyy, money becomes "249,90 €".
 *
 * PURE: no I/O, no clock, no locale surprises (es-ES formats, fixed).
 */
import type { ExportAnswer } from "./types";
import { DERIVED_FACT_HINTS } from "../result/fact-labels";

/** The subset of a stored fact this module needs. */
export interface AnswerSourceFact {
  readonly key: string;
  readonly value: unknown;
  readonly status?: string;
  readonly provenance?: string;
  readonly confidence?: string;
}

export interface AnswerLabels {
  /** Question text per fact key (what the user was asked). */
  readonly questions: Readonly<Record<string, string>>;
  /** Catalogue description per fact key. */
  readonly factLabels: Readonly<Record<string, string>>;
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
};

/** dd/mm/yyyy from an ISO date, or null when it is not a valid date. */
export function formatIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Long Spanish date, used where reading it matters more than compactness. */
export function formatIsoDateLong(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  const monthName = MONTHS[month - 1];
  if (!monthName) return null;
  return `${Number(match[3])} de ${monthName} de ${match[1]}`;
}

function formatMoney(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as { amountMinor?: unknown; currency?: unknown };
  if (typeof record.amountMinor !== "number") return null;
  const currency = typeof record.currency === "string" ? record.currency : "EUR";
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  const amount = (record.amountMinor / 100).toFixed(2).replace(".", ",");
  return `${amount} ${symbol}`;
}

/**
 * A stored FactValue (or a primitive) rendered for a human reader.
 * Returns null when there is nothing worth printing.
 */
export function formatFactValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (typeof value === "object" && "type" in (value as Record<string, unknown>)) {
    const wrapped = value as { type: string; value: unknown };
    switch (wrapped.type) {
      case "money":
        return formatMoney(wrapped.value);
      case "date":
        return formatIsoDate(wrapped.value) ?? formatFactValue(wrapped.value);
      case "datetime":
        return formatIsoDate(wrapped.value);
      case "boolean":
        return wrapped.value === true ? "Sí" : wrapped.value === false ? "No" : null;
      case "number":
        return typeof wrapped.value === "number"
          ? String(wrapped.value).replace(".", ",")
          : formatFactValue(wrapped.value);
      case "enum":
      case "string":
        return formatFactValue(wrapped.value);
      default:
        return formatFactValue(wrapped.value);
    }
  }

  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return String(value).replace(".", ",");
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    return formatIsoDate(trimmed) ?? trimmed;
  }
  return null;
}

/** The human name of a fact, or null when we cannot name it honestly. */
export function factDisplayLabel(key: string, labels: AnswerLabels): string | null {
  return labels.questions[key] ?? labels.factLabels[key] ?? DERIVED_FACT_HINTS[key] ?? null;
}

function originOf(fact: AnswerSourceFact): ExportAnswer["origin"] {
  if (fact.provenance === "DERIVED" || fact.provenance === "SYSTEM") return "DERIVED";
  if (fact.provenance === "DOCUMENT_EXTRACTED" || fact.confidence === "OCR") return "DOCUMENT";
  return "USER";
}

/**
 * Build the answers section: confirmed facts, in the order they were stored,
 * each with its human name and a readable value.
 */
export function buildExportAnswers(
  facts: readonly AnswerSourceFact[],
  labels: AnswerLabels,
): readonly ExportAnswer[] {
  const answers: ExportAnswer[] = [];
  const seen = new Set<string>();

  for (const fact of facts) {
    if (fact.status !== undefined && fact.status !== "CONFIRMED") continue;
    if (seen.has(fact.key)) continue;

    const label = factDisplayLabel(fact.key, labels);
    if (label === null) continue;

    const value = formatFactValue(fact.value);
    if (value === null) continue;

    seen.add(fact.key);
    answers.push({ label, value, origin: originOf(fact) });
  }

  return answers;
}
