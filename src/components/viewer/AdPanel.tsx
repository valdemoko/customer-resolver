"use client";

import { UNIT_KIND_LABEL, unitKindOf } from "@/lib/market/types";
import type { UnitView } from "@/lib/market/types";
import { PanelShell } from "./PanelShell";
import { PurchaseBox } from "./PurchaseBox";

/** Ficha de un anuncio móvil: panel de crucero, vela, camión o cartel de avioneta. */
export function AdPanel({
  unitId,
  label,
  view,
  purchasesEnabled,
  onBuy,
  onClose,
}: {
  unitId: string;
  label: string;
  view: UnitView;
  purchasesEnabled: boolean;
  onBuy: () => void;
  onClose: () => void;
}) {
  const kind = unitKindOf(unitId);
  return (
    <PanelShell ariaLabel={`Ficha de ${label}`} title={label} onClose={onClose}>
      <p className="mt-1 text-sm text-muted">{UNIT_KIND_LABEL[kind]}</p>
      <PurchaseBox unitId={unitId} view={view} purchasesEnabled={purchasesEnabled} onBuy={onBuy} />
    </PanelShell>
  );
}
