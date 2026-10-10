import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import units from "@/data/market/units-malaga.json";

vi.mock("@/lib/env", () => ({
  purchasesEnabled: true,
  PURCHASES_DISABLED_LABEL: "Compras próximamente",
  requireAppOrigin: () => "http://localhost:3000",
}));

import { MemoryStore } from "./store";
import { completeFromSession, confirmSession, createCheckout, editUnit, getLeaderboards, getOwnedUnits, getUnitView, getUserPurchases, setMarketStore } from "./service";

const BUILDING = `b:${units.buildings[0]}`;
const OTHER = `b:${units.buildings[1]}`;
const content = (name: string) => ({ name, url: "https://example.com", description: "Pan de verdad.", images: {} });

function fakeStripe(sessionId: string) {
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
    id: sessionId,
    url: `https://checkout.stripe.test/${sessionId}`,
    metadata: params.metadata,
    amount_total: params.line_items?.[0]?.price_data?.unit_amount ?? 0,
    payment_status: "unpaid",
  }));
  return { stripe: { checkout: { sessions: { create } }, webhooks: {} } as unknown as Stripe, create };
}

/** Compra completa de un espacio: crea el pago y lo da por cobrado, con el correo que dio Stripe. */
async function buy(unitId: string, sessionId: string, opts: { name: string; email?: string; userId?: string }) {
  const fake = fakeStripe(sessionId);
  await createCheckout({ unitId, content: content(opts.name), userId: opts.userId ?? null, userEmail: opts.userId ? (opts.email ?? null) : null }, { stripe: fake.stripe });
  const draftId = fake.create.mock.calls[0]?.[0].metadata?.draftId as string;
  const session = {
    id: sessionId,
    payment_status: "paid" as const,
    amount_total: 100,
    metadata: { draftId, unitId },
    customer_details: { email: opts.email ?? null },
  };
  await completeFromSession(session);
  const retrieve = vi.fn(async () => session);
  const confirmed = await confirmSession(sessionId, { stripe: { checkout: { sessions: { retrieve } } } as unknown as Stripe });
  return confirmed.editToken;
}

beforeAll(() => {
  vi.stubEnv("SESSION_SECRET", "y".repeat(40));
});

beforeEach(() => {
  setMarketStore(new MemoryStore());
});

describe("editar el anuncio después de pagar", () => {
  it("quien compró como invitado edita con su enlace privado, sin cobrar ni reiniciar la protección", async () => {
    const token = await buy(BUILDING, "cs_test_guest1", { name: "Panadería Sol", email: "ana@example.com" });
    const before = await getUnitView(BUILDING);
    const edited = await editUnit({ unitId: BUILDING, content: content("Panadería Sol y Luna"), token });
    expect(edited.owner?.name).toBe("Panadería Sol y Luna");
    expect(edited.purchases).toBe(1); // no es una compra
    expect(edited.priceCents).toBe(before.priceCents); // no cambia el precio
    expect(edited.lockedUntil).toBe(before.lockedUntil); // no reinicia los cinco días
    expect(edited.owner?.since).toBe(before.owner?.since);
    expect(edited.rev).not.toBe(before.rev); // sí refresca fotos y caché
  });

  it("sin dueño válido no se puede editar: ni sin credenciales, ni con un token ajeno o falso", async () => {
    await buy(BUILDING, "cs_test_a", { name: "Ana", email: "ana@example.com" });
    const otherToken = await buy(OTHER, "cs_test_b", { name: "Beto", email: "beto@example.com" });
    await expect(editUnit({ unitId: BUILDING, content: content("Intruso") })).rejects.toMatchObject({ status: 403 });
    await expect(editUnit({ unitId: BUILDING, content: content("Intruso"), token: otherToken })).rejects.toMatchObject({ status: 403 });
    await expect(editUnit({ unitId: BUILDING, content: content("Intruso"), token: "falso.firma" })).rejects.toMatchObject({ status: 403 });
    await expect(editUnit({ unitId: BUILDING, content: content("Intruso"), userId: "otro", userEmail: "otro@example.com" })).rejects.toMatchObject({ status: 403 });
    expect((await getUnitView(BUILDING)).owner?.name).toBe("Ana");
  });

  it("una cuenta edita lo que compró conectada, y lo que compró de invitado con el mismo correo", async () => {
    await buy(BUILDING, "cs_test_acc", { name: "Con cuenta", email: "ana@example.com", userId: "g-1" });
    await buy(OTHER, "cs_test_inv", { name: "Invitada", email: "Ana@Example.com" });

    expect((await getOwnedUnits("g-1", "ana@example.com")).sort()).toEqual([BUILDING, OTHER].sort());
    await expect(editUnit({ unitId: BUILDING, content: content("Con cuenta 2"), userId: "g-1", userEmail: "ana@example.com" })).resolves.toBeTruthy();
    await expect(editUnit({ unitId: OTHER, content: content("Invitada 2"), userId: "g-1", userEmail: "ana@example.com" })).resolves.toBeTruthy();
    // Otra cuenta con otro correo no tiene nada.
    expect(await getOwnedUnits("g-2", "beto@example.com")).toEqual([]);
    const mine = await getUserPurchases("g-1", "ana@example.com");
    expect(mine.map((purchase) => purchase.unitId).sort()).toEqual([BUILDING, OTHER].sort());
  });

  it("cuando otra persona compra el espacio, el enlace antiguo deja de valer", async () => {
    const token = await buy(BUILDING, "cs_test_old", { name: "Ana", email: "ana@example.com" });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 6 * 86_400_000); // pasada la protección de cinco días
      await buy(BUILDING, "cs_test_new", { name: "Beto", email: "beto@example.com" });
    } finally {
      vi.useRealTimers();
    }
    await expect(editUnit({ unitId: BUILDING, content: content("Ana vuelve"), token })).rejects.toMatchObject({ status: 403 });
    expect((await getUnitView(BUILDING)).owner?.name).toBe("Beto");
  });

  it("«últimas compras» enseña el nombre ACTUAL del anunciante, no el de cuando compró", async () => {
    const token = await buy(BUILDING, "cs_test_n1", { name: "Panadería Sol", email: "ana@example.com" });
    await editUnit({ unitId: BUILDING, content: content("Panadería Sol y Luna"), token });
    let board = await getLeaderboards();
    expect(board.latest[0]?.buyer).toBe("Panadería Sol y Luna");
    expect(board.owners[0]?.name).toBe("Panadería Sol y Luna");

    // Si otra persona compra después, su compra anterior conserva el nombre con el que se hizo.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 6 * 86_400_000);
      await buy(BUILDING, "cs_test_n2", { name: "Librería Luna", email: "beto@example.com" });
    } finally {
      vi.useRealTimers();
    }
    board = await getLeaderboards();
    expect(board.latest.map((row) => row.buyer)).toEqual(["Librería Luna", "Panadería Sol y Luna"]);
  });
});
