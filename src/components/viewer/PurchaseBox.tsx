"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PURCHASES_DISABLED_LABEL } from "@/lib/purchases-label";
import { formatCents, nextPriceCents } from "@/lib/money";
import type { UnitView } from "@/lib/market/types";

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
      {view.owned && purchasesEnabled ? (
        <p className="mt-1.5 text-xs text-muted">El anuncio actual se sustituye por el tuyo al completar el pago.</p>
      ) : null}
    </section>
  );
}
