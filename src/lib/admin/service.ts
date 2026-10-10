import { stripeClient } from "@/lib/market/stripe";
import {
  MarketError,
  getMarketStore,
  invalidateBans,
  invalidateMarketCaches,
  parseContent,
} from "@/lib/market/service";
import { publicUnitLabel } from "@/lib/market/label";
import { lockedUntil } from "@/lib/market/pricing";
import type { AdminAccount, AdminLogEntry, AdminPurchase, AdminUnit, Ban, PollTally, VisitStats } from "@/lib/market/store";
import { madridDay } from "@/lib/visits";
import { UNIT_KIND_LABEL, unitKindOf } from "@/lib/market/types";
import { FREE_UNIT_IDS, buildingNameOf, isFreeUnit, isKnownUnit, unitCatalogCounts } from "@/lib/market/units";
import { invalidatePoll } from "@/lib/poll";
import { adminEmails } from "./auth";

/**
 * Acciones y consultas del panel de administración. Cada acción que cambia algo deja una línea en el
 * registro (quién, qué, sobre qué y por qué) y vacía la memoria breve de las lecturas públicas para
 * que el mapa y las clasificaciones lo reflejen enseguida. La identidad del administrador la
 * comprueba la ruta (`requireAdmin`) ANTES de llamar aquí.
 */

const label = (unitId: string) => publicUnitLabel(unitId, buildingNameOf);

async function logAction(admin: string, action: string, target: string, detail = ""): Promise<void> {
  const store = await getMarketStore();
  await store.adminLog({ admin, action, target, detail });
}

/* ----------------------------------------------------------------- lecturas */

export type AdminOverview = {
  revenueCents: number;
  purchases: number;
  paidPurchases: number;
  freeClaims: number;
  unitsOwned: number;
  owners: number;
  freeTotal: number;
  freeLeft: number;
  bans: number;
  drafts: number;
  oldDrafts: number;
  pollVotes: number;
  catalog: ReturnType<typeof unitCatalogCounts>;
  stripeMode: "producción" | "pruebas" | "sin configurar";
  purchasesEnabled: boolean;
  admins: number;
  visitors: VisitStats;
};

export async function adminOverview(): Promise<AdminOverview> {
  const store = await getMarketStore();
  const [board, stats, units, purchases, poll, visitors] = await Promise.all([
    store.leaderboards(1),
    store.adminStats(),
    store.adminUnits(),
    store.adminPurchases(2000),
    store.pollTally(),
    store.visitStats(madridDay()),
  ]);
  const taken = new Set(units.map((unit) => unit.unitId));
  const live = purchases.filter((purchase) => !purchase.refundedAt && !purchase.releasedAt);
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return {
    revenueCents: board.stats.revenueCents,
    purchases: board.stats.purchases,
    paidPurchases: live.filter((purchase) => purchase.amountCents > 0).length,
    freeClaims: live.filter((purchase) => purchase.amountCents === 0).length,
    unitsOwned: board.stats.unitsOwned,
    owners: board.stats.owners,
    freeTotal: FREE_UNIT_IDS.length,
    freeLeft: FREE_UNIT_IDS.filter((id) => !taken.has(id)).length,
    bans: stats.bans,
    drafts: stats.drafts,
    oldDrafts: stats.oldDrafts,
    pollVotes: poll.total,
    catalog: unitCatalogCounts(),
    stripeMode: key.startsWith("sk_live") ? "producción" : key.startsWith("sk_test") ? "pruebas" : "sin configurar",
    purchasesEnabled: process.env.PURCHASES_ENABLED === "true",
    admins: adminEmails().length,
    visitors,
  };
}

export type AdminUnitRow = AdminUnit & { label: string; kind: string; free: boolean; lockedUntil: string | null; rev: string };

export async function adminUnitsList(): Promise<AdminUnitRow[]> {
  const store = await getMarketStore();
  const rows = await store.adminUnits();
  return rows.map((row) => ({
    ...row,
    label: label(row.unitId),
    kind: UNIT_KIND_LABEL[unitKindOf(row.unitId)],
    free: isFreeUnit(row.unitId),
    lockedUntil: lockedUntil(row.updatedAt),
    rev: `${row.purchases}.${row.edits}`,
  }));
}

