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

// ── Calendar month arithmetic (Fase 4 audit fix F1) ─────────────────
//
// Pure calendar semantics, no timezone/locale involvement: all arithmetic is
// done on (year, month, day) integers; `Date.UTC` is used ONLY to count days
// in a month, always through UTC accessors — never local time.

function daysInMonth(year: number, month: number): number {
  // month is 1-based; day 0 of next month = last day of this month (UTC).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Add calendar months to a date. Day-of-month is preserved and CLAMPED to the
 * last day of the target month when it does not exist (standard convention):
 *   addMonths(2024-01-31, 1) = 2024-02-29 (leap year)
 *   addMonths(2023-01-31, 1) = 2023-02-28
 *   addMonths(2024-02-29, 12) = 2025-02-28
 *   addMonths(2024-01-15, 24) = 2026-01-15 (exact anniversary)
 */
export function isoDateAddMonths(a: IsoDate, months: number): IsoDate {
  const [y, m, d] = a.split("-").map(Number) as [number, number, number];
  const totalMonths = y * 12 + (m - 1) + months;
  const ny = Math.floor(totalMonths / 12);
  const nm = (((totalMonths % 12) + 12) % 12) + 1;
  const nd = Math.min(d, daysInMonth(ny, nm));
  return `${ny}-${pad2(nm)}-${pad2(nd)}` as IsoDate;
}

/** Add calendar days (UTC-only arithmetic, no DST/local-time involvement). */
export function isoDateAddDays(a: IsoDate, days: number): IsoDate {
  const ms = Date.parse(`${a}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10) as IsoDate;
}
