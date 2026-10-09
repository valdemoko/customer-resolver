import { NextResponse } from "next/server";
import { getMarketState } from "@/lib/market/service";
import { fail } from "../helpers";

export const dynamic = "force-dynamic";

/** Unidades compradas y su próximo precio (sin imágenes). */
export async function GET() {
  try {
    return NextResponse.json(await getMarketState(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return fail(error);
  }
}
