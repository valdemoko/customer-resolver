import { NextResponse, type NextRequest } from "next/server";
import { handleWebhook } from "@/lib/market/service";
import { fail } from "../helpers";

export const dynamic = "force-dynamic";

/** Webhook de Stripe (`checkout.session.completed`). Se lee el cuerpo SIN parsear para verificar la firma. */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    return NextResponse.json(await handleWebhook(raw, request.headers.get("stripe-signature")));
  } catch (error) {
    return fail(error);
  }
}
