import type { Content } from "./types";

/**
 * Almacén del mercado. Tres implementaciones con el mismo contrato:
 *
 *  · `NeonStore`   producción: Postgres serverless (variable `DATABASE_URL`).
 *  · `FileStore`   desarrollo local sin base de datos (`.data/market.json`). Nunca
 *                  en producción: en un Worker no hay sistema de archivos.
 *  · `MemoryStore` pruebas.
 *
 * `completePurchase` es IDEMPOTENTE por `sessionId`: Stripe puede avisar dos veces
 * (webhook y retorno del navegador) y la compra se aplica una sola.
 */

export type StoredUnit = {
  id: string;
  purchases: number;
  content: Content | null;
  updatedAt: string;
  /** Ediciones del anuncio tras la compra (no cuentan como compra ni reinician la protección). */
  edits: number;
};

export type Draft = {
  id: string;
  unitId: string;
  content: Content;
  purchasesAtCreation: number;
  createdAt: string;
  /** Cuenta (Google) que inició la compra, si estaba conectada. */
  userId?: string | null;
};

/** `rejected: "stale"`: alguien compró el espacio después de crearse este pago; no se aplica y hay que devolverlo. */
export type CompleteResult = { applied: boolean; unit: StoredUnit; amountCents: number | null; rejected?: "stale" };

/** Una compra completada (nada privado: el nombre es el que el comprador publica en el mapa). */
export type PurchaseRecord = { unitId: string; amountCents: number; buyer: string; createdAt: string; userId?: string | null; sessionId?: string; buyerEmail?: string | null; released?: boolean; refundedAt?: string | null };

/** Una compra de una cuenta, con su estado actual: `current` es que el espacio sigue siendo suyo. */
export type UserPurchase = { unitId: string; amountCents: number; name: string; createdAt: string; current: boolean };

/** Datos públicos agregados para la portada y la página de la ciudad. */
export type Leaderboards = {
  stats: { purchases: number; unitsOwned: number; owners: number; revenueCents: number };
  /** Unidades por el mayor importe pagado por ellas (un solo pago, no la suma). */
  valuable: Array<{ unitId: string; paidCents: number; purchases: number; owner: string | null }>;
  /** Anunciantes por número de unidades que poseen ahora. */
  owners: Array<{ name: string; units: number }>;
  /** Las últimas compras completadas, de la más reciente a la más antigua. */
  latest: Array<{ unitId: string; buyer: string; amountCents: number; createdAt: string }>;
};

const ownerKey = (name: string) => name.trim().toLowerCase();

/** Cálculo de referencia (memoria y archivo); Neon lo hace en SQL con el mismo orden y desempates. */
export function computeLeaderboards(log: PurchaseRecord[], units: StoredUnit[], limit: number): Leaderboards {
  const owned = units.filter((unit) => unit.purchases > 0 && unit.content);
  // Lo retirado por el administrador o reembolsado no sale en las listas públicas.
  const visibleLog = log.filter((entry) => !entry.released && !entry.refundedAt);
  const perUnit = new Map<string, { paid: number; n: number }>();
  for (const entry of visibleLog) {
    if (entry.amountCents <= 0) continue; // las reclamaciones gratis no entran en «pago más alto»
    const current = perUnit.get(entry.unitId) ?? { paid: 0, n: 0 };
    perUnit.set(entry.unitId, { paid: Math.max(current.paid, entry.amountCents), n: current.n + 1 });
  }
  // «Propietario» es una PERSONA, no un nombre de anuncio: se agrupa por el correo (o la cuenta) de la última
  // compra de cada espacio, y solo si no hay ninguno, por el nombre. Se enseña el nombre de su anuncio más reciente.
  const lastBuyer = new Map<string, PurchaseRecord>();
  for (const entry of visibleLog) lastBuyer.set(entry.unitId, entry);
  const byOwner = new Map<string, { name: string; units: number; at: string; unitId: string }>();
  for (const unit of owned) {
    const name = unit.content!.name;
    const last = lastBuyer.get(unit.id);
    const email = last?.buyerEmail?.trim().toLowerCase();
    const key = email || last?.userId || `nombre:${ownerKey(name)}`;
    const current = byOwner.get(key);
    if (!current) {
      byOwner.set(key, { name, units: 1, at: unit.updatedAt, unitId: unit.id });
      continue;
    }
    current.units += 1;
    if (unit.updatedAt > current.at || (unit.updatedAt === current.at && unit.id < current.unitId)) {
      current.name = name;
      current.at = unit.updatedAt;
      current.unitId = unit.id;
    }
  }
  const ownerOf = new Map(owned.map((unit) => [unit.id, unit.content!.name]));
  return {
    stats: {
      purchases: visibleLog.length,
      unitsOwned: owned.length,
      owners: byOwner.size,
      revenueCents: log.filter((entry) => !entry.refundedAt).reduce((sum, entry) => sum + entry.amountCents, 0),
    },
    valuable: [...perUnit]
      .map(([unitId, value]) => ({ unitId, paidCents: value.paid, purchases: value.n, owner: ownerOf.get(unitId) ?? null }))
      .sort((a, b) => b.paidCents - a.paidCents || b.purchases - a.purchases || a.unitId.localeCompare(b.unitId))
      .slice(0, limit),
    owners: [...byOwner.values()]
      .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name))
      .slice(0, limit)
      .map(({ name, units }) => ({ name, units })),
    latest: [...visibleLog]
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt) || b.index - a.index)
      .slice(0, limit)
      .map(({ entry }) => ({ unitId: entry.unitId, buyer: entry.buyer, amountCents: entry.amountCents, createdAt: entry.createdAt })),
  };
}

/** Quién compró por última vez un espacio (el dueño actual). */
export type Ownership = { sessionId: string; userId: string | null; buyerEmail: string | null };

const sameEmail = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/** ¿Pertenece esta compra a la cuenta? Por identificador, o, si se compró como invitado, por el mismo correo. */
export function belongsTo(entry: { userId?: string | null; buyerEmail?: string | null }, userId: string, email?: string | null): boolean {
  if (entry.userId) return entry.userId === userId;
  return sameEmail(entry.buyerEmail, email);
}

/* -------------------------------------------------- administración y encuesta */

