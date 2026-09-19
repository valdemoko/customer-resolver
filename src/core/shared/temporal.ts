/**
 * Temporal primitives (Fase 1).
 *
 * Hard separation (docs prompt §13, ARCHITECTURE.md §4):
 *  - IsoDate     "YYYY-MM-DD"             → calendar date (contract dates, deadlines). No time, no zone.
 *  - IsoDateTime "YYYY-MM-DDTHH:mm:ss.sssZ" → absolute instant (events, audit timestamps).
 *
 * A contract date 2026-09-10 is NOT the same fact as 2026-09-10T00:00:00Z.
 * These types never convert between representations silently.
 */
import { parseIsoDate } from "./dates";

export type IsoDate = string & { readonly __brand: "IsoDate" };
export type IsoDateTime = string & { readonly __brand: "IsoDateTime" };

function assertIsoDate(value: string): IsoDate {
  try {
    parseIsoDate(value);
  } catch {
    throw new RangeError(`Invalid IsoDate: ${value}`);
  }
  return value as IsoDate;
}

function assertIsoDateTime(value: string): IsoDateTime {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value)) {
    throw new RangeError(`IsoDateTime must be UTC ISO instant (…Z), got: ${value}`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new RangeError(`Invalid IsoDateTime: ${value}`);
  }
  return value as IsoDateTime;
}

/** Parse and validate an IsoDate from untrusted string input. */
export function isoDate(value: string): IsoDate {
  return assertIsoDate(value);
}

/** Parse and validate an IsoDateTime (UTC instant) from untrusted string input. */
export function isoDateTime(value: string): IsoDateTime {
  return assertIsoDateTime(value);
}

/** Type guard: is this string a valid IsoDate? */
export function isIsoDate(value: string): value is IsoDate {
  try {
    assertIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

/** Type guard: is this string a valid IsoDateTime? */
export function isIsoDateTime(value: string): value is IsoDateTime {
  try {
    assertIsoDateTime(value);
    return true;
  } catch {
    return false;
  }
}

/** Current instant (injection point for tests — keep domain deterministic). */
export function now(): IsoDateTime {
  return new Date().toISOString() as IsoDateTime;
}

/** Whole-day difference between two calendar dates (b − a). */
export function isoDateDaysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
