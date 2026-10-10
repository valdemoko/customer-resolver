import { NextResponse, type NextRequest } from "next/server";
import { confirmSession } from "@/lib/market/service";
import { fail, rateLimited, tooManyRequests } from "../helpers";

export const dynamic = "force-dynamic";

/** Retorno desde Stripe: comprueba la sesión con Stripe y aplica la compra (idempotente). */
export async function GET(request: NextRequest) {
  try {
    if (rateLimited(request, "confirm", 30, 60_000)) return tooManyRequests();
    const done = await confirmSession(request.nextUrl.searchParams.get("session_id") ?? "");
    return NextResponse.json({ applied: done.applied, unit: done.unit, editToken: done.editToken });
  } catch (error) {
    return fail(error);
  }
}
