import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { NextRequest } from "next/server";
import units from "@/data/market/units-malaga.json";

vi.mock("@/lib/env", () => ({
  purchasesEnabled: true,
  PURCHASES_DISABLED_LABEL: "Compras próximamente",
  requireAppOrigin: () => "http://localhost:3000",
}));

import { MemoryStore } from "@/lib/market/store";
import {
  claimFree,
  completeFromSession,
  createCheckout,
  editUnit,
  getLeaderboards,
  getMarketState,
  getUnitView,
  setMarketStore,
} from "@/lib/market/service";
import { FREE_UNIT_IDS } from "@/lib/market/units";
import { castPollVote, getPoll, invalidatePoll } from "@/lib/poll";
import { assertAdminRequest, isAdminEmail } from "./auth";
import * as admin from "./service";

const A = `b:${units.buildings[0]}`;
const B = `b:${units.buildings[1]}`;
const content = (name: string) => ({ name, url: "https://example.com", description: "Texto.", images: {} });

function fakeStripe(id: string) {
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
    id,
    url: "https://checkout.stripe.test/x",
    metadata: params.metadata,
    amount_total: params.line_items?.[0]?.price_data?.unit_amount ?? 0,
    payment_status: "unpaid",
  }));
  return { stripe: { checkout: { sessions: { create } } } as unknown as Stripe, create };
}

/** Compra pagada de verdad (importe del servidor) con el correo que dio Stripe. */
async function buy(unitId: string, session: string, email: string, name = "Anuncio", extras: { stripe?: Stripe } = {}) {
  const fake = fakeStripe(session);
  await createCheckout({ unitId, content: content(name) }, { stripe: fake.stripe });
  const call = fake.create.mock.calls[0]![0];
  return completeFromSession(
    {
      id: session,
      payment_status: "paid",
      amount_total: call.line_items?.[0]?.price_data?.unit_amount ?? 0,
      metadata: { draftId: call.metadata?.draftId as string, unitId },
      payment_intent: `pi_${session}`,
      customer_details: { email },
    },
    extras.stripe ? { stripe: extras.stripe } : {},
  );
}

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "Jefe@Example.com, otra@example.com");
  setMarketStore(new MemoryStore());
  invalidatePoll();
});

describe("quién es administrador", () => {
  it("solo las cuentas de la lista (sin distinguir mayúsculas), nunca una lista vacía", () => {
    expect(isAdminEmail("jefe@example.com")).toBe(true);
    expect(isAdminEmail(" OTRA@example.com ")).toBe(true);
    expect(isAdminEmail("intruso@example.com")).toBe(false);
    expect(isAdminEmail("")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isAdminEmail("jefe@example.com")).toBe(false);
  });

  it("las acciones exigen la cabecera propia y el mismo origen", () => {
    const request = (headers: Record<string, string>) => new Request("http://localhost/api/admin", { method: "POST", headers }) as unknown as NextRequest;
    const ok = request({ "x-admin-request": "1", origin: "http://localhost" });
    Object.defineProperty(ok, "nextUrl", { value: new URL("http://localhost/api/admin") });
    expect(() => assertAdminRequest(ok)).not.toThrow();
    const noHeader = request({ origin: "http://localhost" });
    Object.defineProperty(noHeader, "nextUrl", { value: new URL("http://localhost/api/admin") });
    expect(() => assertAdminRequest(noHeader)).toThrow(/no válida/);
    const foreign = request({ "x-admin-request": "1", origin: "https://evil.example" });
    Object.defineProperty(foreign, "nextUrl", { value: new URL("http://localhost/api/admin") });
    expect(() => assertAdminRequest(foreign)).toThrow(/Origen/);
  });
});

