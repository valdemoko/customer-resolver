/**
 * Money value object (Phase 0: foundational shared kernel).
 *
 * Deterministic decimal arithmetic on integer minor units (cents).
 * No floats, no external dependencies, no I/O — pure core, per ARCHITECTURE.md §4.
 * Currency is carried explicitly (i18n/jurisdiction formats it for display later).
 */

export interface Money {
  readonly amountMinor: number; // integer minor units (e.g. cents)
  readonly currency: string; // ISO 4217 (e.g. "EUR")
}

export function money(amountMinor: number, currency: string): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new RangeError(
      `Money amount must be an integer number of minor units, got ${amountMinor}`,
    );
  }
  if (currency.length !== 3 || currency !== currency.toUpperCase()) {
    throw new RangeError(`Currency must be a 3-letter ISO 4217 code, got ${currency}`);
  }
  return { amountMinor, currency };
}

export function add(a: Money, b: Money): Money {
  requireSameCurrency(a, b);
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  requireSameCurrency(a, b);
  return { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency };
}

export function isNegative(m: Money): boolean {
  return m.amountMinor < 0;
}

export function compareTo(a: Money, b: Money): number {
  requireSameCurrency(a, b);
  return a.amountMinor - b.amountMinor;
}

function requireSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new RangeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
