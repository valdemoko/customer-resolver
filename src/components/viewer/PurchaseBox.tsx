"use client";

import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PURCHASES_DISABLED_LABEL } from "@/lib/purchases-label";
import { formatCents, nextPriceCents } from "@/lib/money";
import type { UnitView } from "@/lib/market/types";
import { lockHour } from "@/lib/market/lock-label";
import { ShareLink } from "./ShareLink";

/**
 * Bloque de compra de la ficha: estado de la unidad, precio y botón. Si ya tiene
 * dueño enseña su cartel completo y deja quedarse con el espacio por el precio
 * siguiente (+25 %).
 */
export function PurchaseBox({
  unitId,
  view,
  purchasesEnabled,
  onBuy,
}: {
  unitId: string;
  view: UnitView;
  purchasesEnabled: boolean;
  onBuy: () => void;
}) {
  const price = formatCents(view.priceCents);
  const following = formatCents(nextPriceCents(view.priceCents));
  const protectedUntil = lockHour(view.lockedUntil);
  return (
    <section aria-label="Compra del espacio publicitario" className="mt-3">
      <div className="price-tag mt-3 flex items-end justify-between gap-3 rounded-2xl border border-line-strong bg-sunken/50 px-4 py-3">
        <div>
          <p className="text-xs text-muted">{view.owned ? "Quedarte con este espacio" : "Disponible"}</p>
          <p className="tnum font-mono text-2xl font-semibold leading-none text-ink">{price}</p>
        </div>
        <p className="max-w-[9.5rem] text-right text-xs leading-snug text-muted">
          {view.purchases === 0
            ? `Primera compra. La siguiente costará ${following}.`
            : `${view.purchases} ${view.purchases === 1 ? "compra" : "compras"}. La siguiente costará ${following}.`}
        </p>
      </div>

      {protectedUntil ? (
        <div role="status" className="mt-3 flex items-start gap-3 rounded-2xl border border-line-strong bg-sunken/50 px-4 py-3">
          <Lock size={16} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0 text-accent-ink" />
          <p className="text-sm text-muted">
            Acaba de comprarse y está protegido: nadie puede quitárselo a su dueño hasta las <span className="tnum font-medium text-ink">{protectedUntil}</span>. Pasada esa hora vuelve a estar disponible.
          </p>
        </div>
      ) : null}
      {protectedUntil ? null : (
      <Button
        variant="primary"
        className="mt-3 h-12 w-full"
        onClick={onBuy}
        disabled={!purchasesEnabled}
        title={purchasesEnabled ? undefined : PURCHASES_DISABLED_LABEL}
      >
        <Sparkles size={16} strokeWidth={2} aria-hidden="true" />
        {purchasesEnabled ? (view.owned ? `Comprarlo por ${price}` : `Comprar por ${price}`) : PURCHASES_DISABLED_LABEL}
      </Button>
      )}
      {purchasesEnabled && !protectedUntil ? (
        <p className="mt-2 text-xs text-muted">
          Compra definitiva, sin devoluciones. Tu espacio queda protegido dos horas.{" "}
          <a href="/legal/pagos-y-devoluciones" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">Más información</a>
        </p>
      ) : null}
      {view.owned && purchasesEnabled && !protectedUntil ? (
        <p className="mt-1.5 text-xs text-muted">El anuncio actual se sustituye por el tuyo al completar el pago.</p>
      ) : null}
      <ShareLink unitId={unitId} className="mt-3 w-full justify-center" />
    </section>
  );
}