describe("retirar y liberar anuncios", () => {
  it("retirar un anuncio libera el espacio: vuelve a 1,00 €, sale de las listas y deja registro", async () => {
    await buy(A, "cs_test_a", "ana@example.com", "Panadería Sol");
    expect((await getUnitView(A)).owned).toBe(true);
    await admin.releaseUnit("jefe@example.com", A, "Contenido ofensivo");
    const view = await getUnitView(A);
    expect(view).toMatchObject({ owned: false, purchases: 0, priceCents: 100, lockedUntil: null });
    expect((await getMarketState()).units).toHaveLength(0);
    const board = await getLeaderboards();
    expect(board.latest).toEqual([]);
    expect(board.owners).toEqual([]);
    const log = await admin.adminLogList();
    expect(log[0]).toMatchObject({ admin: "jefe@example.com", action: "retirar-anuncio" });
    expect(log[0]!.detail).toContain("ofensivo");
    // El historial de pagos se conserva (con la marca de retirado).
    const purchases = await admin.adminPurchasesList();
    expect(purchases[0]).toMatchObject({ unitId: A, amountCents: 100 });
    expect(purchases[0]!.releasedAt).not.toBeNull();
  });

  it("un espacio gratis retirado vuelve a ser gratis, y el antiguo dueño ya no puede editarlo", async () => {
    const free = FREE_UNIT_IDS[0]!;
    await claimFree({ unitId: free, content: content("Mi tienda"), userId: "g-1", userEmail: "ana@example.com" });
    await admin.releaseUnit("jefe@example.com", free, "");
    expect(await getUnitView(free)).toMatchObject({ free: true, priceCents: 0, owned: false });
    await expect(editUnit({ unitId: free, content: content("Sigo siendo yo"), userId: "g-1", userEmail: "ana@example.com" })).rejects.toMatchObject({ status: 404 });
    // Y los espacios que posee la cuenta ya no lo incluyen.
    const store = (await import("@/lib/market/service")).getMarketStore;
    expect(await (await store()).ownedBy("g-1", "ana@example.com")).toEqual([]);
  });

  it("no se puede retirar lo que no tiene anuncio ni una unidad que no existe", async () => {
    await expect(admin.releaseUnit("jefe@example.com", A, "")).rejects.toMatchObject({ status: 404 });
    await expect(admin.releaseUnit("jefe@example.com", "b:way/999999999999", "")).rejects.toMatchObject({ status: 404 });
  });

  it("editar el contenido (moderación) valida igual que una compra y puede quitar la foto", async () => {
    await buy(A, "cs_test_b", "ana@example.com", "Nombre feo");
    await admin.editUnitContent("jefe@example.com", A, { name: "Anuncio retirado", description: "" });
    expect((await getUnitView(A)).owner?.name).toBe("Anuncio retirado");
    await expect(admin.editUnitContent("jefe@example.com", A, { url: "javascript:alert(1)" })).rejects.toMatchObject({ status: 400 });
    await expect(admin.editUnitContent("jefe@example.com", A, {})).rejects.toMatchObject({ status: 400 });
    await admin.editUnitContent("jefe@example.com", A, { removePhoto: true });
    expect((await getUnitView(A)).owner?.faces).toEqual([]);
    // Cambiar el nombre actualiza también «últimas compras».
    expect((await getLeaderboards()).latest[0]?.buyer).toBe("Anuncio retirado");
  });

  it("quitar la protección permite comprar de inmediato", async () => {
    await buy(A, "cs_test_c", "ana@example.com");
    await expect(createCheckout({ unitId: A, content: content("Otro") }, { stripe: fakeStripe("cs_x").stripe })).rejects.toMatchObject({ status: 409 });
    await admin.unlockUnit("jefe@example.com", A);
    expect((await getUnitView(A)).lockedUntil).toBeNull();
    await expect(createCheckout({ unitId: A, content: content("Otro") }, { stripe: fakeStripe("cs_y").stripe })).resolves.toMatchObject({ amountCents: 125 });
  });
});

describe("bloquear cuentas", () => {
  it("una cuenta bloqueada no puede comprar, reclamar gratis ni editar, y las demás no se ven afectadas", async () => {
    await buy(A, "cs_test_d", "mala@example.com", "Mala fama");
    await admin.banAccount("jefe@example.com", "Mala@Example.com", "Spam", false);
    await expect(claimFree({ unitId: FREE_UNIT_IDS[1]!, content: content("Nombre"), userId: "g-9", userEmail: "mala@example.com" })).rejects.toMatchObject({ status: 403 });
    await expect(createCheckout({ unitId: B, content: content("Nombre"), userId: "g-9", userEmail: "mala@example.com" }, { stripe: fakeStripe("cs_z").stripe })).rejects.toMatchObject({ status: 403 });
    await expect(claimFree({ unitId: FREE_UNIT_IDS[1]!, content: content("Nombre"), userId: "g-1", userEmail: "buena@example.com" })).resolves.toMatchObject({ owned: true });
  });

  it("un pago de una persona bloqueada no publica nada y se devuelve íntegro", async () => {
    await admin.banAccount("jefe@example.com", "mala@example.com", "Spam", false);
    const refunds = { create: vi.fn(async () => ({ id: "re_1" })) };
    const result = await buy(A, "cs_test_e", "MALA@example.com", "Colado", { stripe: { refunds } as unknown as Stripe });
    expect(result).toMatchObject({ applied: false, refunded: true });
    expect(refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_cs_test_e" }, { idempotencyKey: "refund-cs_test_e" });
    expect((await getUnitView(A)).owned).toBe(false);
  });

  it("bloquear retira sus anuncios si se pide, no se puede bloquear a un administrador y se puede desbloquear", async () => {
    await buy(A, "cs_test_f", "mala@example.com", "Uno");
    const out = await admin.banAccount("jefe@example.com", "mala@example.com", "Estafa", true);
    expect(out.released).toBe(1);
    expect((await getUnitView(A)).owned).toBe(false);
    await expect(admin.banAccount("otra@example.com", "jefe@example.com", "", false)).rejects.toMatchObject({ status: 400 });
    expect((await admin.adminBansList()).map((ban) => ban.key)).toEqual(["mala@example.com"]);
    await admin.unbanAccount("jefe@example.com", "mala@example.com");
    await expect(claimFree({ unitId: FREE_UNIT_IDS[2]!, content: content("Nombre"), userId: "g-9", userEmail: "mala@example.com" })).resolves.toMatchObject({ owned: true });
    await expect(admin.unbanAccount("jefe@example.com", "mala@example.com")).rejects.toMatchObject({ status: 404 });
  });

  it("la lista de cuentas agrupa por persona y marca a las bloqueadas", async () => {
    await buy(A, "cs_test_g", "ana@example.com");
    await claimFree({ unitId: FREE_UNIT_IDS[3]!, content: content("Mía"), userId: "g-1", userEmail: "ana@example.com" });
    await admin.banAccount("jefe@example.com", "ana@example.com", "", false);
    const accounts = await admin.adminAccountsList();
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ key: "ana@example.com", purchases: 2, freeClaims: 1, units: 2, banned: true });
  });
});

