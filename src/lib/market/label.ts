import { UNIT_KIND_LABEL, unitKindOf } from "./types";

/** Nombre legible de una unidad comprable, para tooltips, fichas y el estudio. */
export function unitLabel(
  unitId: string,
  context: { building: { name: string } | null; parcel: { id: string; poiName?: string | null } | null },
): string {
  const kind = unitKindOf(unitId);
  const parts = unitId.split(":");
  switch (kind) {
    case "building":
      return context.building?.name || "Edificio sin nombre";
    case "parcel":
      return context.parcel?.poiName ? `Local · ${context.parcel.poiName}` : `Local ${unitId.slice(2)}`;
    case "wall": {
      const place = parts[1] === "alcazaba" ? "Alcazaba" : "Gibralfaro";
      return `${UNIT_KIND_LABEL.wall} · ${place} ${Number(parts[2]) + 1}`;
    }
    case "ship":
      return `Crucero ${parts[1]?.replace("cruise-", "")} · panel ${Number(parts[2]) + 1}`;
    case "sail":
      return `Vela ${parts[1]}`;
    default:
      return `Avioneta ${parts[1]?.replace("plane-", "")}`;
  }
}

/** Rótulo de una unidad para listados públicos (servidor): sin geometría, solo datos conocidos. */
export function publicUnitLabel(unitId: string, buildingName: (osmId: string) => string | null): string {
  const kind = unitKindOf(unitId);
  if (kind === "building") return buildingName(unitId.slice(2)) ?? `Edificio ${unitId.slice(2)}`;
  if (kind === "parcel") return `Local ${unitId.slice(2)}`;
  return unitLabel(unitId, { building: null, parcel: null });
}