export type AdminUnit = {
  unitId: string;
  purchases: number;
  name: string;
  url: string;
  description: string;
  photoBytes: number;
  edits: number;
  updatedAt: string;
  ownerEmail: string | null;
  hasAccount: boolean;
  lastAmountCents: number;
};
export type AdminPurchase = {
  id: string;
  unitId: string;
  amountCents: number;
  createdAt: string;
  name: string;
  email: string | null;
  hasAccount: boolean;
  sessionId: string;
  refundedAt: string | null;
  releasedAt: string | null;
};
export type AdminAccount = { key: string; email: string | null; purchases: number; freeClaims: number; paidCents: number; units: number; lastAt: string };
export type Ban = { key: string; reason: string; createdAt: string };
export type AdminLogEntry = { id: string; at: string; admin: string; action: string; target: string; detail: string };
export type PollOption = { id: string; label: string; active: boolean };
export type PollTally = { options: Array<PollOption & { votes: number }>; total: number };
export type PollVoteResult = "ok" | "unknown" | "limit";
export type PurchaseInfo = { id: string; unitId: string; sessionId: string; amountCents: number; refundedAt: string | null; releasedAt: string | null };

/** Ciudades entre las que vota la gente (el panel puede añadir o esconder opciones). */
export const DEFAULT_POLL_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "madrid", label: "Madrid" },
  { id: "barcelona", label: "Barcelona" },
  { id: "valencia", label: "Valencia" },
  { id: "sevilla", label: "Sevilla" },
  { id: "nueva-york", label: "Nueva York" },
  { id: "paris", label: "París" },
  { id: "londres", label: "Londres" },
  { id: "lisboa", label: "Lisboa" },
];

/** Lo que usa el panel de administración y la encuesta de la próxima ciudad. */
export interface AdminOps {
  adminUnits(): Promise<AdminUnit[]>;
  adminPurchases(limit: number): Promise<AdminPurchase[]>;
  adminAccounts(): Promise<AdminAccount[]>;
  adminStats(): Promise<{ drafts: number; oldDrafts: number; bans: number }>;
  /** Devuelve el espacio a «disponible» (o «gratis» si lo era). Conserva el historial de pagos. */
  releaseUnit(unitId: string): Promise<boolean>;
  /** Quita la protección de cinco días de un espacio. */
  unlockUnit(unitId: string): Promise<boolean>;
  getPurchase(purchaseId: string): Promise<PurchaseInfo | null>;
  markRefunded(purchaseId: string): Promise<boolean>;
  listBans(): Promise<Ban[]>;
  addBan(key: string, reason: string): Promise<void>;
  removeBan(key: string): Promise<boolean>;
  adminLog(entry: Omit<AdminLogEntry, "id" | "at">): Promise<void>;
  listAdminLog(limit: number): Promise<AdminLogEntry[]>;
  purgeDrafts(olderThanDays: number): Promise<number>;
  pollTally(): Promise<PollTally>;
  castVote(voterKey: string, optionId: string, ipHash: string): Promise<PollVoteResult>;
  myVote(voterKey: string): Promise<string | null>;
  addPollOption(label: string): Promise<PollOption>;
  setPollOptionActive(id: string, active: boolean): Promise<boolean>;
  resetPoll(): Promise<void>;
}

