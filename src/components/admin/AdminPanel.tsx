"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban as BanIcon,
  BarChart3,
  ClipboardList,
  CreditCard,
  ExternalLink,
  LayoutGrid,
  LockOpen,
  Pencil,
  RefreshCw,
  Trash2,
  Undo2,
  Users,
  Vote,
  X,
} from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/money";
import type { AdminAccountRow, AdminOverview, AdminPurchaseRow, AdminUnitRow } from "@/lib/admin/service";
import type { AdminLogEntry, Ban, PollTally } from "@/lib/market/store";

/* ------------------------------------------------------------------ API */

async function request<T>(init: RequestInit, url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "No se pudo completar la operación.");
  return data;
}
const read = <T,>(view: string) => request<T>({}, `/api/admin?view=${view}`);
const act = <T = { ok: true }>(body: Record<string, unknown>) =>
  request<T>({ method: "POST", headers: { "Content-Type": "application/json", "x-admin-request": "1" }, body: JSON.stringify(body) }, "/api/admin");

const when = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const money = (cents: number) => (cents === 0 ? "Gratis" : formatCents(cents));

/* ------------------------------------------------------------ piezas sueltas */

const TABS = [
  { id: "overview", label: "Resumen", icon: BarChart3 },
  { id: "units", label: "Espacios", icon: LayoutGrid },
  { id: "purchases", label: "Compras", icon: CreditCard },
  { id: "accounts", label: "Cuentas", icon: Users },
  { id: "poll", label: "Encuesta", icon: Vote },
  { id: "log", label: "Registro", icon: ClipboardList },
] as const;
type TabId = (typeof TABS)[number]["id"];

const buttonBase =
  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50";
const ghost = `${buttonBase} border-line-strong text-ink hover:border-accent/60 hover:text-accent-ink`;
const danger = `${buttonBase} border-danger/50 text-danger hover:bg-danger/10`;
const primary = `${buttonBase} border-transparent bg-accent text-on-accent hover:brightness-105`;
const field = "h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink outline-none transition-colors focus:border-accent/70 focus:ring-2 focus:ring-accent/20";

function Badge({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "ok" | "warn" | "bad" | "free" }) {
  const tones = {
    plain: "border-line-strong text-muted",
    ok: "border-available/50 text-available",
    warn: "border-premium/50 text-premium",
    bad: "border-danger/50 text-danger",
    free: "border-[#e8b90c]/60 text-[#e8b90c]",
  } as const;
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs", tones[tone])}>{children}</span>;
}

