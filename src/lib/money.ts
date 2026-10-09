/**
 * Dinero. Regla absoluta: TODO importe se representa como entero de céntimos.
 * Nunca floats. Este módulo es la única puerta de entrada al cálculo de precios
 * y está cubierto por tests (src/lib/money.test.ts).
 */

const ESCALATION_NUMERATOR = 125; // +25 %
const ESCALATION_DENOMINATOR = 100;

export class MoneyError extends Error {
  override name = "MoneyError";
}

function assertIntegerCents(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} debe ser un entero de céntimos, recibido: ${value}`);
  }
  if (value < 0) {
    throw new MoneyError(`${label} no puede ser negativo, recibido: ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} excede el rango entero seguro: ${value}`);
  }
}

/**
 * División entera con redondeo half-up (0.5 siempre hacia arriba).
 * Se implementa con aritmética entera para no depender de la representación
 * en coma flotante: round_half_up(a / b) === floor((a + b/2) / b) con b par.
 */
export function roundHalfUpDiv(numerator: number, denominator: number): number {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new MoneyError("roundHalfUpDiv solo acepta enteros");
  }
  if (denominator <= 0) {
    throw new MoneyError("El denominador debe ser positivo");
  }
  if (denominator % 2 !== 0) {
    throw new MoneyError("El denominador debe ser par para un redondeo half-up exacto");
  }
  return Math.floor((numerator + denominator / 2) / denominator);
}

/**
 * Precio del siguiente propietario de una misma parcela.
 *
 *     siguiente = max(round_half_up(actual × 125 / 100), actual + 1)
 *
 * Serie canónica: 100 → 125 → 156 → 195 → 244 …
 *
 * Por qué el mínimo de +1 céntimo: para importes muy bajos el redondeo
 * devolvería el mismo valor (1 × 125 / 100 = 1,25 → 1), y entonces revender una
 * ubicación costaría lo mismo que tenerla, lo que rompe la regla de negocio y
 * permitiría bloquear el precio indefinidamente. El suelo garantiza que el
 * precio siempre sube al menos un céntimo. En el rango de precios real el
 * término dominante es el 25 %.
 */
export function nextPriceCents(currentCents: number): number {
  assertIntegerCents(currentCents, "currentCents");
  if (currentCents === 0) {
    throw new MoneyError("No se puede escalar un precio de 0 céntimos");
  }
  const escalated = roundHalfUpDiv(
    currentCents * ESCALATION_NUMERATOR,
    ESCALATION_DENOMINATOR,
  );
  return Math.max(escalated, currentCents + 1);
}

/**
 * Secuencia de precios desde el precio base hasta `count` reventas.
 * Devuelve una lista con el precio inicial incluido: [base, next(base), ...]
 */
export function priceLadderCents(baseCents: number, count: number): number[] {
  assertIntegerCents(baseCents, "baseCents");
  if (!Number.isInteger(count) || count < 1) {
    throw new MoneyError("count debe ser un entero >= 1");
  }
  const ladder: number[] = [baseCents];
  let current = baseCents;
  for (let i = 1; i < count; i += 1) {
    current = nextPriceCents(current);
    ladder.push(current);
  }
  return ladder;
}

/** Suma de una lista de importes, garantizando que el resultado es entero. */
export function sumCents(values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    assertIntegerCents(value, "importe");
    total += value;
  }
  assertIntegerCents(total, "total");
  return total;
}

/**
 * Formato de presentación. El símbolo y el separador dependen del idioma del
 * usuario, pero el valor subyacente siempre es el entero de céntimos.
 */
export function formatCents(cents: number, locale = "es-ES", currency = "EUR"): string {
  assertIntegerCents(cents, "cents");
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Céntimos → cadena decimal canónica con 2 decimales, sin símbolo. */
export function centsToDecimalString(cents: number): string {
  assertIntegerCents(cents, "cents");
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

/**
 * Comisión de Stripe sobre un importe en céntimos, con la tarifa estándar del
 * Espacio Económico Europeo para tarjetas europeas:
 * 1,5 % + 0,25 € por transacción (consultar la tarifa vigente en el panel).
 * Se usa para el informe de viabilidad de precios, NO para cobrar.
 */
export function stripeFeeCents(
  amountCents: number,
  percentageBps = 150,
  fixedCents = 25,
): number {
  assertIntegerCents(amountCents, "amountCents");
  return roundHalfUpDiv(amountCents * percentageBps, 10_000) + fixedCents;
}