export type AdminPurchaseRow = Omit<AdminPurchase, "sessionId"> & { label: string; session: string; free: boolean };

export async function adminPurchasesList(limit = 300): Promise<AdminPurchaseRow[]> {
  const store = await getMarketStore();
  const rows = await store.adminPurchases(Math.min(1000, limit));
  return rows.map(({ sessionId, ...row }) => ({
    ...row,
    label: label(row.unitId),
    session: sessionId.length > 14 ? `${sessionId.slice(0, 8)}…${sessionId.slice(-5)}` : sessionId,
    free: row.amountCents === 0,
  }));
}

export type AdminAccountRow = AdminAccount & { banned: boolean };

export async function adminAccountsList(): Promise<AdminAccountRow[]> {
  const store = await getMarketStore();
  const [accounts, bans] = await Promise.all([store.adminAccounts(), store.listBans()]);
  const banned = new Set(bans.map((ban) => ban.key));
  return accounts.map((account) => ({ ...account, banned: banned.has(account.key) || Boolean(account.email && banned.has(account.email.trim().toLowerCase())) }));
}

export async function adminBansList(): Promise<Ban[]> {
  return (await getMarketStore()).listBans();
}

export async function adminLogList(limit = 100): Promise<AdminLogEntry[]> {
  return (await getMarketStore()).listAdminLog(Math.min(500, limit));
}

export async function adminPollView(): Promise<PollTally> {
  return (await getMarketStore()).pollTally();
}

/* ----------------------------------------------------------------- acciones */

const clean = (value: unknown, max = 200): string => String(value ?? "").trim().slice(0, max);

function requireUnit(unitId: string): void {
  if (!isKnownUnit(unitId)) throw new MarketError("Esa unidad no existe.", 404);
}

/** Retira el anuncio: el espacio vuelve a estar disponible (o gratis si lo era). El historial de pagos se conserva. */
export async function releaseUnit(admin: string, unitId: string, reason: string): Promise<void> {
  requireUnit(unitId);
  const store = await getMarketStore();
  if (!(await store.releaseUnit(unitId))) throw new MarketError("Ese espacio no tiene anuncio que retirar.", 404);
  invalidateMarketCaches();
  await logAction(admin, "retirar-anuncio", `${unitId} (${label(unitId)})`, clean(reason));
}

/** Cambia o recorta el contenido de un anuncio (moderación): nombre, web, descripción o quitar la foto. */
export async function editUnitContent(
  admin: string,
  unitId: string,
  patch: { name?: unknown; url?: unknown; description?: unknown; removePhoto?: unknown },
): Promise<void> {
  requireUnit(unitId);
  const store = await getMarketStore();
  const unit = await store.getUnit(unitId);
  if (!unit?.content || unit.purchases < 1) throw new MarketError("Ese espacio no tiene anuncio.", 404);
  const next = { ...unit.content };
  const changes: string[] = [];
  if (patch.name !== undefined) {
    next.name = clean(patch.name, 60);
    changes.push("nombre");
  }
  if (patch.url !== undefined) {
    next.url = clean(patch.url, 300);
    changes.push("web");
  }
  if (patch.description !== undefined) {
    next.description = clean(patch.description, 600);
    changes.push("descripción");
  }
  if (patch.removePhoto === true) {
    next.images = {};
    next.logo = "";
    next.sameForAll = false;
    changes.push("foto retirada");
  }
  if (changes.length === 0) throw new MarketError("No hay nada que cambiar.", 400);
  const content = parseContent(next); // mismas reglas que al comprar: nombre válido, web http(s), etc.
  if (!(await store.editContent(unitId, content))) throw new MarketError("Ese espacio no tiene anuncio.", 404);
  invalidateMarketCaches();
  await logAction(admin, "editar-anuncio", `${unitId} (${label(unitId)})`, changes.join(", "));
}

/** Quita la protección de cinco días: cualquiera puede comprarlo ya. */
export async function unlockUnit(admin: string, unitId: string): Promise<void> {
  requireUnit(unitId);
  const store = await getMarketStore();
  if (!(await store.unlockUnit(unitId))) throw new MarketError("Ese espacio no está comprado.", 404);
  invalidateMarketCaches();
  await logAction(admin, "quitar-proteccion", `${unitId} (${label(unitId)})`);
}