describe("reembolsos", () => {
  it("no se devuelve lo que fue gratis, ni lo que no existe", async () => {
    await claimFree({ unitId: FREE_UNIT_IDS[4]!, content: content("Gratis"), userId: "g-1", userEmail: "ana@example.com" });
    const [purchase] = await admin.adminPurchasesList();
    await expect(admin.refundPurchase("jefe@example.com", purchase!.id, "")).rejects.toMatchObject({ status: 400 });
    await expect(admin.refundPurchase("jefe@example.com", "999", "")).rejects.toMatchObject({ status: 404 });
  });
});

describe("limpieza y resumen", () => {
  it("el resumen cuenta gratis libres y compras; limpiar borradores borra solo los viejos", async () => {
    await buy(A, "cs_test_h", "ana@example.com");
    await claimFree({ unitId: FREE_UNIT_IDS[5]!, content: content("Mía"), userId: "g-1" });
    // Una reclamación gratis no deja borradores atrás (y los de pago se limpian con el tiempo).
    expect((await admin.adminOverview()).drafts).toBe(1);
    const overview = await admin.adminOverview();
    expect(overview).toMatchObject({ paidPurchases: 1, freeClaims: 1, unitsOwned: 2, freeTotal: 120, freeLeft: 119, revenueCents: 100 });
    const store = await (await import("@/lib/market/service")).getMarketStore();
    await store.saveDraft({ id: "dr_viejo", unitId: A, content: content("Nombre") as never, purchasesAtCreation: 0, createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString() });
    expect(await admin.purgeDrafts("jefe@example.com", 4)).toBe(1);
  });
});

describe("encuesta de la próxima ciudad", () => {
  it("un voto por persona (se puede cambiar), solo opciones activas y resultados en vivo", async () => {
    expect((await getPoll(null)).options.map((o) => o.label)).toContain("Madrid");
    expect(await castPollVote("c:uno", "madrid", "ip1")).toBe("ok");
    expect(await castPollVote("c:dos", "barcelona", "ip2")).toBe("ok");
    expect(await castPollVote("c:uno", "barcelona", "ip1")).toBe("ok"); // cambia su voto, no suma otro
    const poll = await getPoll("c:uno");
    expect(poll.total).toBe(2);
    expect(poll.mine).toBe("barcelona");
    expect(poll.options.find((o) => o.id === "barcelona")?.votes).toBe(2);
    expect(poll.options.find((o) => o.id === "madrid")?.votes).toBe(0);
    expect(await castPollVote("c:tres", "atlantida", "ip3")).toBe("unknown");
  });

  it("frena el voto masivo desde un mismo origen", async () => {
    for (let i = 0; i < 5; i += 1) expect(await castPollVote(`c:${i}`, "madrid", "mismo-origen")).toBe("ok");
    expect(await castPollVote("c:6", "madrid", "mismo-origen")).toBe("limit");
    expect(await castPollVote("c:0", "paris", "mismo-origen")).toBe("ok"); // quien ya votó puede cambiar
    expect(await castPollVote("c:7", "madrid", "otro-origen")).toBe("ok");
  });

  it("el panel puede añadir, esconder y reiniciar", async () => {
    await admin.addPollCity("jefe@example.com", "Ciudad de México");
    expect((await getPoll(null)).options.map((o) => o.id)).toContain("ciudad-de-mexico");
    await admin.setPollCityActive("jefe@example.com", "madrid", false);
    expect((await getPoll(null)).options.map((o) => o.id)).not.toContain("madrid");
    expect(await castPollVote("c:uno", "madrid", "ip1")).toBe("unknown"); // oculta: no admite votos
    await castPollVote("c:uno", "paris", "ip1");
    await admin.resetPoll("jefe@example.com");
    expect((await getPoll("c:uno")).total).toBe(0);
    await expect(admin.addPollCity("jefe@example.com", "x")).rejects.toMatchObject({ status: 400 });
  });
});

describe("cuentas en el panel", () => {
  it("incluye a quien solo ha iniciado sesión, sin duplicar a quien ya compró", async () => {
    const store = await (await import("@/lib/market/service")).getMarketStore();
    await store.recordLogin({ id: "g-solo", email: "Solo@Example.com", name: "Solo" });
    const accounts = await store.adminAccounts();
    const solo = accounts.find((row) => row.key === "solo@example.com");
    expect(solo).toMatchObject({ purchases: 0, units: 0, name: "Solo" });
    expect(accounts.filter((row) => row.key === "solo@example.com")).toHaveLength(1);
  });
});
