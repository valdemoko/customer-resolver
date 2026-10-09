import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import units from "@/data/market/units-malaga.json";

const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/lib/env", () => ({
  get purchasesEnabled() {
    return flags.enabled;
  },
  PURCHASES_DISABLED_LABEL: "Compras próximamente",
  requireAppOrigin: () => "http://localhost:3000",
}));

import { MemoryStore } from "./store";
import {
  MarketError,
  completeFromSession,
  confirmSession,
  createCheckout,
  getMarketState,
  getUnitImage,
  getUnitView,
  handleWebhook,
  parseContent,
  setMarketStore,
} from "./service";
import { priceForPurchases } from "./pricing";
import { isKnownUnit } from "./units";

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const BUILDING = `b:${units.buildings[0]}`;
const PARCEL = `p:${units.parcels[0]}`;
const WALL = units.walls[0] as string;

function fakeStripe(sessionId = "cs_test_abc123") {
  const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
    id: sessionId,
    url: `https://checkout.stripe.test/${sessionId}`,
    metadata: params.metadata,
    amount_total: params.line_items?.[0]?.price_data?.unit_amount ?? 0,
    payment_status: "unpaid",
  }));
  const retrieve = vi.fn();
  return {
    stripe: { checkout: { sessions: { create, retrieve } }, webhooks: { constructEventAsync: vi.fn() } } as unknown as Stripe,
    create,
    retrieve,
  };
}

const validContent = { name: "Panadería Sol", url: "https://example.com", description: "Pan de verdad.", images: { f0: PIXEL } };

beforeEach(() => {
  flags.enabled = true;
  setMarketStore(new MemoryStore());
});

describe("precio incremental", () => {
  it("1,00 € la primera vez y +25 % por cada compra (serie de money.ts)", () => {
    expect([0, 1, 2, 3, 4].map(priceForPurchases)).toEqual([100, 125, 156, 195, 244]);
  });
  it("nunca baja y tiene tope de seguridad", () => {
    for (let n = 1; n < 55; n += 1) expect(priceForPurchases(n)).toBeGreaterThan(priceForPurchases(n - 1));
    expect(() => priceForPurchases(-1)).toThrow();
    expect(priceForPurchases(10_000)).toBe(99_999_999);
  });
});

describe("unidades válidas", () => {
  it("solo se venden identificadores que existen en los datos o en la configuración", () => {
    expect(isKnownUnit(BUILDING)).toBe(true);
    expect(isKnownUnit(PARCEL)).toBe(true);
    expect(isKnownUnit(WALL)).toBe(true);
    expect(isKnownUnit("s:cruise-2:5")).toBe(true);
    expect(isKnownUnit("v:7")).toBe(true);
    expect(isKnownUnit("a:plane-3")).toBe(true);
    for (const bad of ["b:way/999999999999", "p:L-zzzzzzz", "w:gibralfaro:99", "s:cruise-9:0", "v:999", "a:plane-9", "x:1", "", "b:way/1; drop"]) {
      expect(isKnownUnit(bad), bad).toBe(false);
    }
  });
});

describe("contenido", () => {
  it("acepta un anuncio válido y rechaza URL, nombre o imágenes no válidos", () => {
    expect(parseContent(validContent).name).toBe("Panadería Sol");
    expect(() => parseContent({ ...validContent, url: "javascript:alert(1)" })).toThrow(MarketError);
    expect(() => parseContent({ ...validContent, name: "x" })).toThrow(MarketError);
    expect(() => parseContent({ ...validContent, images: { f0: "https://evil.example/x.png" } })).toThrow(MarketError);
    expect(() => parseContent({ ...validContent, images: { zz: PIXEL } })).toThrow(MarketError);
    expect(() => parseContent({ ...validContent, sameForAll: true })).toThrow(/común/);
  });
});

