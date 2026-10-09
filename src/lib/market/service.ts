import type Stripe from "stripe";
import { purchasesEnabled, PURCHASES_DISABLED_LABEL, requireAppOrigin } from "@/lib/env";
import { formatCents } from "@/lib/money";
import { priceForPurchases } from "./pricing";
import { FileStore, MemoryStore, NeonStore } from "./store";
import type { MarketStore, StoredUnit } from "./store";
import { createCheckoutSession, stripeClient } from "./stripe";
import { ContentSchema, LIMITS, UNIT_KIND_LABEL, unitKindOf } from "./types";
import { DEFAULT_FRAMING } from "./types";
import type { Content, MarketState, UnitView } from "./types";
import { buildingNameOf, isKnownUnit, unitCatalogCounts } from "./units";
import { publicUnitLabel } from "./label";

/**
 * Lógica del mercado. Reglas que no se negocian:
 *
 *  · El PRECIO sale siempre de aquí (nunca del navegador): 1,00 € la primera vez
 *    y +25 % por cada compra anterior de esa unidad (`money.ts`).
 *  · Solo se cobra con Stripe y solo con `PURCHASES_ENABLED=true`. No existe un
 *    modo simulado que aparente una compra.
 *  · Una compra se aplica UNA vez por sesión de Stripe, la avise el webhook, el
 *    retorno del navegador o ambos.
 */

export class MarketError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let storeOverride: MarketStore | null = null;
let cachedStore: MarketStore | null = null;

/** Para pruebas: sustituye el almacén. */
export function setMarketStore(store: MarketStore | null): void {
  storeOverride = store;
  cachedStore = null;
}

export async function getMarketStore(): Promise<MarketStore> {
  if (storeOverride) return storeOverride;
  if (cachedStore) return cachedStore;
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    cachedStore = new NeonStore(neon(url) as unknown as ConstructorParameters<typeof NeonStore>[0]);
  } else if (process.env.NODE_ENV !== "production") {
    cachedStore = new FileStore(`${process.cwd()}/.data/market.json`);
  } else {
    throw new MarketError("El almacén del mercado no está configurado (falta DATABASE_URL).", 503);
  }
  return cachedStore;
}

function view(id: string, stored: StoredUnit | null): UnitView {
  const purchases = stored?.purchases ?? 0;
  const content = stored?.content ?? null;
  return {
    id,
    purchases,
    priceCents: priceForPurchases(purchases),
    owned: purchases > 0 && content !== null,
    owner: content
      ? {
          name: content.name,
          url: content.url,
          description: content.description,
          hasLogo: content.logo !== "",
          faces: Object.keys(content.images),
          sameForAll: content.sameForAll,
          framing: content.framing ?? DEFAULT_FRAMING,
          since: stored?.updatedAt ?? "",
        }
      : null,
  };
}

export async function getMarketState(): Promise<MarketState> {
  let store: MarketStore;
  try {
    store = await getMarketStore();
  } catch (error) {
    // Sin base de datos el visor sigue funcionando: todo «disponible», sin compras.
    if (error instanceof MarketError && error.status === 503) return { units: [], version: "0", purchasesEnabled: false };
    throw error;
  }
  const units = await store.listUnits();
  const latest = units.reduce((max, unit) => (unit.updatedAt > max ? unit.updatedAt : max), "");
  return {
    units: units.map((unit) => view(unit.id, unit)),
    version: `${units.length}:${latest}`,
    purchasesEnabled,
  };
}

export async function getUnitView(id: string): Promise<UnitView> {
  if (!isKnownUnit(id)) throw new MarketError("Unidad desconocida.", 404);
  const store = await getMarketStore();
  return view(id, await store.getUnit(id));
}

/** Una imagen de la unidad (`logo`, `all` o `f3`), con su tipo MIME. */
export async function getUnitImage(id: string, face: string): Promise<{ mime: string; bytes: Uint8Array } | null> {
  if (!isKnownUnit(id)) return null;
  const store = await getMarketStore();
  const content = (await store.getUnit(id))?.content;
  if (!content) return null;
  // Una sola foto por espacio: si no hay logo ni foto de techo propios, sirve la de fachada (`all`).
  const dataUrl =
    face === "logo"
      ? content.logo || content.images.all || ""
      : (content.images[face] ?? (content.sameForAll || face === "roof" ? content.images.all : undefined) ?? "");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (!match?.[1] || !match[2]) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { mime: match[1], bytes };
}

function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Valida el contenido enviado y los límites de peso de las imágenes. */
export function parseContent(raw: unknown): Content {
  const parsed = ContentSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new MarketError(
      `Contenido no válido (${issue?.path.join(".") || "formulario"}): ${issue?.message ?? "revisa los datos"}.`,
      400,
    );
  }
  const content = parsed.data;
  const images = Object.values(content.images);
  if (images.length > LIMITS.facesPerUnit) throw new MarketError("Demasiadas imágenes.", 400);
  const total = images.reduce((sum, image) => sum + image.length, 0) + content.logo.length;
  if (total > LIMITS.totalImageBytes * 1.4) throw new MarketError("Las imágenes pesan demasiado: reduce su tamaño.", 413);
  if (content.sameForAll && !content.images.all) throw new MarketError("Falta la imagen común a todas las caras.", 400);
  return content;
}

