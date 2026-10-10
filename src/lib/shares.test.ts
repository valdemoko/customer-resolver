import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  purchasesEnabled: true,
  PURCHASES_DISABLED_LABEL: "Compras próximamente",
  requireAppOrigin: () => "http://localhost:3000",
}));

import { MemoryStore } from "@/lib/market/store";
import { editTokenFor, getLeaderboards, getMarketStore, invalidateMarketCaches, setMarketStore } from "@/lib/market/service";
import { FREE_UNIT_IDS } from "@/lib/market/units";
import { recordShare, shareCountOf } from "./shares";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";
const UNIT = FREE_UNIT_IDS[0]!;
const OTHER = FREE_UNIT_IDS[1]!;

async function own(unitId: string, userId = "owner-1", email = "dueno@example.com", sessionId = `free_${unitId}`) {
  const store = await getMarketStore();
  await store.saveDraft({ id: `dr_${unitId}`, unitId, content: { name: "Mi marca", url: "", description: "", faces: {}, framing: { x: 0.5, y: 0.5, zoom: 1 } } as never, purchasesAtCreation: 0, createdAt: new Date().toISOString(), userId });
  await store.completePurchase({ sessionId, draftId: `dr_${unitId}`, amountCents: 0, buyerEmail: email });
}

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "z".repeat(40));
  setMarketStore(new MemoryStore());
  invalidateMarketCaches();
});

const share = (ip: string, extra: Partial<Parameters<typeof recordShare>[0]> = {}) =>
  recordShare({ unitId: UNIT, ip, userAgent: CHROME, ...extra });

describe("puntos de compartido", () => {
  it("un espacio sin anunciante no puntúa", async () => {
    expect(await share("1.1.1.1")).toEqual({ counted: false, shares: 0 });
  });

  it("cada persona suma un punto por anuncio y día, y otra persona suma otro", async () => {
    await own(UNIT);
    expect(await share("1.1.1.1")).toEqual({ counted: true, shares: 1 });
    expect(await share("1.1.1.1")).toEqual({ counted: false, shares: 1 }); // misma persona, mismo día
    expect(await share("2.2.2.2")).toEqual({ counted: true, shares: 2 });
    expect(await share("2.2.2.2", { userAgent: FIREFOX })).toEqual({ counted: true, shares: 3 }); // otro navegador = otra huella
    expect(await shareCountOf(UNIT)).toBe(3);
  });

  it("la misma persona vuelve a sumar al día siguiente", async () => {
    await own(UNIT);
    await share("1.1.1.1", { now: new Date("2026-10-10T10:00:00Z") });
    expect((await share("1.1.1.1", { now: new Date("2026-10-11T10:00:00Z") })).shares).toBe(2);
  });

  it("el dueño no suma: ni con su cuenta, ni con el mismo correo, ni con su enlace privado de edición", async () => {
    await own(UNIT);
    expect((await share("3.3.3.3", { userId: "owner-1", userEmail: "dueno@example.com" })).counted).toBe(false);
    const token = await editTokenFor(`free_${UNIT}`);
    expect((await share("3.3.3.5", { token })).counted).toBe(false);
    expect(await shareCountOf(UNIT)).toBe(0);
    // Otra cuenta distinta sí suma.
    expect((await share("3.3.3.6", { userId: "visitante", userEmail: "visita@example.com" })).counted).toBe(true);
  });

  it("quien compró como invitado también es el dueño al entrar con el mismo correo", async () => {
    await own(UNIT, null as never, "invitado@example.com");
    expect((await share("3.3.3.4", { userId: "g-1", userEmail: "Invitado@Example.com" })).counted).toBe(false);
    expect((await share("3.3.3.5", { userId: "g-2", userEmail: "otro@example.com" })).counted).toBe(true);
  });

  it("los robots no suman", async () => {
    await own(UNIT);
    expect((await share("4.4.4.4", { userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)" })).counted).toBe(false);
    expect((await share("4.4.4.5", { userAgent: null })).counted).toBe(false);
  });

  it("una unidad desconocida se rechaza", async () => {
    await expect(recordShare({ unitId: "b:way/1; drop table", ip: "1.1.1.1", userAgent: CHROME })).rejects.toThrow();
  });

  it("el ranking ordena por puntos y solo incluye anuncios con anunciante", async () => {
    await own(UNIT);
    await own(OTHER, "owner-2", "otro@example.com");
    await share("1.1.1.1");
    await recordShare({ unitId: OTHER, ip: "1.1.1.1", userAgent: CHROME });
    await recordShare({ unitId: OTHER, ip: "2.2.2.2", userAgent: CHROME });
    const board = await getLeaderboards();
    expect(board.shared.map((row) => [row.unitId, row.shares])).toEqual([
      [OTHER, 2],
      [UNIT, 1],
    ]);
    expect(board.shared[0]?.owner).toBe("Mi marca");
  });
});
