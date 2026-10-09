import Stripe from "stripe";

/**
 * Cliente de Stripe. Se crea con el cliente HTTP basado en `fetch` (funciona en
 * Node y en Cloudflare Workers). La clave SOLO se lee de `STRIPE_SECRET_KEY`: no
 * se escribe en ningún archivo del repositorio.
 */
export class StripeNotConfigured extends Error {
  override name = "StripeNotConfigured";
}

let cached: Stripe | null = null;

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new StripeNotConfigured("Falta STRIPE_SECRET_KEY: el cobro con Stripe no está configurado.");
  cached ??= new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  return cached;
}

export type CheckoutParams = {
  unitId: string;
  unitLabel: string;
  amountCents: number;
  draftId: string;
  origin: string;
  returnPath: string;
};

export async function createCheckoutSession(client: Stripe, params: CheckoutParams): Promise<Stripe.Checkout.Session> {
  const separator = params.returnPath.includes("?") ? "&" : "?";
  return client.checkout.sessions.create({
    mode: "payment",
    client_reference_id: params.draftId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: params.amountCents,
          product_data: { name: `Espacio publicitario · ${params.unitLabel}`, description: `Unidad ${params.unitId}` },
        },
      },
    ],
    metadata: { draftId: params.draftId, unitId: params.unitId },
    payment_intent_data: { metadata: { draftId: params.draftId, unitId: params.unitId } },
    success_url: `${params.origin}${params.returnPath}${separator}checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${params.origin}${params.returnPath}${separator}checkout=cancelled&unit=${encodeURIComponent(params.unitId)}`,
  });
}