function Stat({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "bad" | undefined }) {
  return (
    <div className="rounded-2xl border border-line bg-surface/60 p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("display-face tnum mt-1 text-[1.7rem] font-medium leading-none tracking-[-0.03em]", tone === "bad" ? "text-danger" : "text-ink")}>{value}</p>
      {note ? <p className="mt-1.5 text-xs text-subtle">{note}</p> : null}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-3xl border border-line-strong bg-surface p-6 shadow-[var(--shadow-float)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="display-face text-[1.35rem] font-medium tracking-[-0.02em] text-ink">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-full p-1.5 text-muted hover:bg-sunken hover:text-ink">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center text-sm text-muted">{children}</p>;
}

/* ---------------------------------------------------------------- el panel */

type Toast = { kind: "ok" | "error"; text: string };

export function AdminPanel({ adminEmail }: { adminEmail: string }) {
  const [tab, setTab] = useState<TabId>("overview");
  const [toast, setToast] = useState<Toast | null>(null);
  const [version, setVersion] = useState(0);
  const notify = useCallback((next: Toast) => {
    setToast(next);
    window.setTimeout(() => setToast((current) => (current === next ? null : current)), 6000);
  }, []);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  /** Ejecuta una acción, avisa del resultado y recarga los datos. */
  const run = useCallback(
    async (body: Record<string, unknown>, success: string | ((result: Record<string, unknown>) => string)) => {
      try {
        const result = await act<Record<string, unknown>>(body);
        notify({ kind: "ok", text: typeof success === "function" ? success(result) : success });
        refresh();
        return true;
      } catch (failure) {
        notify({ kind: "error", text: failure instanceof Error ? failure.message : "No se pudo completar la operación." });
        return false;
      }
    },
    [notify, refresh],
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-ivory/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-4 px-4 sm:px-8">
          <Link href="/" aria-label="Inicio" className="shrink-0">
            <Wordmark size="sm" />
          </Link>
          <span className="rounded-full border border-accent/50 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent-ink">Administración</span>
          <span className="ml-auto hidden truncate text-sm text-muted sm:inline">{adminEmail}</span>
          <button type="button" onClick={refresh} className={ghost} aria-label="Actualizar datos">
            <RefreshCw size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[88rem] gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Secciones del panel" className="flex gap-1 overflow-x-auto lg:sticky lg:top-20 lg:flex-col lg:self-start">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm transition-colors",
                tab === id ? "bg-accent/12 font-medium text-accent-ink" : "text-muted hover:bg-sunken hover:text-ink",
              )}
            >
              <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        <main className="min-w-0">
          {tab === "overview" ? <Overview key={version} run={run} /> : null}
          {tab === "units" ? <Units key={version} run={run} /> : null}
          {tab === "purchases" ? <Purchases key={version} run={run} /> : null}
          {tab === "accounts" ? <Accounts key={version} run={run} /> : null}
          {tab === "poll" ? <PollAdmin key={version} run={run} /> : null}
          {tab === "log" ? <Log key={version} /> : null}
        </main>
      </div>

      {toast ? (
        <div role="status" className={cn("fixed bottom-5 left-1/2 z-[60] max-w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border bg-surface px-4 py-3 text-sm text-ink shadow-[var(--shadow-float)]", toast.kind === "ok" ? "border-available/50" : "border-danger/50")}>
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

type Run = (body: Record<string, unknown>, success: string | ((result: Record<string, unknown>) => string)) => Promise<boolean>;

/** Carga una vista del panel y la pinta cuando llega (o enseña el error). */
function useView<T>(view: string): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    read<T>(view)
      .then((value) => alive && setData(value))
      .catch((failure: unknown) => alive && setError(failure instanceof Error ? failure.message : "No se pudo cargar."));
    return () => {
      alive = false;
    };
  }, [view]);
  return { data, error };
}

function Loading({ error }: { error: string | null }) {
  return error ? <Empty>{error}</Empty> : <p className="text-sm text-muted">Cargando…</p>;
}

/* ------------------------------------------------------------------ Resumen */

function Overview({ run }: { run: Run }) {
  const { data, error } = useView<AdminOverview>("overview");
  const [busy, setBusy] = useState(false);
  if (!data) return <Loading error={error} />;
  return (
    <section aria-labelledby="t-resumen">
      <h1 id="t-resumen" className="display-face text-[1.9rem] font-medium tracking-[-0.03em] text-ink sm:text-[2.4rem]">Resumen</h1>
      <div className="mt-5 flex flex-wrap gap-2">
        <Badge tone={data.stripeMode === "producción" ? "ok" : "warn"}>Stripe: {data.stripeMode}</Badge>
        <Badge tone={data.purchasesEnabled ? "ok" : "bad"}>Compras {data.purchasesEnabled ? "activadas" : "desactivadas"}</Badge>
        <Badge>{data.admins} {data.admins === 1 ? "administrador" : "administradores"}</Badge>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Ingresos" value={formatCents(data.revenueCents)} note="Sin contar devoluciones" />
        <Stat label="Compras de pago" value={data.paidPurchases} note={`${data.freeClaims} reclamaciones gratis`} />
        <Stat label="Espacios con anuncio" value={data.unitsOwned.toLocaleString("es-ES")} note={`${data.owners} ${data.owners === 1 ? "propietario" : "propietarios"}`} />
        <Stat label="Gratis sin reclamar" value={`${data.freeLeft} / ${data.freeTotal}`} />
        <Stat label="Cuentas bloqueadas" value={data.bans} tone={data.bans > 0 ? "bad" : undefined} />
        <Stat label="Votos de la encuesta" value={data.pollVotes} />
        <Stat label="Borradores sin pagar" value={data.drafts} note={data.oldDrafts > 0 ? `${data.oldDrafts} de más de 4 días` : "Ninguno antiguo"} />
        <Stat label="Catálogo" value={(data.catalog.buildings + data.catalog.parcels + data.catalog.walls + data.catalog.mobile).toLocaleString("es-ES")} note="Espacios a la venta" />
      </div>
      <div className="mt-8 rounded-2xl border border-line p-5">
        <h2 className="text-base font-medium text-ink">Mantenimiento</h2>
        <p className="mt-1 text-sm text-muted">Los borradores son intentos de compra que no se pagaron; se borran solos a los 4 días. Aquí puedes vaciarlos antes.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || data.drafts === 0}
            className={ghost}
            onClick={async () => {
              setBusy(true);
              await run({ action: "purge-drafts", days: 1 }, (result) => `Borradores eliminados: ${String(result.removed ?? 0)}`);
              setBusy(false);
            }}
          >
            <Trash2 size={14} aria-hidden="true" /> Borrar los de más de 1 día
          </button>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Espacios */

type UnitFilter = "todos" | "gratis" | "pago" | "protegidos" | "foto";

function Units({ run }: { run: Run }) {
  const { data, error } = useView<AdminUnitRow[]>("units");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UnitFilter>("todos");
  const [editing, setEditing] = useState<AdminUnitRow | null>(null);
  const [releasing, setReleasing] = useState<AdminUnitRow | null>(null);
  const [banning, setBanning] = useState<{ key: string; label: string } | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((row) => {
      if (filter === "gratis" && row.lastAmountCents !== 0) return false;
      if (filter === "pago" && row.lastAmountCents === 0) return false;
      if (filter === "protegidos" && !row.lockedUntil) return false;
      if (filter === "foto" && row.photoBytes === 0) return false;
      return !q || [row.name, row.label, row.unitId, row.ownerEmail ?? "", row.url].some((text) => text.toLowerCase().includes(q));
    });
  }, [data, query, filter]);

  if (!data) return <Loading error={error} />;
  const chips: Array<[UnitFilter, string]> = [["todos", "Todos"], ["gratis", "Gratis"], ["pago", "De pago"], ["protegidos", "Protegidos"], ["foto", "Con foto"]];

  return (
    <section aria-labelledby="t-espacios">
      <h1 id="t-espacios" className="display-face text-[1.9rem] font-medium tracking-[-0.03em] text-ink sm:text-[2.4rem]">Espacios con anuncio</h1>
      <p className="mt-1 text-sm text-muted">{data.length} {data.length === 1 ? "espacio" : "espacios"} con anuncio ahora mismo.</p>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input className={cn(field, "max-w-xs")} placeholder="Buscar por nombre, espacio, correo o web" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar espacios" />
        {chips.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} aria-pressed={filter === id} className={cn(buttonBase, filter === id ? "border-accent/60 bg-accent/10 text-accent-ink" : "border-line-strong text-muted hover:text-ink")}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        {rows.length === 0 ? <Empty>No hay espacios con esos criterios.</Empty> : null}
        {rows.map((row) => (
          <article key={row.unitId} className="rounded-2xl border border-line bg-surface/50 p-4">
            <div className="flex flex-wrap items-start gap-4">
              {row.photoBytes > 0 ? (
                // Foto del anunciante servida por la propia web.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/market/image?unit=${encodeURIComponent(row.unitId)}&face=all&v=${row.rev}`} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-line object-cover" />
              ) : (
                <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-line-strong text-xs text-subtle">Sin foto</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-medium text-ink">{row.name}</h3>
                  {row.free || row.lastAmountCents === 0 ? <Badge tone="free">Gratis</Badge> : <Badge tone="ok">{formatCents(row.lastAmountCents)}</Badge>}
                  {row.lockedUntil ? <Badge tone="warn">Protegido hasta {when(row.lockedUntil)}</Badge> : null}
                  {row.edits > 0 ? <Badge>{row.edits} {row.edits === 1 ? "edición" : "ediciones"}</Badge> : null}
                </div>
                <p className="mt-0.5 truncate text-sm text-muted">{row.kind} · {row.label}</p>
                <p className="mt-1 truncate text-sm text-subtle">
                  {row.ownerEmail ?? "Sin correo"} {row.hasAccount ? "· con cuenta" : "· invitado"} · {when(row.updatedAt)}
                </p>
                {row.url ? <p className="truncate text-xs text-subtle">{row.url}</p> : null}
                {row.description ? <p className="mt-1 line-clamp-2 text-sm text-muted">{row.description}</p> : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Link href={`/city/malaga/viewer?unit=${encodeURIComponent(row.unitId)}`} target="_blank" rel="noopener" className={ghost}>
                  <ExternalLink size={13} aria-hidden="true" /> Ver
                </Link>
                <button type="button" className={ghost} onClick={() => setEditing(row)}>
                  <Pencil size={13} aria-hidden="true" /> Editar
                </button>
                {row.lockedUntil ? (
                  <button type="button" className={ghost} onClick={() => void run({ action: "unlock", unitId: row.unitId }, "Protección quitada.")}>
                    <LockOpen size={13} aria-hidden="true" /> Quitar protección
                  </button>
                ) : null}
                <button type="button" className={danger} onClick={() => setReleasing(row)}>
                  <Undo2 size={13} aria-hidden="true" /> Retirar
                </button>
                {row.ownerEmail ? (
                  <button type="button" className={danger} onClick={() => setBanning({ key: row.ownerEmail!, label: row.ownerEmail! })}>
                    <BanIcon size={13} aria-hidden="true" /> Bloquear
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>

      {editing ? <EditUnit unit={editing} onClose={() => setEditing(null)} run={run} /> : null}
      {releasing ? <ReleaseUnit unit={releasing} onClose={() => setReleasing(null)} run={run} /> : null}
      {banning ? <BanDialog target={banning} onClose={() => setBanning(null)} run={run} /> : null}
    </section>
  );
}

function EditUnit({ unit, onClose, run }: { unit: AdminUnitRow; onClose: () => void; run: Run }) {
  const [name, setName] = useState(unit.name);
  const [url, setUrl] = useState(unit.url);
  const [description, setDescription] = useState(unit.description);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Editar · ${unit.label}`} onClose={onClose}>
      <p className="mb-4 text-sm text-muted">Corrige o recorta el anuncio (moderación). Cumple las mismas reglas que una compra.</p>
      <div className="space-y-3">
        <label className="block text-sm"><span className="text-muted">Nombre</span><input className={field} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /></label>
        <label className="block text-sm"><span className="text-muted">Web</span><input className={field} value={url} maxLength={300} onChange={(event) => setUrl(event.target.value)} /></label>
        <label className="block text-sm"><span className="text-muted">Descripción</span><textarea className={cn(field, "h-24 py-2")} value={description} maxLength={600} onChange={(event) => setDescription(event.target.value)} /></label>
        {unit.photoBytes > 0 ? (
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={removePhoto} onChange={(event) => setRemovePhoto(event.target.checked)} className="h-4 w-4 accent-[var(--c-accent)]" /> Quitar la foto</label>
        ) : null}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={ghost} onClick={onClose}>Cancelar</button>
        <button
          type="button"
          className={primary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await run({ action: "edit-unit", unitId: unit.unitId, name, url, description, removePhoto }, "Anuncio actualizado.");
            setBusy(false);
            if (ok) onClose();
          }}
        >
          Guardar
        </button>
      </div>
    </Modal>
  );
}

function ReleaseUnit({ unit, onClose, run }: { unit: AdminUnitRow; onClose: () => void; run: Run }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Retirar anuncio" onClose={onClose}>
      <p className="text-sm text-muted">
        «{unit.name}» desaparece del mapa y de las listas, y {unit.label} vuelve a estar {unit.free ? "gratis" : "disponible por 1,00 €"}. El historial de pagos se conserva. <strong className="text-ink">No devuelve el dinero</strong>: para eso, usa «Reembolsar» en Compras.
      </p>
      <label className="mt-4 block text-sm"><span className="text-muted">Motivo (queda en el registro)</span><input className={field} value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="Contenido ofensivo, marca ajena…" /></label>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={ghost} onClick={onClose}>Cancelar</button>
        <button
          type="button"
          className={danger}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await run({ action: "release", unitId: unit.unitId, reason }, "Anuncio retirado: el espacio vuelve a estar disponible.");
            setBusy(false);
            if (ok) onClose();
          }}
        >
          Retirar anuncio
        </button>
      </div>
    </Modal>
  );
}

function BanDialog({ target, onClose, run }: { target: { key: string; label: string }; onClose: () => void; run: Run }) {
  const [reason, setReason] = useState("");
  const [releaseUnits, setReleaseUnits] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Bloquear cuenta" onClose={onClose}>
      <p className="text-sm text-muted">
        <span className="font-medium text-ink">{target.label}</span> no podrá entrar, comprar, reclamar espacios gratis ni editar. Si paga igualmente, el pago se devuelve y no se publica nada.
      </p>
      <label className="mt-4 block text-sm"><span className="text-muted">Motivo (queda en el registro)</span><input className={field} value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} /></label>
      <label className="mt-3 flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={releaseUnits} onChange={(event) => setReleaseUnits(event.target.checked)} className="h-4 w-4 accent-[var(--c-accent)]" /> Retirar también todos sus anuncios</label>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={ghost} onClick={onClose}>Cancelar</button>
        <button
          type="button"
          className={danger}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await run({ action: "ban", key: target.key, reason, releaseUnits }, (result) => `Cuenta bloqueada${Number(result.released) > 0 ? ` · anuncios retirados: ${String(result.released)}` : ""}.`);
            setBusy(false);
            if (ok) onClose();
          }}
        >
          Bloquear
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Compras */

function Purchases({ run }: { run: Run }) {
  const { data, error } = useView<AdminPurchaseRow[]>("purchases");
  const [query, setQuery] = useState("");
  const [refunding, setRefunding] = useState<AdminPurchaseRow | null>(null);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((row) => !q || [row.name, row.label, row.unitId, row.email ?? "", row.session].some((text) => text.toLowerCase().includes(q)));
  }, [data, query]);
  if (!data) return <Loading error={error} />;
  return (
    <section aria-labelledby="t-compras">
      <h1 id="t-compras" className="display-face text-[1.9rem] font-medium tracking-[-0.03em] text-ink sm:text-[2.4rem]">Compras</h1>
      <p className="mt-1 text-sm text-muted">Todas las compras y reclamaciones, de la más reciente a la más antigua.</p>
      <input className={cn(field, "mt-5 max-w-xs")} placeholder="Buscar por anunciante, espacio, correo…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar compras" />
      <div className="mt-5 space-y-2">
        {rows.length === 0 ? <Empty>No hay compras con esos criterios.</Empty> : null}
        {rows.map((row) => (
          <article key={row.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-line bg-surface/50 px-4 py-3">
            <div className="min-w-0 flex-1 basis-60">
              <p className="truncate text-sm font-medium text-ink">{row.name || "(sin nombre)"} <span className="font-normal text-muted">· {row.label}</span></p>
              <p className="truncate text-xs text-subtle">{when(row.createdAt)} · {row.email ?? "sin correo"} {row.hasAccount ? "· con cuenta" : row.free ? "" : "· invitado"} · {row.session}</p>
            </div>
            <div className="flex items-center gap-2">
              {row.refundedAt ? <Badge tone="bad">Devuelta</Badge> : row.releasedAt ? <Badge tone="warn">Anuncio retirado</Badge> : <Badge tone="ok">Vigente</Badge>}
              <span className="tnum min-w-[4.5rem] text-right font-mono text-sm text-ink">{money(row.amountCents)}</span>
              {!row.free && !row.refundedAt ? (
                <button type="button" className={danger} onClick={() => setRefunding(row)}>Reembolsar</button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {refunding ? <RefundDialog purchase={refunding} onClose={() => setRefunding(null)} run={run} /> : null}
    </section>
  );
}

function RefundDialog({ purchase, onClose, run }: { purchase: AdminPurchaseRow; onClose: () => void; run: Run }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Reembolsar compra" onClose={onClose}>
      <p className="text-sm text-muted">
        Se devuelve <strong className="text-ink">{formatCents(purchase.amountCents)}</strong> a quien pagó «{purchase.name}» ({purchase.label}) por Stripe. Si esa compra es la que tiene ahora el espacio, el anuncio también se retira. No se puede deshacer.
      </p>
      <label className="mt-4 block text-sm"><span className="text-muted">Motivo (queda en el registro)</span><input className={field} value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={ghost} onClick={onClose}>Cancelar</button>
        <button
          type="button"
          className={danger}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await run({ action: "refund", purchaseId: purchase.id, reason }, (result) => `Reembolso hecho${result.released ? " y anuncio retirado" : ""}.`);
            setBusy(false);
            if (ok) onClose();
          }}
        >
          Reembolsar {formatCents(purchase.amountCents)}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------- Cuentas */

function Accounts({ run }: { run: Run }) {
  const { data, error } = useView<{ accounts: AdminAccountRow[]; bans: Ban[] }>("accounts");
  const [query, setQuery] = useState("");
  const [banning, setBanning] = useState<{ key: string; label: string } | null>(null);
  const [manual, setManual] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.accounts ?? []).filter((row) => !q || (row.email ?? row.key).toLowerCase().includes(q));
  }, [data, query]);
  if (!data) return <Loading error={error} />;
  return (
    <section aria-labelledby="t-cuentas">
      <h1 id="t-cuentas" className="display-face text-[1.9rem] font-medium tracking-[-0.03em] text-ink sm:text-[2.4rem]">Cuentas</h1>
      <p className="mt-1 text-sm text-muted">Personas que han comprado o reclamado algo, agrupadas por correo. Un bloqueo les impide entrar, comprar, reclamar y editar.</p>

      <div className="mt-6 rounded-2xl border border-line p-5">
        <h2 className="text-base font-medium text-ink">Bloquear un correo</h2>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (manual.trim()) setBanning({ key: manual.trim().toLowerCase(), label: manual.trim().toLowerCase() });
          }}
        >
          <input className={cn(field, "max-w-xs")} type="email" placeholder="correo@ejemplo.com" value={manual} onChange={(event) => setManual(event.target.value)} aria-label="Correo a bloquear" />
          <button type="submit" className={danger}><BanIcon size={13} aria-hidden="true" /> Bloquear</button>
        </form>
      </div>

      {data.bans.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-base font-medium text-ink">Bloqueadas ({data.bans.length})</h2>
          <div className="mt-3 space-y-2">
            {data.bans.map((ban) => (
              <div key={ban.key} className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{ban.key}</p>
                  <p className="truncate text-xs text-subtle">{when(ban.createdAt)}{ban.reason ? ` · ${ban.reason}` : ""}</p>
                </div>
                <button type="button" className={ghost} onClick={() => void run({ action: "unban", key: ban.key }, "Cuenta desbloqueada.")}>Desbloquear</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <h2 className="mt-8 text-base font-medium text-ink">Personas</h2>
      <input className={cn(field, "mt-3 max-w-xs")} placeholder="Buscar por correo" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar cuentas" />
      <div className="mt-4 space-y-2">
        {rows.length === 0 ? <Empty>Todavía no hay compradores.</Empty> : null}
        {rows.map((row) => (
          <article key={row.key} className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-line bg-surface/50 px-4 py-3">
            <div className="min-w-0 flex-1 basis-56">
              <p className="truncate text-sm font-medium text-ink">{row.email ?? row.key}</p>
              <p className="truncate text-xs text-subtle">Última actividad {when(row.lastAt)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge>{row.units} {row.units === 1 ? "espacio" : "espacios"}</Badge>
              <Badge>{row.purchases} {row.purchases === 1 ? "compra" : "compras"}</Badge>
              {row.freeClaims > 0 ? <Badge tone="free">{row.freeClaims} gratis</Badge> : null}
              <span className="tnum font-mono text-sm text-ink">{formatCents(row.paidCents)}</span>
              {row.banned ? (
                <Badge tone="bad">Bloqueada</Badge>
              ) : (
                <button type="button" className={danger} onClick={() => setBanning({ key: row.key, label: row.email ?? row.key })}>Bloquear</button>
              )}
            </div>
          </article>
        ))}
      </div>
      {banning ? <BanDialog target={banning} onClose={() => setBanning(null)} run={run} /> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ Encuesta */

function PollAdmin({ run }: { run: Run }) {
  const { data, error } = useView<PollTally>("poll");
  const [city, setCity] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  if (!data) return <Loading error={error} />;
  const top = Math.max(1, ...data.options.map((option) => option.votes));
  return (
    <section aria-labelledby="t-encuesta">
      <h1 id="t-encuesta" className="display-face text-[1.9rem] font-medium tracking-[-0.03em] text-ink sm:text-[2.4rem]">Encuesta de la próxima ciudad</h1>
      <p className="mt-1 text-sm text-muted">{data.total} {data.total === 1 ? "voto" : "votos"} en total. Las ciudades ocultas conservan sus votos pero ya no se muestran ni admiten votos.</p>
      <div className="mt-5 space-y-2">
        {data.options.map((option) => (
          <div key={option.id} className={cn("relative flex items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3", option.active ? "border-line bg-surface/50" : "border-dashed border-line-strong opacity-70")}>
            <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-accent/12" style={{ width: `${(option.votes / top) * 100}%` }} />
            <span className="relative min-w-0 flex-1 truncate text-sm font-medium text-ink">{option.label} {option.active ? null : <Badge>Oculta</Badge>}</span>
            <span className="relative tnum font-mono text-sm text-muted">{option.votes}</span>
            <button type="button" className={cn(ghost, "relative")} onClick={() => void run({ action: "poll-toggle", id: option.id, active: !option.active }, option.active ? "Ciudad oculta." : "Ciudad visible.")}>
              {option.active ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        ))}
      </div>
      <form
        className="mt-6 flex flex-wrap gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await run({ action: "poll-add", name: city }, "Ciudad añadida.")) setCity("");
        }}
      >
        <input className={cn(field, "max-w-xs")} placeholder="Añadir una ciudad" value={city} maxLength={40} onChange={(event) => setCity(event.target.value)} aria-label="Nueva ciudad" />
        <button type="submit" className={primary} disabled={city.trim().length < 2}>Añadir</button>
      </form>
      <div className="mt-8 rounded-2xl border border-danger/30 p-5">
        <h2 className="text-base font-medium text-ink">Reiniciar votos</h2>
        <p className="mt-1 text-sm text-muted">Borra todos los votos y empieza de cero. No se puede deshacer.</p>
        {confirmReset ? (
          <div className="mt-3 flex gap-2">
            <button type="button" className={danger} onClick={async () => { await run({ action: "poll-reset" }, "Encuesta reiniciada."); setConfirmReset(false); }}>Sí, borrar los votos</button>
            <button type="button" className={ghost} onClick={() => setConfirmReset(false)}>Cancelar</button>
          </div>
        ) : (
          <button type="button" className={cn(danger, "mt-3")} onClick={() => setConfirmReset(true)}>Reiniciar votos</button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Registro */

function Log() {
  const { data, error } = useView<AdminLogEntry[]>("log");
  if (!data) return <Loading error={error} />;
  return (
    <section aria-labelledby="t-registro">
      <h1 id="t-registro" className="display-face text-[1.9rem] font-medium tracking-[-0.03em] text-ink sm:text-[2.4rem]">Registro de acciones</h1>
      <p className="mt-1 text-sm text-muted">Todo lo que se hace desde este panel queda aquí: quién, cuándo, sobre qué y por qué.</p>
      <div className="mt-5 space-y-2">
        {data.length === 0 ? <Empty>Todavía no se ha hecho ninguna acción.</Empty> : null}
        {data.map((entry) => (
          <article key={entry.id} className="rounded-2xl border border-line bg-surface/50 px-4 py-3">
            <p className="text-sm text-ink"><span className="font-medium">{entry.action}</span> · {entry.target}</p>
            <p className="text-xs text-subtle">{when(entry.at)} · {entry.admin}{entry.detail ? ` · ${entry.detail}` : ""}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
