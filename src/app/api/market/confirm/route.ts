import { NextResponse, type NextRequest } from "next/server";
import { confirmSession } from "@/lib/market/service";
import { fail } from "../helpers";

export const dynamic = "force-dynamic";

/** Retorno desde Stripe: comprueba la sesión con Stripe y aplica la compra (idempotente). */
export async function GET(request: NextRequest) {
  try {
    const done = await confirmSession(request.nextUrl.searchParams.get("session_id") ?? "");
    return NextResponse.json({ applied: done.applied, unit: done.unit });
  } catch (error) {
    return fail(error);
  }
}
