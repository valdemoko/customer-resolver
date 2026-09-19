/**
 * Date utilities (Phase 0: foundational shared kernel).
 *
 * Pure, deterministic, timezone-explicit where it matters. Dates are handled as
 * calendar dates (ISO YYYY-MM-DD) for legal deadlines; instants use Date+timezone
 * only when needed later. No I/O, no framework deps — pure core.
 */

/** Parse an ISO calendar date (YYYY-MM-DD). Throws on invalid input. */
export function parseIsoDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`Invalid ISO date: ${iso}`);
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new RangeError(`Invalid ISO date: ${iso}`);
  }
  return date;
}

/** Whole calendar days from `a` to `b` (positive if b is after a), both UTC midnight. */
export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

export function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

export function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}