/** Identificador estable de una opción de la encuesta a partir de su nombre. */
export function pollSlug(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export interface MarketStore extends AdminOps {
  leaderboards(limit: number): Promise<Leaderboards>;
  listUnits(): Promise<StoredUnit[]>;
  getUnit(id: string): Promise<StoredUnit | null>;
  saveDraft(draft: Draft): Promise<void>;
  getDraft(id: string): Promise<Draft | null>;
  /** Borra un borrador ya consumido (las reclamaciones gratis no lo necesitan después). */
  deleteDraft(id: string): Promise<void>;
  completePurchase(args: { sessionId: string; draftId: string; amountCents: number; buyerEmail?: string | null }): Promise<CompleteResult | null>;
  userPurchases(userId: string, email?: string | null): Promise<UserPurchase[]>;
  /** Dueño actual del espacio (última compra) o `null`. */
  ownership(unitId: string): Promise<Ownership | null>;
  /** Cambia el contenido del anuncio sin tocar compras, precio ni protección. */
  editContent(unitId: string, content: Content): Promise<StoredUnit | null>;
  /** Espacios que posee ahora la cuenta. */
  ownedBy(userId: string, email?: string | null): Promise<string[]>;
  /** Cuántos espacios gratis ha reclamado la cuenta (compras de 0 €). */
  freeClaims(userId: string): Promise<number>;
}

/* ------------------------------------------------------------------ memoria */

export class MemoryStore implements MarketStore {
  protected units = new Map<string, StoredUnit>();
  protected drafts = new Map<string, Draft>();
  protected sessions = new Map<string, { unitId: string; amountCents: number }>();
  protected log: PurchaseRecord[] = [];

  async leaderboards(limit: number): Promise<Leaderboards> {
    return computeLeaderboards(this.log, [...this.units.values()], limit);
  }

  async listUnits(): Promise<StoredUnit[]> {
    return [...this.units.values()].filter((unit) => unit.purchases > 0);
  }

  async getUnit(id: string): Promise<StoredUnit | null> {
    return this.units.get(id) ?? null;
  }

  async saveDraft(draft: Draft): Promise<void> {
    this.drafts.set(draft.id, draft);
    await this.persist();
  }

  async getDraft(id: string): Promise<Draft | null> {
    return this.drafts.get(id) ?? null;
  }

  async deleteDraft(id: string): Promise<void> {
    this.drafts.delete(id);
    await this.persist();
  }

  async completePurchase(args: { sessionId: string; draftId: string; amountCents: number; buyerEmail?: string | null }): Promise<CompleteResult | null> {
    const done = this.sessions.get(args.sessionId);
    if (done) {
      const unit = this.units.get(done.unitId);
      return unit ? { applied: false, unit, amountCents: done.amountCents } : null;
    }
    const draft = this.drafts.get(args.draftId);
    if (!draft) return null;
    const previous = this.units.get(draft.unitId);
    if (previous && previous.purchases > draft.purchasesAtCreation) {
      return { applied: false, rejected: "stale", unit: previous, amountCents: args.amountCents };
    }
    const unit: StoredUnit = {
      id: draft.unitId,
      purchases: (previous?.purchases ?? 0) + 1,
      content: draft.content,
      updatedAt: new Date().toISOString(),
      edits: 0,
    };
    this.units.set(unit.id, unit);
    this.sessions.set(args.sessionId, { unitId: unit.id, amountCents: args.amountCents });
    this.log.push({ unitId: unit.id, amountCents: args.amountCents, buyer: draft.content.name, createdAt: unit.updatedAt, userId: draft.userId ?? null, sessionId: args.sessionId, buyerEmail: args.buyerEmail ?? null });
    await this.persist();
    return { applied: true, unit, amountCents: args.amountCents };
  }

  async userPurchases(userId: string, email?: string | null): Promise<UserPurchase[]> {
    const live = this.log.filter((entry) => !entry.released);
    const latest = new Map<string, PurchaseRecord>();
    for (const entry of live) latest.set(entry.unitId, entry);
    return live
      .filter((entry) => belongsTo(entry, userId, email))
      .map((entry) => ({
        unitId: entry.unitId,
        amountCents: entry.amountCents,
        name: entry.buyer,
        createdAt: entry.createdAt,
        current: latest.get(entry.unitId) === entry,
      }))
      .reverse();
  }

  async ownership(unitId: string): Promise<Ownership | null> {
    for (let i = this.log.length - 1; i >= 0; i -= 1) {
      const entry = this.log[i]!;
      if (entry.unitId === unitId && !entry.released) return { sessionId: entry.sessionId ?? "", userId: entry.userId ?? null, buyerEmail: entry.buyerEmail ?? null };
    }
    return null;
  }

  async editContent(unitId: string, content: Content): Promise<StoredUnit | null> {
    const unit = this.units.get(unitId);
    if (!unit || unit.purchases < 1) return null;
    const next: StoredUnit = { ...unit, content, edits: (unit.edits ?? 0) + 1 };
    this.units.set(unitId, next);
    // «Últimas compras» enseña el nombre ACTUAL del anunciante: la última compra del espacio lo sigue.
    for (let i = this.log.length - 1; i >= 0; i -= 1) {
      if (this.log[i]!.unitId === unitId) {
        this.log[i]!.buyer = content.name;
        break;
      }
    }
    await this.persist();
    return next;
  }

  async freeClaims(userId: string): Promise<number> {
    return this.log.filter((entry) => entry.userId === userId && entry.amountCents === 0).length;
  }

  async ownedBy(userId: string, email?: string | null): Promise<string[]> {
    const latest = new Map<string, PurchaseRecord>();
    for (const entry of this.log) if (!entry.released) latest.set(entry.unitId, entry);
    return [...latest.values()]
      .filter((entry) => (this.units.get(entry.unitId)?.purchases ?? 0) > 0 && belongsTo(entry, userId, email))
      .map((entry) => entry.unitId);
  }

  /* ----------------------------------------------------- administración (memoria) */
  protected bans = new Map<string, Ban>();
  protected adminRows: AdminLogEntry[] = [];
  protected pollOptionRows: PollOption[] = DEFAULT_POLL_OPTIONS.map((option) => ({ ...option, active: true }));
  protected pollVotes = new Map<string, { optionId: string; ipHash: string; at: number }>();

  private latestLive(unitId: string): PurchaseRecord | undefined {
    for (let i = this.log.length - 1; i >= 0; i -= 1) {
      const entry = this.log[i]!;
      if (entry.unitId === unitId && !entry.released) return entry;
    }
    return undefined;
  }

  async adminUnits(): Promise<AdminUnit[]> {
    return [...this.units.values()]
      .filter((unit) => unit.purchases > 0 && unit.content)
      .map((unit) => {
        const last = this.latestLive(unit.id);
        const photo = unit.content!.images?.all ?? "";
        return {
          unitId: unit.id,
          purchases: unit.purchases,
          name: unit.content!.name,
          url: unit.content!.url,
          description: unit.content!.description.slice(0, 240),
          photoBytes: Math.round(photo.length * 0.75),
          edits: unit.edits ?? 0,
          updatedAt: unit.updatedAt,
          ownerEmail: last?.buyerEmail ?? null,
          hasAccount: Boolean(last?.userId),
          lastAmountCents: last?.amountCents ?? 0,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async adminPurchases(limit: number): Promise<AdminPurchase[]> {
    return this.log
      .map((entry, index) => ({
        id: String(index + 1),
        unitId: entry.unitId,
        amountCents: entry.amountCents,
        createdAt: entry.createdAt,
        name: entry.buyer,
        email: entry.buyerEmail ?? null,
        hasAccount: Boolean(entry.userId),
        sessionId: entry.sessionId ?? "",
        refundedAt: entry.refundedAt ?? null,
        releasedAt: entry.released ? entry.createdAt : null,
      }))
      .reverse()
      .slice(0, limit);
  }

  async adminAccounts(): Promise<AdminAccount[]> {
    const byKey = new Map<string, AdminAccount>();
    for (const entry of this.log) {
      const key = entry.buyerEmail?.trim().toLowerCase() || entry.userId || "";
      if (!key) continue;
      const row = byKey.get(key) ?? { key, email: entry.buyerEmail ?? null, purchases: 0, freeClaims: 0, paidCents: 0, units: 0, lastAt: entry.createdAt };
      row.purchases += 1;
      if (entry.amountCents === 0) row.freeClaims += 1;
      if (!entry.refundedAt) row.paidCents += entry.amountCents;
      if (entry.createdAt > row.lastAt) row.lastAt = entry.createdAt;
      byKey.set(key, row);
    }
    for (const unit of this.units.values()) {
      if (unit.purchases < 1) continue;
      const last = this.latestLive(unit.id);
      const key = last?.buyerEmail?.trim().toLowerCase() || last?.userId || "";
      const row = key ? byKey.get(key) : undefined;
      if (row) row.units += 1;
    }
    return [...byKey.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }

  async adminStats() {
    const cutoff = Date.now() - 4 * 86_400_000;
    const drafts = [...this.drafts.values()];
    return { drafts: drafts.length, oldDrafts: drafts.filter((d) => Date.parse(d.createdAt) < cutoff).length, bans: this.bans.size };
  }

  async releaseUnit(unitId: string): Promise<boolean> {
    if (!this.units.delete(unitId)) return false;
    for (const entry of this.log) if (entry.unitId === unitId) entry.released = true;
    await this.persist();
    return true;
  }

  async unlockUnit(unitId: string): Promise<boolean> {
    const unit = this.units.get(unitId);
    if (!unit) return false;
    this.units.set(unitId, { ...unit, updatedAt: new Date(Date.now() - 6 * 86_400_000).toISOString() });
    await this.persist();
    return true;
  }

  async getPurchase(purchaseId: string): Promise<PurchaseInfo | null> {
    const index = Number(purchaseId) - 1;
    const entry = this.log[index];
    if (!entry) return null;
    return { id: purchaseId, unitId: entry.unitId, sessionId: entry.sessionId ?? "", amountCents: entry.amountCents, refundedAt: entry.refundedAt ?? null, releasedAt: entry.released ? entry.createdAt : null };
  }

  async markRefunded(purchaseId: string): Promise<boolean> {
    const entry = this.log[Number(purchaseId) - 1];
    if (!entry || entry.refundedAt) return false;
    entry.refundedAt = new Date().toISOString();
    await this.persist();
    return true;
  }

  async listBans(): Promise<Ban[]> {
    return [...this.bans.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async addBan(key: string, reason: string): Promise<void> {
    this.bans.set(key, { key, reason, createdAt: new Date().toISOString() });
  }
  async removeBan(key: string): Promise<boolean> {
    return this.bans.delete(key);
  }
  async adminLog(entry: Omit<AdminLogEntry, "id" | "at">): Promise<void> {
    this.adminRows.push({ ...entry, id: String(this.adminRows.length + 1), at: new Date().toISOString() });
  }
  async listAdminLog(limit: number): Promise<AdminLogEntry[]> {
    return [...this.adminRows].reverse().slice(0, limit);
  }
  async purgeDrafts(olderThanDays: number): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 86_400_000;
    let removed = 0;
    for (const [id, draft] of this.drafts) {
      if (Date.parse(draft.createdAt) < cutoff) {
        this.drafts.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  async pollTally(): Promise<PollTally> {
    const counts = new Map<string, number>();
    for (const vote of this.pollVotes.values()) counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1);
    const options = this.pollOptionRows
      .map((option) => ({ ...option, votes: counts.get(option.id) ?? 0 }))
      .sort((a, b) => b.votes - a.votes);
    return { options, total: [...counts.values()].reduce((sum, n) => sum + n, 0) };
  }
  async castVote(voterKey: string, optionId: string, ipHash: string): Promise<PollVoteResult> {
    if (!this.pollOptionRows.some((option) => option.id === optionId && option.active)) return "unknown";
    const dayAgo = Date.now() - 86_400_000;
    const others = new Set([...this.pollVotes].filter(([key, vote]) => key !== voterKey && vote.ipHash === ipHash && vote.at > dayAgo).map(([key]) => key));
    if (others.size >= 5) return "limit";
    this.pollVotes.set(voterKey, { optionId, ipHash, at: Date.now() });
    return "ok";
  }
  async myVote(voterKey: string): Promise<string | null> {
    return this.pollVotes.get(voterKey)?.optionId ?? null;
  }
  async addPollOption(label: string): Promise<PollOption> {
    const id = pollSlug(label);
    const existing = this.pollOptionRows.find((option) => option.id === id);
    if (existing) {
      existing.active = true;
      return existing;
    }
    const option = { id, label: label.trim(), active: true };
    this.pollOptionRows.push(option);
    return option;
  }
  async setPollOptionActive(id: string, active: boolean): Promise<boolean> {
    const option = this.pollOptionRows.find((candidate) => candidate.id === id);
    if (!option) return false;
    option.active = active;
    return true;
  }
  async resetPoll(): Promise<void> {
    this.pollVotes.clear();
  }

  protected async persist(): Promise<void> {
    /* en memoria no hay nada que guardar */
  }
}

/* ------------------------------------------------------------------ archivo */

export class FileStore extends MemoryStore {
  private loaded = false;

  constructor(private readonly path: string) {
    super();
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const { readFile } = await import("node:fs/promises");
      const data = JSON.parse(await readFile(this.path, "utf8")) as {
        units: StoredUnit[];
        drafts: Draft[];
        sessions: Array<[string, { unitId: string; amountCents: number }]>;
        log?: PurchaseRecord[];
      };
      this.units = new Map(data.units.map((unit) => [unit.id, unit]));
      this.drafts = new Map(data.drafts.map((draft) => [draft.id, draft]));
      this.sessions = new Map(data.sessions);
      this.log = data.log ?? [];
    } catch {
      /* primera ejecución: archivo inexistente */
    }
  }

  override async leaderboards(limit: number) {
    await this.load();
    return super.leaderboards(limit);
  }

  override async listUnits() {
    await this.load();
    return super.listUnits();
  }

  override async getUnit(id: string) {
    await this.load();
    return super.getUnit(id);
  }

  override async saveDraft(draft: Draft) {
    await this.load();
    return super.saveDraft(draft);
  }

  override async getDraft(id: string) {
    await this.load();
    return super.getDraft(id);
  }

  override async deleteDraft(id: string) {
    await this.load();
    return super.deleteDraft(id);
  }

  override async completePurchase(args: { sessionId: string; draftId: string; amountCents: number; buyerEmail?: string | null }) {
    await this.load();
    return super.completePurchase(args);
  }

  override async userPurchases(userId: string, email?: string | null) {
    await this.load();
    return super.userPurchases(userId, email);
  }

  override async ownership(unitId: string) {
    await this.load();
    return super.ownership(unitId);
  }

  override async editContent(unitId: string, content: Content) {
    await this.load();
    return super.editContent(unitId, content);
  }

  override async ownedBy(userId: string, email?: string | null) {
    await this.load();
    return super.ownedBy(userId, email);
  }

  override async freeClaims(userId: string) {
    await this.load();
    return super.freeClaims(userId);
  }

  override async adminUnits() {
    await this.load();
    return super.adminUnits();
  }
  override async adminPurchases(limit: number) {
    await this.load();
    return super.adminPurchases(limit);
  }
  override async adminAccounts() {
    await this.load();
    return super.adminAccounts();
  }
  override async releaseUnit(unitId: string) {
    await this.load();
    return super.releaseUnit(unitId);
  }
  override async unlockUnit(unitId: string) {
    await this.load();
    return super.unlockUnit(unitId);
  }
  override async getPurchase(purchaseId: string) {
    await this.load();
    return super.getPurchase(purchaseId);
  }
  override async markRefunded(purchaseId: string) {
    await this.load();
    return super.markRefunded(purchaseId);
  }

  protected override async persist(): Promise<void> {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(
      this.path,
      JSON.stringify({
        units: [...this.units.values()],
        drafts: [...this.drafts.values()].slice(-200),
        sessions: [...this.sessions.entries()],
        log: this.log.slice(-1000),
      }),
    );
  }
}

/* --------------------------------------------------------------------- Neon */

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<Record<string, unknown>>>;

export class NeonStore implements MarketStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly sql: SqlTag) {}

  /**
   * Deja listo el esquema (idempotente). En frío se hace UNA consulta de sondeo: si
   * tablas, columnas e índices ya existen no se ejecuta ninguna sentencia DDL, que
   * con muchos arranques simultáneos serían bloqueos de esquema inútiles.
   */
  private ensure(): Promise<void> {
    this.ready ??= (async () => {
      const probe = await this.sql`select
        (to_regclass('market_units') is not null and to_regclass('market_drafts') is not null and to_regclass('market_purchases') is not null
          and to_regclass('market_bans') is not null and to_regclass('market_admin_log') is not null
          and to_regclass('poll_options') is not null and to_regclass('poll_votes') is not null) as tables,
        (select count(*)::int from information_schema.columns where table_schema = current_schema() and (
          (table_name = 'market_drafts' and column_name = 'user_id') or
          (table_name = 'market_purchases' and column_name in ('user_id', 'buyer_email', 'refunded_at', 'released_at')) or
          (table_name = 'market_units' and column_name = 'edits'))) as columns,
        (select count(*)::int from pg_indexes where schemaname = current_schema() and indexname in (
          'market_purchases_user_idx', 'market_purchases_unit_idx', 'market_purchases_created_idx', 'market_drafts_created_idx', 'poll_votes_ip_idx')) as indexes`;
      const state = probe[0];
      if (state?.tables === true && Number(state.columns) === 6 && Number(state.indexes) === 5) return;
      await this.sql`create table if not exists market_units (
        id text primary key,
        purchases integer not null default 0,
        content jsonb,
        updated_at timestamptz not null default now()
      )`;
      await this.sql`create table if not exists market_drafts (
        id text primary key,
        unit_id text not null,
        content jsonb not null,
        purchases_at_creation integer not null,
        created_at timestamptz not null default now()
      )`;
      await this.sql`create table if not exists market_purchases (
        id bigserial primary key,
        session_id text not null unique,
        unit_id text not null,
        amount_cents integer not null,
        content jsonb not null,
        created_at timestamptz not null default now()
      )`;
      await this.sql`alter table market_drafts add column if not exists user_id text`;
      await this.sql`alter table market_purchases add column if not exists user_id text`;
      await this.sql`alter table market_purchases add column if not exists buyer_email text`;
      await this.sql`alter table market_units add column if not exists edits integer not null default 0`;
      await this.sql`alter table market_purchases add column if not exists refunded_at timestamptz`;
      await this.sql`alter table market_purchases add column if not exists released_at timestamptz`;
      await this.sql`create table if not exists market_bans (
        key text primary key,
        reason text not null default '',
        created_at timestamptz not null default now()
      )`;
      await this.sql`create table if not exists market_admin_log (
        id bigserial primary key,
        at timestamptz not null default now(),
        admin text not null,
        action text not null,
        target text not null default '',
        detail text not null default ''
      )`;
      await this.sql`create table if not exists poll_options (
        id text primary key,
        label text not null,
        active boolean not null default true,
        sort integer not null default 0,
        created_at timestamptz not null default now()
      )`;
      await this.sql`create table if not exists poll_votes (
        voter_key text primary key,
        option_id text not null,
        ip_hash text not null default '',
        created_at timestamptz not null default now()
      )`;
      await this.sql`create index if not exists poll_votes_ip_idx on poll_votes (ip_hash, created_at)`;
      // Índices de las consultas calientes: dueño actual de un espacio (`unit_id`, último `id`),
      // «últimas compras» (por fecha) y compras de una cuenta; y la limpieza de borradores.
      await this.sql`create index if not exists market_purchases_user_idx on market_purchases (user_id)`;
      await this.sql`create index if not exists market_purchases_unit_idx on market_purchases (unit_id, id desc)`;
      await this.sql`create index if not exists market_purchases_created_idx on market_purchases (created_at desc, id desc)`;
      await this.sql`create index if not exists market_drafts_created_idx on market_drafts (created_at)`;
    })();
    return this.ready;
  }

  private toUnit(row: Record<string, unknown>): StoredUnit {
    return {
      id: String(row.id),
      purchases: Number(row.purchases),
      content: (row.content as Content | null) ?? null,
      updatedAt: new Date(String(row.updated_at)).toISOString(),
      edits: Number(row.edits ?? 0),
    };
  }

  async leaderboards(limit: number): Promise<Leaderboards> {
    await this.ensure();
    // Cinco consultas agregadas en paralelo (sin consultas por fila). El orden y
    // los desempates coinciden con `computeLeaderboards`.
    const [totals, owned, valuable, owners, latest] = await Promise.all([
      this.sql`select (count(*) filter (where released_at is null and refunded_at is null))::int as purchases,
        coalesce(sum(amount_cents) filter (where refunded_at is null), 0)::bigint as revenue from market_purchases`,
      this.sql`with cur as (
        select u.id, u.updated_at, u.content->>'name' as name,
          coalesce(nullif(lower(trim(p.buyer_email)), ''), p.user_id, 'nombre:' || lower(trim(u.content->>'name'))) as owner_key
        from market_units u
        left join lateral (select buyer_email, user_id from market_purchases where unit_id = u.id and released_at is null order by id desc limit 1) p on true
        where u.purchases > 0 and u.content is not null
      )
        select count(*)::int as units, count(distinct owner_key)::int as owners from cur`,
      this.sql`select p.unit_id, max(p.amount_cents)::int as paid, count(*)::int as n, u.content->>'name' as owner
        from market_purchases p left join market_units u on u.id = p.unit_id
        where p.amount_cents > 0 and p.released_at is null and p.refunded_at is null
        group by p.unit_id, u.content->>'name'
        order by paid desc, n desc, p.unit_id asc limit ${limit}`,
      this.sql`with cur as (
        select u.id, u.updated_at, u.content->>'name' as name,
          coalesce(nullif(lower(trim(p.buyer_email)), ''), p.user_id, 'nombre:' || lower(trim(u.content->>'name'))) as owner_key
        from market_units u
        left join lateral (select buyer_email, user_id from market_purchases where unit_id = u.id order by id desc limit 1) p on true
        where u.purchases > 0 and u.content is not null
      )
        select (array_agg(name order by updated_at desc, id asc))[1] as name, count(*)::int as units
        from cur group by owner_key
        order by units desc, name asc limit ${limit}`,
      this.sql`select unit_id, content->>'name' as buyer, amount_cents, created_at
        from market_purchases where released_at is null and refunded_at is null order by created_at desc, id desc limit ${limit}`,
    ]);
    return {
      stats: {
        purchases: Number(totals[0]?.purchases ?? 0),
        unitsOwned: Number(owned[0]?.units ?? 0),
        owners: Number(owned[0]?.owners ?? 0),
        revenueCents: Number(totals[0]?.revenue ?? 0),
      },
      valuable: valuable.map((row) => ({
        unitId: String(row.unit_id),
        paidCents: Number(row.paid),
        purchases: Number(row.n),
        owner: row.owner ? String(row.owner) : null,
      })),
      owners: owners.map((row) => ({ name: String(row.name), units: Number(row.units) })),
      latest: latest.map((row) => ({
        unitId: String(row.unit_id),
        buyer: String(row.buyer ?? ""),
        amountCents: Number(row.amount_cents),
        createdAt: new Date(String(row.created_at)).toISOString(),
      })),
    };
  }

  async listUnits(): Promise<StoredUnit[]> {
    await this.ensure();
    // Sin las fotos (decenas de kB cada una y esta consulta la repite cada visitante cada 25 s): de
    // `images` solo viajan las CLAVES (valor «x») y de `logo` si existe. `view()` no necesita más.
    const rows = await this.sql`select id, purchases, updated_at, edits,
        case when content is null then null else
          (content - 'images' - 'logo') || jsonb_build_object(
            'logo', case when coalesce(content->>'logo', '') <> '' then 'x' else '' end,
            'images', coalesce((select jsonb_object_agg(k, 'x') from jsonb_object_keys(case when jsonb_typeof(content->'images') = 'object' then content->'images' else '{}'::jsonb end) k), '{}'::jsonb)
          ) end as content
      from market_units where purchases > 0`;
    return rows.map((row) => this.toUnit(row));
  }

  async getUnit(id: string): Promise<StoredUnit | null> {
    await this.ensure();
    const rows = await this.sql`select id, purchases, content, updated_at, edits from market_units where id = ${id}`;
    return rows[0] ? this.toUnit(rows[0]) : null;
  }

  private lastCleanup = 0;

  async saveDraft(draft: Draft): Promise<void> {
    await this.ensure();
    // Los borradores (con sus fotos) de pagos que nunca se completaron no se acumulan: se borran los de más de
    // 4 días (Stripe reintenta los avisos hasta 3 días). A lo sumo una vez por hora y arranque.
    if (Date.now() - this.lastCleanup > 3_600_000) {
      this.lastCleanup = Date.now();
      await this.sql`delete from market_drafts where created_at < now() - interval '4 days'`;
    }
    await this.sql`insert into market_drafts (id, unit_id, content, purchases_at_creation, created_at, user_id)
      values (${draft.id}, ${draft.unitId}, ${JSON.stringify(draft.content)}::jsonb, ${draft.purchasesAtCreation}, ${draft.createdAt}, ${draft.userId ?? null})
      on conflict (id) do nothing`;
  }

  async deleteDraft(id: string): Promise<void> {
    await this.ensure();
    await this.sql`delete from market_drafts where id = ${id}`;
  }

  async getDraft(id: string): Promise<Draft | null> {
    await this.ensure();
    const rows = await this.sql`select id, unit_id, content, purchases_at_creation, created_at, user_id from market_drafts where id = ${id}`;
    const row = rows[0];
    return row
      ? {
          id: String(row.id),
          unitId: String(row.unit_id),
          content: row.content as Content,
          purchasesAtCreation: Number(row.purchases_at_creation),
          createdAt: new Date(String(row.created_at)).toISOString(),
          userId: row.user_id ? String(row.user_id) : null,
        }
      : null;
  }

  async completePurchase(args: { sessionId: string; draftId: string; amountCents: number; buyerEmail?: string | null }): Promise<CompleteResult | null> {
    await this.ensure();
    // Una sola sentencia: registra la compra (única por sesión) y, solo si es
    // nueva, sube el contador y sustituye el contenido de la unidad.
    const applied = await this.sql`with inserted as (
        insert into market_purchases (session_id, unit_id, amount_cents, content, user_id, buyer_email)
        select ${args.sessionId}, d.unit_id, ${args.amountCents}, d.content, d.user_id, ${args.buyerEmail ?? null}
        from market_drafts d where d.id = ${args.draftId}
          and not exists (select 1 from market_units mu where mu.id = d.unit_id and mu.purchases > d.purchases_at_creation)
        on conflict (session_id) do nothing
        returning unit_id, content
      )
      insert into market_units (id, purchases, content, updated_at)
      select unit_id, 1, content, now() from inserted
      on conflict (id) do update
        set purchases = market_units.purchases + 1, content = excluded.content, updated_at = now()
      returning id, purchases, content, updated_at, edits`;
    if (applied[0]) return { applied: true, unit: this.toUnit(applied[0]), amountCents: args.amountCents };
    const existing = await this.sql`select u.id, u.purchases, u.content, u.updated_at, u.edits, p.amount_cents
      from market_purchases p join market_units u on u.id = p.unit_id where p.session_id = ${args.sessionId}`;
    const row = existing[0];
    if (row) return { applied: false, unit: this.toUnit(row), amountCents: Number(row.amount_cents) };
    // Sin compra registrada: o no hay borrador, o alguien se adelantó (el pago debe devolverse).
    const stale = await this.sql`select u.id, u.purchases, u.content, u.updated_at, u.edits
      from market_drafts d join market_units u on u.id = d.unit_id
      where d.id = ${args.draftId} and u.purchases > d.purchases_at_creation`;
    return stale[0] ? { applied: false, rejected: "stale", unit: this.toUnit(stale[0]), amountCents: args.amountCents } : null;
  }

  async userPurchases(userId: string, email?: string | null): Promise<UserPurchase[]> {
    await this.ensure();
    const mail = email ? email.trim().toLowerCase() : null;
    const rows = await this.sql`select p.unit_id, p.amount_cents, p.created_at, p.content->>'name' as name,
        (p.id = (select max(q.id) from market_purchases q where q.unit_id = p.unit_id and q.released_at is null)) as current
      from market_purchases p
      where p.released_at is null and (p.user_id = ${userId} or (p.user_id is null and ${mail}::text is not null and lower(p.buyer_email) = ${mail}::text))
      order by p.created_at desc, p.id desc limit 200`;
    return rows.map((row) => ({
      unitId: String(row.unit_id),
      amountCents: Number(row.amount_cents),
      name: String(row.name ?? ""),
      createdAt: new Date(String(row.created_at)).toISOString(),
      current: Boolean(row.current),
    }));
  }

  async ownership(unitId: string): Promise<Ownership | null> {
    await this.ensure();
    const rows = await this.sql`select session_id, user_id, buyer_email from market_purchases where unit_id = ${unitId} and released_at is null order by id desc limit 1`;
    const row = rows[0];
    return row ? { sessionId: String(row.session_id), userId: row.user_id ? String(row.user_id) : null, buyerEmail: row.buyer_email ? String(row.buyer_email) : null } : null;
  }

  async editContent(unitId: string, content: Content): Promise<StoredUnit | null> {
    await this.ensure();
    const rows = await this.sql`update market_units set content = ${JSON.stringify(content)}::jsonb, edits = edits + 1
      where id = ${unitId} and purchases > 0 returning id, purchases, content, updated_at, edits`;
    if (rows[0]) {
      // «Últimas compras» enseña el nombre ACTUAL del anunciante: la última compra del espacio lo sigue.
      await this.sql`update market_purchases set content = ${JSON.stringify(content)}::jsonb
        where id = (select max(id) from market_purchases where unit_id = ${unitId} and released_at is null)`;
    }
    return rows[0] ? this.toUnit(rows[0]) : null;
  }

  async freeClaims(userId: string): Promise<number> {
    await this.ensure();
    const rows = await this.sql`select count(*)::int as n from market_purchases where user_id = ${userId} and amount_cents = 0`;
    return Number(rows[0]?.n ?? 0);
  }

  async ownedBy(userId: string, email?: string | null): Promise<string[]> {
    await this.ensure();
    const mail = email ? email.trim().toLowerCase() : null;
    const rows = await this.sql`select p.unit_id from market_purchases p
      where p.id = (select max(q.id) from market_purchases q where q.unit_id = p.unit_id and q.released_at is null)
        and exists (select 1 from market_units u where u.id = p.unit_id and u.purchases > 0)
        and (p.user_id = ${userId} or (p.user_id is null and ${mail}::text is not null and lower(p.buyer_email) = ${mail}::text))`;
    return rows.map((row) => String(row.unit_id));
  }

  /* ------------------------------------------------ administración y encuesta (Neon) */

  async adminUnits(): Promise<AdminUnit[]> {
    await this.ensure();
    const rows = await this.sql`select u.id, u.purchases, u.updated_at, u.edits,
        u.content->>'name' as name, u.content->>'url' as url, left(coalesce(u.content->>'description', ''), 240) as description,
        coalesce(length(u.content->'images'->>'all'), 0) as photo_len, p.buyer_email, (p.user_id is not null) as has_account, p.amount_cents
      from market_units u
      left join lateral (select buyer_email, user_id, amount_cents from market_purchases where unit_id = u.id and released_at is null order by id desc limit 1) p on true
      where u.purchases > 0 order by u.updated_at desc limit 1000`;
    return rows.map((row) => ({
      unitId: String(row.id),
      purchases: Number(row.purchases),
      name: String(row.name ?? ""),
      url: String(row.url ?? ""),
      description: String(row.description ?? ""),
      photoBytes: Math.round(Number(row.photo_len) * 0.75),
      edits: Number(row.edits ?? 0),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
      ownerEmail: row.buyer_email ? String(row.buyer_email) : null,
      hasAccount: Boolean(row.has_account),
      lastAmountCents: Number(row.amount_cents ?? 0),
    }));
  }

  async adminPurchases(limit: number): Promise<AdminPurchase[]> {
    await this.ensure();
    const rows = await this.sql`select id, unit_id, amount_cents, created_at, content->>'name' as name, buyer_email,
        (user_id is not null) as has_account, session_id, refunded_at, released_at
      from market_purchases order by id desc limit ${limit}`;
    return rows.map((row) => ({
      id: String(row.id),
      unitId: String(row.unit_id),
      amountCents: Number(row.amount_cents),
      createdAt: new Date(String(row.created_at)).toISOString(),
      name: String(row.name ?? ""),
      email: row.buyer_email ? String(row.buyer_email) : null,
      hasAccount: Boolean(row.has_account),
      sessionId: String(row.session_id),
      refundedAt: row.refunded_at ? new Date(String(row.refunded_at)).toISOString() : null,
      releasedAt: row.released_at ? new Date(String(row.released_at)).toISOString() : null,
    }));
  }

  async adminAccounts(): Promise<AdminAccount[]> {
    await this.ensure();
    const [accounts, owned] = await Promise.all([
      this.sql`select coalesce(nullif(lower(trim(buyer_email)), ''), user_id) as key, max(buyer_email) as email,
          count(*)::int as purchases, (count(*) filter (where amount_cents = 0))::int as free_claims,
          coalesce(sum(amount_cents) filter (where refunded_at is null), 0)::bigint as paid, max(created_at) as last_at
        from market_purchases where coalesce(nullif(lower(trim(buyer_email)), ''), user_id) is not null
        group by 1 order by last_at desc limit 500`,
      this.sql`select coalesce(nullif(lower(trim(p.buyer_email)), ''), p.user_id) as key, count(*)::int as units
        from market_units u
        join lateral (select buyer_email, user_id from market_purchases where unit_id = u.id and released_at is null order by id desc limit 1) p on true
        where u.purchases > 0 group by 1`,
    ]);
    const units = new Map(owned.map((row) => [String(row.key), Number(row.units)]));
    return accounts.map((row) => ({
      key: String(row.key),
      email: row.email ? String(row.email) : null,
      purchases: Number(row.purchases),
      freeClaims: Number(row.free_claims),
      paidCents: Number(row.paid),
      units: units.get(String(row.key)) ?? 0,
      lastAt: new Date(String(row.last_at)).toISOString(),
    }));
  }

  async adminStats() {
    await this.ensure();
    const [drafts, bans] = await Promise.all([
      this.sql`select count(*)::int as n, (count(*) filter (where created_at < now() - interval '4 days'))::int as old from market_drafts`,
      this.sql`select count(*)::int as n from market_bans`,
    ]);
    return { drafts: Number(drafts[0]?.n ?? 0), oldDrafts: Number(drafts[0]?.old ?? 0), bans: Number(bans[0]?.n ?? 0) };
  }

  async releaseUnit(unitId: string): Promise<boolean> {
    await this.ensure();
    const rows = await this.sql`with gone as (delete from market_units where id = ${unitId} returning id),
        marked as (update market_purchases set released_at = now() where unit_id = ${unitId} and released_at is null and exists (select 1 from gone) returning id)
      select (select count(*)::int from gone) as removed`;
    return Number(rows[0]?.removed ?? 0) > 0;
  }

  async unlockUnit(unitId: string): Promise<boolean> {
    await this.ensure();
    const rows = await this.sql`update market_units set updated_at = now() - interval '6 days' where id = ${unitId} and purchases > 0 returning id`;
    return rows.length > 0;
  }

  async getPurchase(purchaseId: string): Promise<PurchaseInfo | null> {
    await this.ensure();
    if (!/^\d{1,12}$/.test(purchaseId)) return null;
    const rows = await this.sql`select id, unit_id, session_id, amount_cents, refunded_at, released_at from market_purchases where id = ${purchaseId}`;
    const row = rows[0];
    return row
      ? {
          id: String(row.id),
          unitId: String(row.unit_id),
          sessionId: String(row.session_id),
          amountCents: Number(row.amount_cents),
          refundedAt: row.refunded_at ? new Date(String(row.refunded_at)).toISOString() : null,
          releasedAt: row.released_at ? new Date(String(row.released_at)).toISOString() : null,
        }
      : null;
  }

  async markRefunded(purchaseId: string): Promise<boolean> {
    await this.ensure();
    if (!/^\d{1,12}$/.test(purchaseId)) return false;
    const rows = await this.sql`update market_purchases set refunded_at = now() where id = ${purchaseId} and refunded_at is null returning id`;
    return rows.length > 0;
  }

  async listBans(): Promise<Ban[]> {
    await this.ensure();
    const rows = await this.sql`select key, reason, created_at from market_bans order by created_at desc`;
    return rows.map((row) => ({ key: String(row.key), reason: String(row.reason ?? ""), createdAt: new Date(String(row.created_at)).toISOString() }));
  }
  async addBan(key: string, reason: string): Promise<void> {
    await this.ensure();
    await this.sql`insert into market_bans (key, reason) values (${key}, ${reason}) on conflict (key) do update set reason = excluded.reason`;
  }
  async removeBan(key: string): Promise<boolean> {
    await this.ensure();
    const rows = await this.sql`delete from market_bans where key = ${key} returning key`;
    return rows.length > 0;
  }

  async adminLog(entry: Omit<AdminLogEntry, "id" | "at">): Promise<void> {
    await this.ensure();
    await this.sql`insert into market_admin_log (admin, action, target, detail) values (${entry.admin}, ${entry.action}, ${entry.target}, ${entry.detail.slice(0, 500)})`;
  }
  async listAdminLog(limit: number): Promise<AdminLogEntry[]> {
    await this.ensure();
    const rows = await this.sql`select id, at, admin, action, target, detail from market_admin_log order by id desc limit ${limit}`;
    return rows.map((row) => ({
      id: String(row.id),
      at: new Date(String(row.at)).toISOString(),
      admin: String(row.admin),
      action: String(row.action),
      target: String(row.target ?? ""),
      detail: String(row.detail ?? ""),
    }));
  }

  async purgeDrafts(olderThanDays: number): Promise<number> {
    await this.ensure();
    const days = Math.max(1, Math.floor(olderThanDays));
    const rows = await this.sql`delete from market_drafts where created_at < now() - make_interval(days => ${days}) returning id`;
    return rows.length;
  }

  /** Las ciudades por defecto se siembran la primera vez que se usa la encuesta. */
  private pollSeeded = false;
  private async seedPoll(): Promise<void> {
    if (this.pollSeeded) return;
    this.pollSeeded = true;
    // Una sola sentencia: «solo si la tabla está vacía» se evalúa una vez para TODAS las ciudades
    // (con una sentencia por ciudad, la segunda ya encontraba la tabla con la primera y se saltaba).
    const ids = DEFAULT_POLL_OPTIONS.map((option) => option.id);
    const labels = DEFAULT_POLL_OPTIONS.map((option) => option.label);
    const orders = DEFAULT_POLL_OPTIONS.map((_, index) => index + 1);
    await this.sql`insert into poll_options (id, label, sort)
      select o.id, o.label, o.sort from unnest(${ids}::text[], ${labels}::text[], ${orders}::int[]) as o(id, label, sort)
      where not exists (select 1 from poll_options)
      on conflict (id) do nothing`;
  }

  async pollTally(): Promise<PollTally> {
    await this.ensure();
    await this.seedPoll();
    const rows = await this.sql`select o.id, o.label, o.active, count(v.voter_key)::int as votes
      from poll_options o left join poll_votes v on v.option_id = o.id
      group by o.id, o.label, o.active, o.sort order by votes desc, o.sort asc, o.label asc`;
    const options = rows.map((row) => ({ id: String(row.id), label: String(row.label), active: Boolean(row.active), votes: Number(row.votes) }));
    return { options, total: options.reduce((sum, option) => sum + option.votes, 0) };
  }

  async castVote(voterKey: string, optionId: string, ipHash: string): Promise<PollVoteResult> {
    await this.ensure();
    await this.seedPoll();
    const option = await this.sql`select 1 from poll_options where id = ${optionId} and active`;
    if (option.length === 0) return "unknown";
    // Como mucho 5 votantes distintos por origen y día: frena el voto masivo borrando cookies.
    const others = await this.sql`select count(distinct voter_key)::int as n from poll_votes
      where ip_hash = ${ipHash} and voter_key <> ${voterKey} and created_at > now() - interval '1 day'`;
    if (Number(others[0]?.n ?? 0) >= 5) return "limit";
    await this.sql`insert into poll_votes (voter_key, option_id, ip_hash) values (${voterKey}, ${optionId}, ${ipHash})
      on conflict (voter_key) do update set option_id = excluded.option_id, ip_hash = excluded.ip_hash, created_at = now()`;
    return "ok";
  }

  async myVote(voterKey: string): Promise<string | null> {
    await this.ensure();
    const rows = await this.sql`select option_id from poll_votes where voter_key = ${voterKey}`;
    return rows[0] ? String(rows[0].option_id) : null;
  }

  async addPollOption(label: string): Promise<PollOption> {
    await this.ensure();
    await this.seedPoll();
    const id = pollSlug(label);
    const rows = await this.sql`insert into poll_options (id, label, sort) values (${id}, ${label.trim()}, (select coalesce(max(sort), 0) + 1 from poll_options))
      on conflict (id) do update set active = true returning id, label, active`;
    return { id: String(rows[0]!.id), label: String(rows[0]!.label), active: Boolean(rows[0]!.active) };
  }

  async setPollOptionActive(id: string, active: boolean): Promise<boolean> {
    await this.ensure();
    const rows = await this.sql`update poll_options set active = ${active} where id = ${id} returning id`;
    return rows.length > 0;
  }

  async resetPoll(): Promise<void> {
    await this.ensure();
    await this.sql`delete from poll_votes`;
  }
}