/** Devuelve el dinero de una compra por Stripe y retira el anuncio si era el vigente del espacio. */
export async function refundPurchase(admin: string, purchaseId: string, reason: string): Promise<{ released: boolean }> {
  const store = await getMarketStore();
  const purchase = await store.getPurchase(purchaseId);
  if (!purchase) throw new MarketError("No existe esa compra.", 404);
  if (purchase.amountCents === 0) throw new MarketError("Esa compra fue gratis: no hay nada que devolver. Retira el anuncio si hace falta.", 400);
  if (purchase.refundedAt) throw new MarketError("Esa compra ya se devolvió.", 409);
  const stripe = stripeClient();
  const session = await stripe.checkout.sessions.retrieve(purchase.sessionId);
  const intent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!intent) throw new MarketError("Stripe no tiene un cobro asociado a esa compra.", 409);
  await stripe.refunds.create({ payment_intent: intent }, { idempotencyKey: `admin-refund-${purchase.id}` });
  await store.markRefunded(purchase.id);
  const owner = await store.ownership(purchase.unitId);
  const released = owner?.sessionId === purchase.sessionId ? await store.releaseUnit(purchase.unitId) : false;
  invalidateMarketCaches();
  await logAction(admin, "reembolso", `compra ${purchase.id} · ${purchase.unitId}`, `${(purchase.amountCents / 100).toFixed(2)} €${released ? " · anuncio retirado" : ""}${reason ? ` · ${clean(reason)}` : ""}`);
  return { released };
}

/** Bloquea a una persona (correo o cuenta): no puede entrar, comprar, reclamar ni editar. Opcionalmente retira sus anuncios. */
export async function banAccount(admin: string, key: string, reason: string, releaseUnits: boolean): Promise<{ released: number }> {
  const normalized = clean(key, 200).toLowerCase();
  if (!normalized) throw new MarketError("Indica un correo o una cuenta.", 400);
  if (adminEmails().includes(normalized)) throw new MarketError("No se puede bloquear a un administrador.", 400);
  const store = await getMarketStore();
  await store.addBan(normalized, clean(reason));
  invalidateBans();
  let released = 0;
  if (releaseUnits) {
    for (const unit of await store.adminUnits()) {
      if (unit.ownerEmail?.trim().toLowerCase() === normalized && (await store.releaseUnit(unit.unitId))) released += 1;
    }
    invalidateMarketCaches();
  }
  await logAction(admin, "bloquear", normalized, `${clean(reason)}${releaseUnits ? ` · anuncios retirados: ${released}` : ""}`);
  return { released };
}

export async function unbanAccount(admin: string, key: string): Promise<void> {
  const store = await getMarketStore();
  if (!(await store.removeBan(clean(key, 200).toLowerCase()))) throw new MarketError("Esa cuenta no estaba bloqueada.", 404);
  invalidateBans();
  await logAction(admin, "desbloquear", clean(key, 200));
}

export async function addPollCity(admin: string, name: unknown): Promise<void> {
  const text = clean(name, 40);
  if (text.length < 2) throw new MarketError("Escribe el nombre de la ciudad.", 400);
  const store = await getMarketStore();
  const option = await store.addPollOption(text);
  invalidatePoll();
  await logAction(admin, "encuesta-añadir", option.label);
}

export async function setPollCityActive(admin: string, id: string, active: boolean): Promise<void> {
  const store = await getMarketStore();
  if (!(await store.setPollOptionActive(clean(id, 60), active))) throw new MarketError("Esa opción no existe.", 404);
  invalidatePoll();
  await logAction(admin, active ? "encuesta-mostrar" : "encuesta-ocultar", clean(id, 60));
}

export async function resetPoll(admin: string): Promise<void> {
  await (await getMarketStore()).resetPoll();
  invalidatePoll();
  await logAction(admin, "encuesta-reiniciar", "todos los votos");
}

export async function purgeDrafts(admin: string, days: number): Promise<number> {
  const removed = await (await getMarketStore()).purgeDrafts(Math.max(1, Math.min(365, Math.floor(days) || 4)));
  await logAction(admin, "limpiar-borradores", `${removed} borradores`, `más de ${days} días`);
  return removed;
}

