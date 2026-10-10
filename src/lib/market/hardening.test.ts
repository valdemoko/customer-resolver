import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { NextRequest } from "next/server";
import units from "@/data/market/units-malaga.json";

vi.mock("@/lib/env", () => ({
  purchasesEnabled: true,
  PURCHASES_DISABLED_LABEL: "Compras próximamente",
  requireAppOrigin: () => "http://localhost:3000",
}));

import { MemoryStore } from "./store";
import { completeFromSession, confirmSession, createCheckout, getLeaderboards, getMarketState, getUnitView, setMarketStore } from "./service";
import { MAX_BODY_BYTES, rateLimited, readJson, resetRateLimits } from "../../app/api/market/helpers";

const BUILDING = `b:${units.buildings[0]}`;
const content = { name: "Panadería Sol", url: "https://example.com", description: "Pan.", images: {} };

function fakeStripe() {
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
    id: "cs_test_h1",
    url: "https://checkout.stripe.test/h1",
    metadata: params.metadata,
    amount_total: params.line_items?.[0]?.price_data?.unit_amount ?? 0,
    payment_status: "unpaid",
  }));
  return { stripe: { checkout: { sessions: { create } } } as unknown as Stripe, create };
}

const request = (init: { body?: string; headers?: Record<string, string> } = {}) =>
  new Request("http://localhost/api", { method: "POST", ...init }) as unknown as NextRequest;

beforeEach(() => {
  setMarketStore(new MemoryStore());
  resetRateLimits();
});

describe("no se publica un anuncio sin haberlo pagado entero", () => {
  async function pending() {
    const fake = fakeStripe();
    await createCheckout({ unitId: BUILDING, content }, { stripe: fake.stripe });
    const draftId = fake.create.mock.calls[0]?.[0].metadata?.draftId as string;
    return { draftId, price: fake.create.mock.calls[0]?.[0].line_items?.[0]?.price_data?.unit_amount as number };
  }
  const session = (draftId: string, amount: number, status: "paid" | "unpaid" = "paid") => ({
    id: "cs_test_h1",
    payment_status: status,
    amount_total: amount,
    metadata: { draftId, unitId: BUILDING },
  });

  it("un pago por menos del precio del servidor no publica nada", async () => {
    const { draftId, price } = await pending();
    expect(await completeFromSession(session(draftId, price - 1))).toBeNull();
    expect(await completeFromSession(session(draftId, 0))).toBeNull();
    expect((await getUnitView(BUILDING)).owned).toBe(false);
  });

  it("un pago sin completar (`unpaid`) o con la unidad de otro borrador no publica nada", async () => {
    const { draftId, price } = await pending();
    expect(await completeFromSession(session(draftId, price, "unpaid"))).toBeNull();
    expect(await completeFromSession({ ...session(draftId, price), metadata: { draftId, unitId: `b:${units.buildings[1]}` } })).toBeNull();
    expect((await getUnitView(BUILDING)).owned).toBe(false);
  });

  it("el importe exacto sí lo publica, y una sesión inventada sin borrador no", async () => {
    const { draftId, price } = await pending();
    expect(await completeFromSession({ ...session("dr_inventado", price) })).toBeNull();
    expect((await completeFromSession(session(draftId, price)))?.applied).toBe(true);
  });
});

describe("la memoria breve no deja ver datos viejos tras una compra", () => {
  it("el estado y las clasificaciones se renuevan en cuanto se completa un pago", async () => {
    expect((await getMarketState()).units).toHaveLength(0);
    expect((await getLeaderboards()).stats?.purchases).toBe(0);
    const fake = fakeStripe();
    await createCheckout({ unitId: BUILDING, content }, { stripe: fake.stripe });
    const draftId = fake.create.mock.calls[0]?.[0].metadata?.draftId as string;
    await completeFromSession({ id: "cs_test_h1", payment_status: "paid", amount_total: 100, metadata: { draftId, unitId: BUILDING } });
    expect((await getMarketState()).units).toHaveLength(1);
    expect((await getLeaderboards()).stats?.purchases).toBe(1);
  });
});

describe("límites de las rutas de escritura", () => {
  it("rechaza cuerpos enormes antes de leerlos y el JSON roto", async () => {
    await expect(readJson(request({ body: "{}", headers: { "content-length": String(MAX_BODY_BYTES + 1) } }))).rejects.toMatchObject({ status: 413 });
    await expect(readJson(request({ body: "x".repeat(MAX_BODY_BYTES + 10) }))).rejects.toMatchObject({ status: 413 });
    await expect(readJson(request({ body: "{no es json" }))).rejects.toMatchObject({ status: 400 });
    await expect(readJson<{ a: number }>(request({ body: '{"a":1}' }))).resolves.toEqual({ a: 1 });
  });

  it("limita las ráfagas por IP y separa las IP entre sí", () => {
    const a = request({ headers: { "cf-connecting-ip": "1.1.1.1" } });
    const b = request({ headers: { "cf-connecting-ip": "2.2.2.2" } });
    const results = Array.from({ length: 5 }, (_, i) => rateLimited(a, "x", 3, 60_000, 1000 + i));
    expect(results).toEqual([false, false, false, true, true]);
    expect(rateLimited(b, "x", 3, 60_000, 1010)).toBe(false);
    // Pasada la ventana se vuelve a permitir.
    expect(rateLimited(a, "x", 3, 60_000, 1000 + 61_000)).toBe(false);
  });
});

describe("sesiones de pago desconocidas", () => {
  it("confirmar una sesión que Stripe no conoce da 404 claro y no publica nada", async () => {
    const stripe = { checkout: { sessions: { retrieve: vi.fn(async () => Promise.reject(Object.assign(new Error("No such session"), { code: "resource_missing" }))) } } } as unknown as Stripe;
    await expect(confirmSession("cs_live_inventada1234567890", { stripe })).rejects.toMatchObject({ status: 404 });
    expect((await getMarketState()).units).toHaveLength(0);
  });
});
