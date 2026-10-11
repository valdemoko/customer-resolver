import { NextResponse } from "next/server";
import { visitTotal } from "@/lib/visits";

export const dynamic = "force-dynamic";

/**
 * Cuántas personas distintas han entrado en la web (el mismo dato del panel de administración, solo el total).
 * Es público y no lleva nada de nadie. Se cachea un minuto en el borde y otro en la instancia.
 */
export async function GET() {
  const total = await visitTotal();
  return NextResponse.json(
    { total },
    { headers: { "Cache-Control": total === null ? "no-store" : "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
