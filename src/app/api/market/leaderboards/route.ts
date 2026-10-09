import { NextResponse } from "next/server";
import { getLeaderboards } from "@/lib/market/service";

export const dynamic = "force-dynamic";

/**
 * Clasificaciones y cifras públicas de Málaga. Solo lectura y sin datos privados
 * (nombres que los anunciantes ya publican en el mapa, importes y fechas). Se
 * cachea 30 s en el borde: la página de la ciudad no martillea la base de datos.
 */
export async function GET() {
  const payload = await getLeaderboards();
  return NextResponse.json(payload, {
    headers: { "Cache-Control": payload.available ? "public, s-maxage=30, stale-while-revalidate=120" : "no-store" },
  });
}
