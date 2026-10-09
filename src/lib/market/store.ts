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
export type PurchaseRecord = { unitId: string; amountCents: number; buyer: string; createdAt: string; userId?: string | null; sessionId?: string; buyerEmail?: string | null };

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
  const perUnit = new Map<string, { paid: number; n: number }>();
  for (const entry of log) {
    const current = perUnit.get(entry.unitId) ?? { paid: 0, n: 0 };
    perUnit.set(entry.unitId, { paid: Math.max(current.paid, entry.amountCents), n: current.n + 1 });
  }
  const byOwner = new Map<string, { name: string; units: number }>();
  for (const unit of owned) {
    const name = unit.content!.name;
    const key = ownerKey(name);
    const current = byOwner.get(key);
    if (current) current.units += 1;
    else byOwner.set(key, { name, units: 1 });
  }
  const ownerOf = new Map(owned.map((unit) => [unit.id, unit.content!.name]));
  return {
    stats: {
      purchases: log.length,
      unitsOwned: owned.length,
      owners: byOwner.size,
      revenueCents: log.reduce((sum, entry) => sum + entry.amountCents, 0),
    },
    valuable: [...perUnit]
      .map(([unitId, value]) => ({ unitId, paidCents: value.paid, purchases: value.n, owner: ownerOf.get(unitId) ?? null }))
      .sort((a, b) => b.paidCents - a.paidCents || b.purchases - a.purchases || a.unitId.localeCompare(b.unitId))
      .slice(0, limit),
    owners: [...byOwner.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name)).slice(0, limit),
    latest: [...log]
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

export interface MarketStore {
  leaderboards(limit: number): Promise<Leaderboards>;
  listUnits(): Promise<StoredUnit[]>;
  getUnit(id: string): Promise<StoredUnit | null>;
  saveDraft(draft: Draft): Promise<void>;
  getDraft(id: string): Promise<Draft | null>;
  completePurchase(args: { sessionId: string; draftId: string; amountCents: number; buyerEmail?: string | null }): Promise<CompleteResult | null>;
  userPurchases(userId: string, email?: string | null): Promise<UserPurchase[]>;
  /** Dueño actual del espacio (última compra) o `null`. */
  ownership(unitId: string): Promise<Ownership | null>;
  /** Cambia el contenido del anuncio sin tocar compras, precio ni protección. */
  editContent(unitId: string, content: Content): Promise<StoredUnit | null>;
  /** Espacios que posee ahora la cuenta. */
  ownedBy(userId: string, email?: string | null): Promise<string[]>;
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
    const latest = new Map<string, PurchaseRecord>();
    for (const entry of this.log) latest.set(entry.unitId, entry);
    return this.log
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
      if (entry.unitId === unitId) return { sessionId: entry.sessionId ?? "", userId: entry.userId ?? null, buyerEmail: entry.buyerEmail ?? null };
    }
    return null;
  }

  async editContent(unitId: string, content: Content): Promise<StoredUnit | null> {
    const unit = this.units.get(unitId);
    if (!unit || unit.purchases < 1) return null;
    const next: StoredUnit = { ...unit, content, edits: (unit.edits ?? 0) + 1 };
    this.units.set(unitId, next);
    await this.persist();
    return next;
  }

  async ownedBy(userId: string, email?: string | null): Promise<string[]> {
    const latest = new Map<string, PurchaseRecord>();
    for (const entry of this.log) latest.set(entry.unitId, entry);
    return [...latest.values()].filter((entry) => belongsTo(entry, userId, email)).map((entry) => entry.unitId);
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

  /** Crea las tablas la primera vez (idempotente). */
  private ensure(): Promise<void> {
    this.ready ??= (async () => {
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
      await this.sql`create index if not exists market_purchases_user_idx on market_purchases (user_id)`;
      await this.sql`alter table market_purchases add column if not exists buyer_email text`;
      await this.sql`alter table market_units add column if not exists edits integer not null default 0`;
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
      this.sql`select count(*)::int as purchases, coalesce(sum(amount_cents), 0)::bigint as revenue from market_purchases`,
      this.sql`select count(*)::int as units, count(distinct lower(trim(content->>'name')))::int as owners
        from market_units where purchases > 0 and content is not null`,
      this.sql`select p.unit_id, max(p.amount_cents)::int as paid, count(*)::int as n, u.content->>'name' as owner
        from market_purchases p left join market_units u on u.id = p.unit_id
        group by p.unit_id, u.content->>'name'
        order by paid desc, n desc, p.unit_id asc limit ${limit}`,
      this.sql`select min(content->>'name') as name, count(*)::int as units
        from market_units where purchases > 0 and content is not null
        group by lower(trim(content->>'name'))
        order by units desc, name asc limit ${limit}`,
      this.sql`select unit_id, content->>'name' as buyer, amount_cents, created_at
        from market_purchases order by created_at desc, id desc limit ${limit}`,
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
    const rows = await this.sql`select id, purchases, content, updated_at, edits from market_units where purchases > 0`;
    return rows.map((row) => this.toUnit(row));
  }

  async getUnit(id: string): Promise<StoredUnit | null> {
    await this.ensure();
    const rows = await this.sql`select id, purchases, content, updated_at, edits from market_units where id = ${id}`;
    return rows[0] ? this.toUnit(rows[0]) : null;
  }

  async saveDraft(draft: Draft): Promise<void> {
    await this.ensure();
    await this.sql`insert into market_drafts (id, unit_id, content, purchases_at_creation, created_at, user_id)
      values (${draft.id}, ${draft.unitId}, ${JSON.stringify(draft.content)}::jsonb, ${draft.purchasesAtCreation}, ${draft.createdAt}, ${draft.userId ?? null})
      on conflict (id) do nothing`;
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
        (p.id = (select max(q.id) from market_purchases q where q.unit_id = p.unit_id)) as current
      from market_purchases p
      where p.user_id = ${userId} or (p.user_id is null and ${mail}::text is not null and lower(p.buyer_email) = ${mail}::text)
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
    const rows = await this.sql`select session_id, user_id, buyer_email from market_purchases where unit_id = ${unitId} order by id desc limit 1`;
    const row = rows[0];
    return row ? { sessionId: String(row.session_id), userId: row.user_id ? String(row.user_id) : null, buyerEmail: row.buyer_email ? String(row.buyer_email) : null } : null;
  }

  async editContent(unitId: string, content: Content): Promise<StoredUnit | null> {
    await this.ensure();
    const rows = await this.sql`update market_units set content = ${JSON.stringify(content)}::jsonb, edits = edits + 1
      where id = ${unitId} and purchases > 0 returning id, purchases, content, updated_at, edits`;
    return rows[0] ? this.toUnit(rows[0]) : null;
  }

  async ownedBy(userId: string, email?: string | null): Promise<string[]> {
    await this.ensure();
    const mail = email ? email.trim().toLowerCase() : null;
    const rows = await this.sql`select p.unit_id from market_purchases p
      where p.id = (select max(q.id) from market_purchases q where q.unit_id = p.unit_id)
        and (p.user_id = ${userId} or (p.user_id is null and ${mail}::text is not null and lower(p.buyer_email) = ${mail}::text))`;
    return rows.map((row) => String(row.unit_id));
  }
}
