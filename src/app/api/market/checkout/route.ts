import { NextResponse, type NextRequest } from "next/server";
import { createCheckout } from "@/lib/market/service";
import { fail } from "../helpers";

export const dynamic = "force-dynamic";

/**
 * Crea el borrador y la sesión de pago de Stripe. Devuelve la URL de Stripe
 * Checkout a la que el navegador debe ir. El importe NO viene del cliente.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { unitId?: string; content?: unknown; returnPath?: string; unitLabel?: string };
    const result = await createCheckout({
      unitId: String(body.unitId ?? ""),
      content: body.content,
      returnPath: body.returnPath,
      unitLabel: body.unitLabel,
    });
    return NextResponse.json({ url: result.url, amountCents: result.amountCents });
  } catch (error) {
    return fail(error);
  }
}
