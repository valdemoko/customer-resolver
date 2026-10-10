import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import units from "@/data/market/units-malaga.json";
import freeRaw from "@/data/market/free-units-malaga.json";

vi.mock("@/lib/env", () => ({
  purchasesEnabled: true,
  PURCHASES_DISABLED_LABEL: "Compras próximamente",
  requireAppOrigin: () => "http://localhost:3000",
}));

import { MemoryStore } from "./store";
import { claimFree, createCheckout, getMarketState, getUnitView, getUserPurchases, setMarketStore, getLeaderboards } from "./service";
import { FREE_CLAIMS_PER_ACCOUNT, FREE_UNIT_IDS, isFreeUnit, isKnownUnit } from "./units";

const content = (name: string) => ({ name, url: "https://example.com", description: "Gratis.", images: {} });
const paidUnit = `b:${units.buildings.find((id) => !isFreeUnit(`b:${id}`))}`;

function fakeStripe() {
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
    id: "cs_test_x1",
    url: "https://checkout.stripe.test/x",
    metadata: params.metadata,
    amount_total: params.line_items?.[0]?.price_data?.unit_amount ?? 0,
    payment_status: "unpaid",
  }));
  return { stripe: { checkout: { sessions: { create } } } as unknown as Stripe, create };
}

beforeEach(() => setMarketStore(new MemoryStore()));

describe("espacios gratis", () => {
  it("son 100 edificios sin nombre y 20 locales, todos existentes, sin repetir", () => {
    expect(freeRaw.buildings).toHaveLength(100);
    expect(freeRaw.parcels).toHaveLength(20);
    expect(new Set(FREE_UNIT_IDS).size).toBe(120);
    for (const id of FREE_UNIT_IDS) expect(isKnownUnit(id), id).toBe(true);
    const names = (units as unknown as { names: Record<string, string> }).names;
    for (const id of freeRaw.buildings) expect(names[id], `${id} tiene nombre`).toBeUndefined();
  });

  it("un espacio gratis sin reclamar enseña precio 0 y figura en la lista de gratis", async () => {
    const id = FREE_UNIT_IDS[0]!;
    const view = await getUnitView(id);
    expect(view).toMatchObject({ free: true, priceCents: 0, owned: false });
    expect((await getMarketState()).free).toContain(id);
  });

  it("no se paga con Stripe: se reclama con cuenta, y sin cuenta se rechaza", async () => {
    const id = FREE_UNIT_IDS[0]!;
    await expect(createCheckout({ unitId: id, content: content("Mi tienda") }, { stripe: fakeStripe().stripe })).rejects.toMatchObject({ status: 400 });
    await expect(claimFree({ unitId: id, content: content("Mi tienda") })).rejects.toMatchObject({ status: 401 });
    expect((await getUnitView(id)).owned).toBe(false);
  });

  it("al reclamarlo es tuyo, queda protegido, sale de la lista de gratis y el siguiente paga 1,00 €", async () => {
    const id = FREE_UNIT_IDS[1]!;
    const claimed = await claimFree({ unitId: id, content: content("Mi tienda"), userId: "g-1", userEmail: "ana@example.com" });
    expect(claimed).toMatchObject({ owned: true, free: false, purchases: 1, priceCents: 100 });
    expect(claimed.lockedUntil).not.toBeNull();
    expect((await getMarketState()).free).not.toContain(id);
    expect((await getUserPurchases("g-1", "ana@example.com"))[0]).toMatchObject({ unitId: id, amountCents: 0, current: true });
    // Nadie más puede reclamarlo ni comprarlo durante la protección.
    await expect(claimFree({ unitId: id, content: content("Otro"), userId: "g-2" })).rejects.toMatchObject({ status: 409 });
    await expect(createCheckout({ unitId: id, content: content("Otro") }, { stripe: fakeStripe().stripe })).rejects.toMatchObject({ status: 409 });
  });

  it("cada cuenta puede reclamar un máximo y las demás cuentas no se ven afectadas", async () => {
    for (let i = 0; i < FREE_CLAIMS_PER_ACCOUNT; i += 1) {
      await claimFree({ unitId: FREE_UNIT_IDS[10 + i]!, content: content(`Tienda ${i}`), userId: "g-1" });
    }
    await expect(claimFree({ unitId: FREE_UNIT_IDS[20]!, content: content("Una más"), userId: "g-1" })).rejects.toMatchObject({ status: 409 });
    await expect(claimFree({ unitId: FREE_UNIT_IDS[20]!, content: content("Otra cuenta"), userId: "g-2" })).resolves.toMatchObject({ owned: true });
  });

  it("un espacio que no es gratis no se puede reclamar sin pagar", async () => {
    await expect(claimFree({ unitId: paidUnit, content: content("Colado"), userId: "g-1" })).rejects.toMatchObject({ status: 400 });
  });

  it("las reclamaciones gratis no cuentan como «pago más alto» en las clasificaciones", async () => {
    await claimFree({ unitId: FREE_UNIT_IDS[3]!, content: content("Gratis"), userId: "g-1" });
    const board = await getLeaderboards();
    expect(board.valuable).toEqual([]);
    expect(board.stats).not.toHaveProperty("revenueCents"); // el total recaudado no es público
  });
});
