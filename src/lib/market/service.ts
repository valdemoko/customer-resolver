import type Stripe from "stripe";
import { purchasesEnabled, PURCHASES_DISABLED_LABEL, requireAppOrigin } from "@/lib/env";
import { formatCents } from "@/lib/money";
import { priceForPurchases } from "./pricing";
import { FileStore, MemoryStore, NeonStore } from "./store";
import type { MarketStore, StoredUnit } from "./store";
import { createCheckoutSession, stripeClient } from "./stripe";
import { ContentSchema, LIMITS, UNIT_KIND_LABEL, unitKindOf } from "./types";
import { DEFAULT_FRAMING } from "./types";
import { lockedUntil } from "./pricing";
import { formatLockEnd } from "./lock-label";
import { signValue, verifySigned } from "@/lib/auth/session";
import { belongsTo } from "./store";
import type { Content, MarketState, UnitView } from "./types";
import { FREE_CLAIMS_PER_ACCOUNT, FREE_UNIT_IDS, buildingNameOf, isFreeUnit, isKnownUnit, unitCatalogCounts } from "./units";
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
  invalidateMarketCaches();
}

/**
 * Memoria breve por arranque del Worker para las lecturas públicas más repetidas
 * (estado del mercado y clasificaciones): con miles de visitantes consultando cada
 * pocos segundos, la base de datos recibe una consulta cada tantos segundos, no
 * una por visitante. Cualquier escritura de este mismo arranque la vacía; en otros
 * arranques la diferencia máxima es el TTL.
 */
