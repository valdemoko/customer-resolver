"use client";

import type { ParcelRecord } from "@/lib/scene/parcels";
import type { MarketSlot } from "./BuildingPanel";
import { PanelShell } from "./PanelShell";
import { PurchaseBox } from "./PurchaseBox";

/** Ficha de un local: su nombre (si OpenStreetMap lo conoce) y el bloque de compra. */
export function ParcelPanel({
  parcel,
  market,
  onClose,
}: {
  readonly parcel: ParcelRecord;
  readonly market: MarketSlot;
  readonly onClose: () => void;
}) {
  const title = parcel.poiName ? parcel.poiName : "Local sin nombre";
  return (
    <PanelShell ariaLabel={`Ficha del local ${title}`} title={title} onClose={onClose}>
      {parcel.street ? <p className="mt-1 text-sm text-muted">{parcel.street}</p> : null}
      <PurchaseBox {...market} />
    </PanelShell>
  );
}