describe("compra con Stripe", () => {
  it("con las compras apagadas no se crea ninguna sesión (no existe modo simulado)", async () => {
    flags.enabled = false;
    const { stripe, create } = fakeStripe();
    await expect(createCheckout({ unitId: BUILDING, content: validContent }, { stripe })).rejects.toMatchObject({ status: 403 });
    expect(create).not.toHaveBeenCalled();
  });

  it("la primera compra cuesta 1,00 € y el importe lo fija el servidor", async () => {
    const { stripe, create } = fakeStripe();
    const result = await createCheckout({ unitId: BUILDING, content: validContent, returnPath: "/city/malaga/viewer" }, { stripe });
    expect(result.amountCents).toBe(100);
    const call = create.mock.calls[0]?.[0];
    expect(call?.line_items?.[0]?.price_data?.unit_amount).toBe(100);
    expect(call?.line_items?.[0]?.price_data?.currency).toBe("eur");
    expect(call?.mode).toBe("payment");
    expect(call?.metadata?.unitId).toBe(BUILDING);
    expect(call?.success_url).toContain("session_id={CHECKOUT_SESSION_ID}");
  });

  it("rechaza unidades desconocidas y contenido inválido sin tocar Stripe", async () => {
    const { stripe, create } = fakeStripe();
    await expect(createCheckout({ unitId: "b:way/1", content: validContent }, { stripe })).rejects.toMatchObject({ status: 404 });
    await expect(createCheckout({ unitId: BUILDING, content: { name: "" } }, { stripe })).rejects.toMatchObject({ status: 400 });
    expect(create).not.toHaveBeenCalled();
  });

  it("un pago completado aplica la compra UNA sola vez y sube el precio", async () => {
    const { stripe, create } = fakeStripe();
    await createCheckout({ unitId: BUILDING, content: validContent }, { stripe });
    const draftId = create.mock.calls[0]?.[0].metadata?.draftId as string;
    const session = { id: "cs_test_abc123", payment_status: "paid" as const, amount_total: 100, metadata: { draftId, unitId: BUILDING } };

    const first = await completeFromSession(session);
    expect(first?.applied).toBe(true);
    expect(first?.unit.purchases).toBe(1);
    expect(first?.unit.priceCents).toBe(125);
    const second = await completeFromSession(session);
    expect(second?.applied).toBe(false);
    expect(second?.unit.purchases).toBe(1);

    const view = await getUnitView(BUILDING);
    expect(view.owned).toBe(true);
    expect(view.owner?.name).toBe("Panadería Sol");
    expect(view.owner?.faces).toEqual(["f0"]);

    // La siguiente compra de la misma unidad cuesta 1,25 € y sustituye al anterior propietario.
    const next = await createCheckout({ unitId: BUILDING, content: { ...validContent, name: "Librería Luna" } }, { stripe: fakeStripe("cs_test_def456").stripe });
    expect(next.amountCents).toBe(125);
  });

  it("un pago sin completar no aplica nada", async () => {
    const { stripe, create } = fakeStripe();
    await createCheckout({ unitId: PARCEL, content: validContent }, { stripe });
    const draftId = create.mock.calls[0]?.[0].metadata?.draftId as string;
    expect(await completeFromSession({ id: "cs_test_x", payment_status: "unpaid", amount_total: 100, metadata: { draftId, unitId: PARCEL } })).toBeNull();
    expect((await getMarketState()).units).toHaveLength(0);
  });

  it("no se aplica un borrador a otra unidad ni con metadatos manipulados", async () => {
    expect(await completeFromSession({ id: "cs_test_y", payment_status: "paid", amount_total: 100, metadata: { draftId: "dr_nope", unitId: BUILDING } })).toBeNull();
    expect(await completeFromSession({ id: "cs_test_z", payment_status: "paid", amount_total: 100, metadata: { draftId: "dr_x", unitId: "b:way/1" } })).toBeNull();
  });

  it("el retorno del navegador consulta la sesión a Stripe y es idempotente con el webhook", async () => {
    const { stripe, create, retrieve } = fakeStripe("cs_test_ret999");
    await createCheckout({ unitId: WALL, content: validContent }, { stripe });
    const draftId = create.mock.calls[0]?.[0].metadata?.draftId as string;
    retrieve.mockResolvedValue({ id: "cs_test_ret999", payment_status: "paid", amount_total: 100, metadata: { draftId, unitId: WALL } });
    const done = await confirmSession("cs_test_ret999", { stripe });
    expect(done.applied).toBe(true);

    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    (stripe.webhooks.constructEventAsync as ReturnType<typeof vi.fn>).mockResolvedValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_ret999", payment_status: "paid", amount_total: 100, metadata: { draftId, unitId: WALL } } },
    });
    await handleWebhook("{}", "t=1,v1=abc", { stripe });
    expect((await getUnitView(WALL)).purchases).toBe(1);
    vi.unstubAllEnvs();
  });

  it("el webhook rechaza firmas ausentes o inválidas", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    const { stripe } = fakeStripe();
    await expect(handleWebhook("{}", null, { stripe })).rejects.toMatchObject({ status: 400 });
    (stripe.webhooks.constructEventAsync as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("bad"));
    await expect(handleWebhook("{}", "x", { stripe })).rejects.toMatchObject({ status: 400 });
    vi.unstubAllEnvs();
  });

  it("sesiones con formato inválido no llegan a Stripe", async () => {
    await expect(confirmSession("not-a-session")).rejects.toMatchObject({ status: 400 });
  });
});

describe("imágenes", () => {
  it("se sirve la imagen de una cara y la común a todas", async () => {
    const store = new MemoryStore();
    setMarketStore(store);
    await store.saveDraft({
      id: "dr_1",
      unitId: BUILDING,
      content: parseContent({ ...validContent, sameForAll: true, images: { all: PIXEL } }),
      purchasesAtCreation: 0,
      createdAt: new Date().toISOString(),
    });
    await store.completePurchase({ sessionId: "cs_test_1", draftId: "dr_1", amountCents: 100 });
    const image = await getUnitImage(BUILDING, "f3");
    expect(image?.mime).toBe("image/png");
    expect(image?.bytes.length).toBeGreaterThan(20);
    // Una sola foto por espacio: hace también de logo y de techo.
    expect((await getUnitImage(BUILDING, "logo"))?.mime).toBe("image/png");
    expect((await getUnitImage(BUILDING, "roof"))?.mime).toBe("image/png");
    expect(await getUnitImage("b:way/1", "all")).toBeNull();
  });
});