const STATE_TTL_MS = 4_000;
const BOARD_TTL_MS = 10_000;
let stateCache: { at: number; value: MarketState } | null = null;
let boardCache: { at: number; value: LeaderboardsPayload } | null = null;
export function invalidateMarketCaches(): void {
  stateCache = null;
  boardCache = null;
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

/**
 * Precio de la próxima compra. Un espacio gratis cuesta 0 € la primera vez y después
 * empieza la escalera normal: el primer comprador de pago paga 1,00 €.
 */
export function priceFor(unitId: string, purchases: number): number {
  if (isFreeUnit(unitId)) return purchases === 0 ? 0 : priceForPurchases(purchases - 1);
  return priceForPurchases(purchases);
}

function view(id: string, stored: StoredUnit | null): UnitView {
  const purchases = stored?.purchases ?? 0;
  const content = stored?.content ?? null;
  return {
    id,
    purchases,
    priceCents: priceFor(id, purchases),
    owned: purchases > 0 && content !== null,
    free: isFreeUnit(id) && purchases === 0,
    rev: `${purchases}.${stored?.edits ?? 0}`,
    lockedUntil: purchases > 0 ? lockedUntil(stored?.updatedAt) : null,
    owner: content
      ? {
          name: content.name,
          url: content.url,
          description: content.description,
          // La foto única de un espacio (`images.all`) hace también de logo: sin esto el panel y la edición no la veían.
          hasLogo: content.logo !== "" || Boolean(content.images.all),
          faces: Object.keys(content.images),
          sameForAll: content.sameForAll,
          framing: content.framing ?? DEFAULT_FRAMING,
          since: stored?.updatedAt ?? "",
        }
      : null,
  };
}

export async function getMarketState(): Promise<MarketState> {
  if (stateCache && Date.now() - stateCache.at < STATE_TTL_MS) return stateCache.value;
  const value = await loadMarketState();
  if (value.purchasesEnabled || value.units.length > 0) stateCache = { at: Date.now(), value };
  return value;
}

async function loadMarketState(): Promise<MarketState> {
  let store: MarketStore;
  try {
    store = await getMarketStore();
  } catch (error) {
    // Sin base de datos el visor sigue funcionando: todo «disponible», sin compras.
    if (error instanceof MarketError && error.status === 503) return { units: [], version: "0", purchasesEnabled: false, free: [] };
    throw error;
  }
  const units = await store.listUnits();
  const taken = new Set(units.map((unit) => unit.id));
  const latest = units.reduce((max, unit) => (unit.updatedAt > max ? unit.updatedAt : max), "");
  const edits = units.reduce((sum, unit) => sum + (unit.edits ?? 0), 0);
  return {
    units: units.map((unit) => view(unit.id, unit)),
    version: `${units.length}:${latest}:${edits}`,
    purchasesEnabled,
    free: FREE_UNIT_IDS.filter((id) => !taken.has(id)),
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
  input: { unitId: string; content: unknown; returnPath?: string | undefined; unitLabel?: string | undefined; userId?: string | null | undefined; userEmail?: string | null | undefined },
  deps: { stripe?: Stripe; origin?: string } = {},
): Promise<{ url: string; amountCents: number; draftId: string }> {
  if (!purchasesEnabled) throw new MarketError(PURCHASES_DISABLED_LABEL, 403);
  if (!isKnownUnit(input.unitId)) throw new MarketError("Unidad desconocida.", 404);
  const content = parseContent(input.content);
  const store = await getMarketStore();
  const stored = await store.getUnit(input.unitId);
  const purchases = stored?.purchases ?? 0;
  const protectedUntil = purchases > 0 ? lockedUntil(stored?.updatedAt) : null;
  if (protectedUntil) {
    throw new MarketError(`Este espacio acaba de comprarse y está protegido hasta ${formatLockEnd(protectedUntil)} (hora de Madrid). Vuelve a intentarlo después.`, 409);
  }
  if (isFreeUnit(input.unitId) && purchases === 0) {
    throw new MarketError("Este espacio es gratis: se reclama sin pagar, con tu cuenta de Google.", 400);
  }
  const amountCents = priceFor(input.unitId, purchases);

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
  session: Pick<Stripe.Checkout.Session, "id" | "payment_status" | "metadata" | "amount_total"> & {
    amount_subtotal?: number | null;
    payment_intent?: Stripe.Checkout.Session["payment_intent"];
    customer_details?: { email?: string | null } | null;
    customer_email?: string | null;
  },
  deps: { stripe?: Stripe } = {},
): Promise<{ applied: boolean; unit: UnitView; refunded?: boolean } | null> {
  if (session.payment_status !== "paid") return null;
  const draftId = session.metadata?.draftId;
  const unitId = session.metadata?.unitId;
  if (!draftId || !unitId || !isKnownUnit(unitId)) return null;
  const store = await getMarketStore();
  // Defensa en profundidad: el anuncio solo se publica si lo pagado coincide con el precio que el
  // servidor fijó al crear el pago (por si una sesión llegara con otro importe). Antes de impuestos.
  const draft = await store.getDraft(draftId);
  if (!draft || draft.unitId !== unitId) return null;
  const paid = session.amount_subtotal ?? session.amount_total ?? 0;
  const expected = priceFor(unitId, draft.purchasesAtCreation);
  if (paid !== expected) {
    console.error("[market] importe inesperado: no se publica", { session: session.id, unitId, paid, expected });
    return null;
  }
  const buyerEmail = session.customer_details?.email ?? session.customer_email ?? null;
  const result = await store.completePurchase({ sessionId: session.id, draftId, amountCents: paid, buyerEmail });
  if (!result) return null;
  if (result.applied) invalidateMarketCaches();
  if (result.rejected) {
    // Alguien compró el espacio mientras esta persona pagaba: el cobro no se aplica y se devuelve entero.
    const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (intent) {
      await (deps.stripe ?? stripeClient()).refunds.create({ payment_intent: intent }, { idempotencyKey: `refund-${session.id}` });
    }
    return { applied: false, refunded: true, unit: view(result.unit.id, result.unit) };
  }
  return { applied: result.applied, unit: view(result.unit.id, result.unit) };
}

/** Retorno del navegador desde Stripe: se consulta la sesión al propio Stripe. */
export async function confirmSession(sessionId: string, deps: { stripe?: Stripe } = {}) {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) throw new MarketError("Sesión no válida.", 400);
  let session: Stripe.Checkout.Session;
  try {
    session = await (deps.stripe ?? stripeClient()).checkout.sessions.retrieve(sessionId);
  } catch (error) {
    // Una sesión que Stripe no conoce no es un fallo del servidor: se dice claro y no se publica nada.
    if ((error as { code?: string; statusCode?: number })?.code === "resource_missing" || (error as { statusCode?: number })?.statusCode === 404) {
      throw new MarketError("No existe esa sesión de pago.", 404);
    }
    throw error;
  }
  const done = await completeFromSession(session, deps);
  if (!done) throw new MarketError("El pago aún no figura como completado.", 409);
  if (done.refunded) {
    throw new MarketError("Otra persona compró este espacio justo antes que tú. Hemos devuelto el pago completo; puedes volver a intentarlo cuando el espacio vuelva a estar disponible.", 409);
  }
  return { ...done, editToken: await editTokenFor(session.id) };
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
    await completeFromSession(event.data.object, deps);
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
  if (boardCache && Date.now() - boardCache.at < BOARD_TTL_MS) return boardCache.value;
  const value = await loadLeaderboards();
  if (value.available) boardCache = { at: Date.now(), value };
  return value;
}

async function loadLeaderboards(): Promise<LeaderboardsPayload> {
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

/** Compras de una cuenta (por identificador o por el correo con el que se pagó como invitado), para «Mi cuenta». */
export async function getUserPurchases(userId: string, email?: string | null) {
  const store = await getMarketStore();
  return store.userPurchases(userId, email);
}

/** Espacios que posee ahora una cuenta. */
export async function getOwnedUnits(userId: string, email?: string | null): Promise<string[]> {
  const store = await getMarketStore();
  return store.ownedBy(userId, email);
}

/**
 * Enlace privado de edición para quien compró sin cuenta: una firma de la sesión de
 * pago. Solo vale mientras esa compra siga siendo la última del espacio.
 */
export async function editTokenFor(sessionId: string): Promise<string> {
  return signValue(`edit:${sessionId}`);
}

/**
 * Cambia el anuncio de un espacio YA comprado, sin pagar de nuevo. Lo puede hacer
 * su dueño actual: la cuenta que lo compró (o el mismo correo si pagó como invitado)
 * o quien tenga el enlace privado de edición. No cuenta como compra ni reinicia la
 * protección de cinco días.
 */
export async function editUnit(input: {
  unitId: string;
  content: unknown;
  userId?: string | null;
  userEmail?: string | null;
  token?: string | null;
}): Promise<UnitView> {
  if (!isKnownUnit(input.unitId)) throw new MarketError("Unidad desconocida.", 404);
  const content = parseContent(input.content);
  const store = await getMarketStore();
  const owner = await store.ownership(input.unitId);
  if (!owner) throw new MarketError("Este espacio todavía no tiene dueño.", 404);
  const byAccount = Boolean(input.userId) && belongsTo(owner, input.userId!, input.userEmail);
  const byToken = Boolean(input.token) && owner.sessionId !== "" && (await verifySigned(input.token ?? undefined)) === `edit:${owner.sessionId}`;
  if (!byAccount && !byToken) throw new MarketError("Solo el dueño actual de este espacio puede editar su anuncio.", 403);
  const updated = await store.editContent(input.unitId, content);
  if (!updated) throw new MarketError("Este espacio todavía no tiene dueño.", 404);
  invalidateMarketCaches();
  return view(updated.id, updated);
}

/**
 * Reclama un espacio GRATIS (el primer anuncio no cuesta nada). Hace falta cuenta de
 * Google y cada cuenta puede reclamar un máximo de `FREE_CLAIMS_PER_ACCOUNT`: sin
 * identidad, una sola persona se llevaría los 100. Después el espacio sigue las
 * reglas normales (protección de cinco días y precio de 1,00 € para el siguiente).
 */
export async function claimFree(input: {
  unitId: string;
  content: unknown;
  userId?: string | null;
  userEmail?: string | null;
}): Promise<UnitView> {
  if (!purchasesEnabled) throw new MarketError(PURCHASES_DISABLED_LABEL, 403);
  if (!isKnownUnit(input.unitId) || !isFreeUnit(input.unitId)) throw new MarketError("Este espacio no es gratis.", 400);
  if (!input.userId) throw new MarketError("Entra con Google para reclamar un espacio gratis.", 401);
  const content = parseContent(input.content);
  const store = await getMarketStore();
  const stored = await store.getUnit(input.unitId);
  const purchases = stored?.purchases ?? 0;
  if (purchases > 0) throw new MarketError("Alguien reclamó este espacio justo antes que tú.", 409);
  const claimed = await store.freeClaims(input.userId);
  if (claimed >= FREE_CLAIMS_PER_ACCOUNT) {
    throw new MarketError(`Ya has reclamado ${FREE_CLAIMS_PER_ACCOUNT} espacios gratis, el máximo por cuenta.`, 409);
  }
  const draftId = randomId("dr");
  await store.saveDraft({ id: draftId, unitId: input.unitId, content, purchasesAtCreation: 0, createdAt: new Date().toISOString(), userId: input.userId });
  const result = await store.completePurchase({ sessionId: `free_${draftId}`, draftId, amountCents: 0, buyerEmail: input.userEmail ?? null });
  if (!result || result.rejected) throw new MarketError("Alguien reclamó este espacio justo antes que tú.", 409);
  invalidateMarketCaches();
  return view(result.unit.id, result.unit);
}
