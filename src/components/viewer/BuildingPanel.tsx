"use client";

import type { BuildingRecord } from "@/lib/scene/city";
import type { UnitView } from "@/lib/market/types";
import { PanelShell } from "./PanelShell";
import { PurchaseBox } from "./PurchaseBox";

export type MarketSlot = { unitId: string; view: UnitView; purchasesEnabled: boolean; onBuy: () => void; signedIn?: boolean | null };

/**
 * Ficha del edificio seleccionado, mínima a propósito: el nombre (o «Edificio sin
 * nombre») y el bloque de compra. Alturas, orígenes de datos y demás metodología
 * viven en la página de datos de la ciudad, no sobre el mapa.
 */
export function BuildingPanel({
  record,
  market,
  onClose,
}: {
  readonly record: BuildingRecord;
  /** Datos de compra si el edificio (o tramo de muralla) se vende. */
  readonly market: MarketSlot | null;
  readonly onClose: () => void;
}) {
  const title = record.name || "Edificio sin nombre";
  return (
    <PanelShell ariaLabel={`Ficha de ${title}`} title={title} onClose={onClose}>
      {market ? <PurchaseBox {...market} /> : <p className="mt-2 text-sm text-muted">Este edificio no está a la venta.</p>}
    </PanelShell>
  );
}
