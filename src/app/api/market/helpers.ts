import { NextResponse } from "next/server";
import { MarketError } from "@/lib/market/service";
import { StripeNotConfigured } from "@/lib/market/stripe";

/** Convierte un error del mercado en una respuesta JSON sin filtrar detalles internos. */
export function fail(error: unknown): NextResponse {
  if (error instanceof MarketError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof StripeNotConfigured) {
    return NextResponse.json({ error: "El cobro con Stripe aún no está configurado." }, { status: 503 });
  }
  console.error("[market]", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Error interno del mercado." }, { status: 500 });
}
