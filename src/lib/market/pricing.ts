import { nextPriceCents } from "@/lib/money";
import { BASE_PRICE_CENTS } from "./types";

/**
 * Precio de la próxima compra de una unidad que ya se ha comprado `purchases`
 * veces: 1,00 € → 1,25 € → 1,56 € → 1,95 € → 2,44 €… (+25 % incremental, la
 * serie canónica de `money.ts`). Se calcula SOLO en el servidor.
 */
/** Tope de Stripe para un cobro en euros (999.999,99 €). */
export const MAX_PRICE_CENTS = 99_999_999;

const ladder: number[] = [BASE_PRICE_CENTS];

export function priceForPurchases(purchases: number): number {
  if (!Number.isInteger(purchases) || purchases < 0) throw new Error("purchases debe ser un entero ≥ 0");
  // Una cifra absurda no debe colgar el servidor.
  const capped = Math.min(purchases, 400);
  while (ladder.length <= capped) {
    const last = ladder[ladder.length - 1] ?? BASE_PRICE_CENTS;
    // Stripe no admite más de 999.999,99 €: el precio se queda en el tope.
    ladder.push(last >= MAX_PRICE_CENTS ? MAX_PRICE_CENTS : Math.min(nextPriceCents(last), MAX_PRICE_CENTS));
  }
  return ladder[capped] ?? BASE_PRICE_CENTS;
}