export async function createCheckout(
  input: { unitId: string; content: unknown; returnPath?: string | undefined; unitLabel?: string | undefined; userId?: string | null | undefined },
  deps: { stripe?: Stripe; origin?: string } = {},
): Promise<{ url: string; amountCents: number; draftId: string }> {
  if (!purchasesEnabled) throw new MarketError(PURCHASES_DISABLED_LABEL, 403);
  if (!isKnownUnit(input.unitId)) throw new MarketError("Unidad desconocida.", 404);
  const content = parseContent(input.content);
  const store = await getMarketStore();
  const stored = await store.getUnit(input.unitId);
  const purchases = stored?.purchases ?? 0;
  const amountCents = priceForPurchases(purchases);

  const draftId = randomId("dr");
  await store.saveDraft({
    id: draftId,
    unitId: input.unitId,
    content,
    purchasesAtCreation: purchases,
    createdAt: new Date().toISOString(),
    userId: input.userId ?? null,
  });

  const label = (input.unitLabel ?? UNIT_KIND_LABEL[unitKindOf(input.unitId)]).slice(0, 80);
  const returnPath =
    input.returnPath && /^\/[A-Za-z0-9/_-]*$/.test(input.returnPath) ? input.returnPath : "/city/malaga/viewer";
  const session = await createCheckoutSession(deps.stripe ?? stripeClient(), {
    unitId: input.unitId,
    unitLabel: `${label} (${formatCents(amountCents)})`,
    amountCents,
    draftId,
    origin: deps.origin ?? requireAppOrigin(),
    returnPath,
  });
  if (!session.url) throw new MarketError("Stripe no devolvió la página de pago.", 502);
  return { url: session.url, amountCents, draftId };
}

/** Aplica la compra de una sesión PAGADA. Idempotente. */
export async function completeFromSession(
  session: Pick<Stripe.Checkout.Session, "id" | "payment_status" | "metadata" | "amount_total">,
): Promise<{ applied: boolean; unit: UnitView } | null> {
  if (session.payment_status !== "paid") return null;
  const draftId = session.metadata?.draftId;
  const unitId = session.metadata?.unitId;
  if (!draftId || !unitId || !isKnownUnit(unitId)) return null;
  const store = await getMarketStore();
  const result = await store.completePurchase({ sessionId: session.id, draftId, amountCents: session.amount_total ?? 0 });
  if (!result) return null;
  return { applied: result.applied, unit: view(result.unit.id, result.unit) };
}

/** Retorno del navegador desde Stripe: se consulta la sesión al propio Stripe. */
export async function confirmSession(sessionId: string, deps: { stripe?: Stripe } = {}) {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) throw new MarketError("Sesión no válida.", 400);
  const session = await (deps.stripe ?? stripeClient()).checkout.sessions.retrieve(sessionId);
  const done = await completeFromSession(session);
  if (!done) throw new MarketError("El pago aún no figura como completado.", 409);
  return done;
}

export async function handleWebhook(rawBody: string, signature: string | null, deps: { stripe?: Stripe } = {}) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new MarketError("Falta STRIPE_WEBHOOK_SECRET.", 503);
  if (!signature) throw new MarketError("Falta la firma de Stripe.", 400);
  const stripe = deps.stripe ?? stripeClient();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret);
  } catch {
    throw new MarketError("Firma de Stripe no válida.", 400);
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    await completeFromSession(event.data.object);
  }
  return { received: true, type: event.type };
}

export { MemoryStore };


/* ------------------------------------------------------ clasificaciones públicas */

export type LeaderboardsPayload = {
  /** `false` si no hay almacén o falla: el cliente enseña «no disponible», no ceros. */
  available: boolean;
  generatedAt: string;
  catalog: ReturnType<typeof unitCatalogCounts>;
  stats: { purchases: number; unitsOwned: number; owners: number; revenueCents: number } | null;
  valuable: Array<{ unitId: string; label: string; kind: string; paidCents: number; purchases: number; owner: string | null }>;
  owners: Array<{ name: string; units: number }>;
  latest: Array<{ unitId: string; label: string; kind: string; buyer: string; amountCents: number; createdAt: string }>;
};

export const LEADERBOARD_SIZE = 15;

/** Clasificaciones de Málaga. Solo datos públicos: nombres de anunciante, importes y fechas. */
export async function getLeaderboards(): Promise<LeaderboardsPayload> {
  const base = { generatedAt: new Date().toISOString(), catalog: unitCatalogCounts() };
  let board;
  try {
    board = await (await getMarketStore()).leaderboards(LEADERBOARD_SIZE);
  } catch {
    return { ...base, available: false, stats: null, valuable: [], owners: [], latest: [] };
  }
  const describe = (unitId: string) => ({
    label: publicUnitLabel(unitId, buildingNameOf),
    kind: UNIT_KIND_LABEL[unitKindOf(unitId)],
  });
  return {
    ...base,
    available: true,
    stats: board.stats,
    valuable: board.valuable.map((row) => ({ ...row, ...describe(row.unitId) })),
    owners: board.owners,
    latest: board.latest.map((row) => ({ ...row, ...describe(row.unitId) })),
  };
}

/** Compras de una cuenta, para la página «Mi cuenta». */
export async function getUserPurchases(userId: string) {
  const store = await getMarketStore();
  return store.userPurchases(userId);
}
