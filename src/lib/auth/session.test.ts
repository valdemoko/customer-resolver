import { beforeAll, describe, expect, it, vi } from "vitest";
import { exchangeCode, safeNext } from "./google";
import { createSessionToken, readSessionToken, signValue, verifySigned } from "./session";
import { MemoryStore } from "../market/store";
import type { Content } from "../market/types";

const user = { id: "1234567890", email: "ana@example.com", name: "Ana Pérez", picture: "https://example.com/a.png" };

beforeAll(() => {
  vi.stubEnv("SESSION_SECRET", "x".repeat(40));
});

describe("sesión firmada", () => {
  it("una sesión válida se lee de vuelta", async () => {
    const token = await createSessionToken(user);
    expect(await readSessionToken(token)).toEqual(user);
  });

  it("una cookie manipulada o sin firma se rechaza", async () => {
    const token = await createSessionToken(user);
    const [body, signature] = token.split(".");
    const forged = `${btoa(JSON.stringify({ ...user, id: "otro", exp: 9999999999 })).replace(/=+$/, "")}.${signature}`;
    expect(await readSessionToken(forged)).toBeNull();
    expect(await readSessionToken(body)).toBeNull();
    expect(await readSessionToken(undefined)).toBeNull();
    expect(await readSessionToken("basura")).toBeNull();
  });

  it("caduca a los 30 días", async () => {
    const token = await createSessionToken(user, Date.now());
    expect(await readSessionToken(token, Date.now() + 29 * 86400_000)).toEqual(user);
    expect(await readSessionToken(token, Date.now() + 31 * 86400_000)).toBeNull();
  });

  it("firmar y verificar es consistente y cambiar un carácter lo rompe", async () => {
    const signed = await signValue("estado|/cuenta");
    expect(await verifySigned(signed)).toBe("estado|/cuenta");
    expect(await verifySigned(signed.replace("estado", "estada"))).toBeNull();
  });
});

describe("acceso con Google", () => {
  it("solo acepta rutas internas de vuelta", () => {
    expect(safeNext("/city/malaga/viewer?unit=b:relation/9237518")).toBe("/city/malaga/viewer?unit=b:relation/9237518");
    expect(safeNext("//evil.com")).toBe("/cuenta");
    expect(safeNext("https://evil.com")).toBe("/cuenta");
    expect(safeNext("/\\evil.com")).toBe("/cuenta");
    expect(safeNext(null)).toBe("/cuenta");
  });

  function idToken(claims: Record<string, unknown>) {
    return `h.${btoa(JSON.stringify(claims)).replace(/=+$/, "")}.s`;
  }

  it("valida emisor, audiencia y caducidad del id_token", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "client-123");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secreto");
    vi.stubEnv("APP_ORIGIN", "https://resolveo.site");
    const base = { sub: "42", email: "ana@example.com", email_verified: true, name: "Ana", iss: "https://accounts.google.com", aud: "client-123", exp: Math.floor(Date.now() / 1000) + 600 };
    const reply = (claims: Record<string, unknown>) => (async () => new Response(JSON.stringify({ id_token: idToken(claims) }))) as unknown as typeof fetch;
    await expect(exchangeCode("c", reply(base))).resolves.toMatchObject({ id: "42", email: "ana@example.com", name: "Ana" });
    await expect(exchangeCode("c", reply({ ...base, aud: "otro" }))).rejects.toThrow();
    await expect(exchangeCode("c", reply({ ...base, iss: "https://evil.com" }))).rejects.toThrow();
    await expect(exchangeCode("c", reply({ ...base, exp: 1 }))).rejects.toThrow();
    await expect(exchangeCode("c", reply({ ...base, email_verified: false }))).rejects.toThrow();
  });
});

describe("compras de una cuenta", () => {
  const content = (name: string): Content => ({ name, url: "", description: "", logo: "", sameForAll: false, images: {}, framing: { x: 0.5, y: 0.5, zoom: 1 } }) as Content;

  it("lista solo las suyas y marca si el espacio sigue siendo suyo", async () => {
    const store = new MemoryStore();
    const buy = async (n: number, unitId: string, userId: string | null, name: string) => {
      const before = (await store.getUnit(unitId))?.purchases ?? 0;
      await store.saveDraft({ id: `d${n}`, unitId, content: content(name), purchasesAtCreation: before, createdAt: new Date().toISOString(), userId });
      await store.completePurchase({ sessionId: `s${n}`, draftId: `d${n}`, amountCents: 100 * n });
    };
    await buy(1, "b:way/1", "ana", "Café Ana");
    await buy(2, "b:way/2", "ana", "Tienda Ana");
    await buy(3, "b:way/1", "beto", "Beto SL"); // Beto le quita el espacio 1 a Ana
    await buy(4, "b:way/3", null, "Anónimo");
    const mine = await store.userPurchases("ana");
    expect(mine.map((p) => [p.unitId, p.current])).toEqual([
      ["b:way/2", true],
      ["b:way/1", false],
    ]);
    expect(await store.userPurchases("beto")).toHaveLength(1);
    expect(await store.userPurchases("nadie")).toEqual([]);
  });
});
