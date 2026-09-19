/**
 * FactValue equality/conflict semantics (Fase 1).
 * Type-aware comparison — never raw string comparison (fragile for dates/money).
 */
import type { FactValue } from "../types";
import { isoDateDaysBetween } from "../shared/temporal";

/** Structural equality within the same value type. */
export function valuesEqual(a: FactValue, b: FactValue): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "string":
      return a.value === (b as typeof a).value;
    case "number":
      return a.value === (b as typeof a).value;
    case "boolean":
      return a.value === (b as typeof a).value;
    case "date":
      return a.value === (b as typeof a).value; // ISO calendar string equality
    case "datetime":
      return a.value === (b as typeof a).value;
    case "money":
      return (
        a.value.amountMinor === (b as typeof a).value.amountMinor &&
        a.value.currency === (b as typeof a).value.currency
      );
    case "enum":
      return a.value === (b as typeof a).value;
    case "object":
      return JSON.stringify(a.value) === JSON.stringify((b as typeof a).value);
  }
}

/** Semantic distance for dates (days apart) when callers need graded conflict info. */
export function dateDistanceDays(a: FactValue, b: FactValue): number | undefined {
  if (a.type !== "date" || b.type !== "date") return undefined;
  return isoDateDaysBetween(a.value, b.value);
}

/** Two facts conflict when they are comparable and not equal. */
export function valuesConflict(a: FactValue, b: FactValue): boolean {
  if (a.type !== b.type) return true; // type mismatch is itself a conflict
  return !valuesEqual(a, b);
}
