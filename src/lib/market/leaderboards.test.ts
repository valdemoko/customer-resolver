import { describe, expect, it } from "vitest";
import { MemoryStore } from "./store";
import type { Draft } from "./store";

const draft = (id: string, unitId: string, name: string): Draft => ({
  id,
  unitId,
  content: { name, url: "https://example.com", description: "", images: {}, sameForAll: false } as Draft["content"],
  purchasesAtCreation: 0,
  createdAt: new Date().toISOString(),
});

async function buy(store: MemoryStore, session: string, unitId: string, name: string, cents: number) {
  const before = (await store.getUnit(unitId))?.purchases ?? 0;
  await store.saveDraft({ ...draft(`d-${session}`, unitId, name), purchasesAtCreation: before });
  await store.completePurchase({ sessionId: session, draftId: `d-${session}`, amountCents: cents });
  // Los sellos de tiempo del almacén tienen resolución de ms: se separan las compras.
  await new Promise((resolve) => setTimeout(resolve, 3));
}

describe("clasificaciones", () => {
  it("sin compras: todo a cero y listas vacías (nada inventado)", async () => {
    const board = await new MemoryStore().leaderboards(15);
    expect(board.stats).toEqual({ purchases: 0, unitsOwned: 0, owners: 0, revenueCents: 0 });
    expect(board.valuable).toEqual([]);
    expect(board.owners).toEqual([]);
    expect(board.latest).toEqual([]);
  });

  it("espacios más valiosos: orden por importe pagado, y un sustituido conserva su pago más alto", async () => {
    const store = new MemoryStore();
    await buy(store, "s1", "b:way/1", "Ana", 100);
    await buy(store, "s2", "b:way/2", "Ana", 100);
    await buy(store, "s3", "b:way/2", "Beto", 125);
    await buy(store, "s4", "p:L-aaaaaaa", "Carla", 100);
    const { valuable } = await store.leaderboards(15);
    expect(valuable.map((row) => [row.unitId, row.paidCents, row.purchases, row.owner])).toEqual([
      ["b:way/2", 125, 2, "Beto"],
      ["b:way/1", 100, 1, "Ana"],
      ["p:L-aaaaaaa", 100, 1, "Carla"],
    ]);
  });

  it("propietarios: cuenta las unidades que poseen AHORA, sin distinguir mayúsculas", async () => {
    const store = new MemoryStore();
    await buy(store, "s1", "b:way/1", "Ana", 100);
    await buy(store, "s2", "b:way/2", "ana ", 100);
    await buy(store, "s3", "b:way/3", "Beto", 100);
    await buy(store, "s4", "b:way/1", "Beto", 125); // Beto quita b:way/1 a Ana
    const { owners, stats } = await store.leaderboards(15);
    expect(owners.map((row) => [row.name.trim().toLowerCase(), row.units])).toEqual([["beto", 2], ["ana", 1]]);
    expect(stats).toMatchObject({ purchases: 4, unitsOwned: 3, owners: 2, revenueCents: 425 });
  });

  it("últimas compras: la más reciente primero y un máximo de 15", async () => {
    const store = new MemoryStore();
    for (let i = 1; i <= 17; i += 1) await buy(store, `s${i}`, `b:way/${i}`, `Anunciante ${i}`, 100);
    const { latest } = await store.leaderboards(15);
    expect(latest).toHaveLength(15);
    expect(latest[0]?.buyer).toBe("Anunciante 17");
    expect(latest[14]?.buyer).toBe("Anunciante 3");
  });

  it("una sesión repetida no duplica la compra", async () => {
    const store = new MemoryStore();
    await buy(store, "s1", "b:way/1", "Ana", 100);
    await store.completePurchase({ sessionId: "s1", draftId: "d-s1", amountCents: 100 });
    expect((await store.leaderboards(15)).stats.purchases).toBe(1);
  });
});
