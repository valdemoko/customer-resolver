import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  purchasesEnabled: true,
  PURCHASES_DISABLED_LABEL: "Compras próximamente",
  requireAppOrigin: () => "http://localhost:3000",
}));

import { MemoryStore } from "@/lib/market/store";
import { getMarketStore, setMarketStore } from "@/lib/market/service";
import { adminOverview } from "@/lib/admin/service";
import { isBot, madridDay, recordVisit, visitorHash } from "./visits";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "z".repeat(40));
  setMarketStore(new MemoryStore());
});

describe("detección de robots", () => {
  it("descarta robots, herramientas y navegadores sin identificar; deja pasar los de verdad", () => {
    for (const ua of [null, "", "curl/8.4", "Googlebot/2.1 (+http://www.google.com/bot.html)", "Mozilla/5.0 HeadlessChrome/130.0.0.0 Safari/537.36", "python-requests/2.31 abcdefghijkl", "Mozilla/5.0 (compatible; bingbot/2.0)", "Lighthouse Chrome-Lighthouse abc def"]) {
      expect(isBot(ua), String(ua)).toBe(true);
    }
    expect(isBot(CHROME)).toBe(false);
    expect(isBot(FIREFOX)).toBe(false);
  });
});

describe("el día cuenta en hora de Madrid", () => {
  it("23:30 UTC ya es el día siguiente en Madrid en verano, y en invierno no", () => {
    expect(madridDay(new Date("2026-10-10T23:30:00Z"))).toBe("2026-10-11"); // UTC+2
    expect(madridDay(new Date("2026-12-10T23:30:00Z"))).toBe("2026-12-11"); // UTC+1
    expect(madridDay(new Date("2026-12-10T22:30:00Z"))).toBe("2026-12-10");
  });
});

describe("huella del visitante", () => {
  it("es estable para la misma conexión y navegador, cambia si cambia cualquiera y no contiene la IP", async () => {
    const a = await visitorHash("1.2.3.4", CHROME);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await visitorHash("1.2.3.4", CHROME)).toBe(a);
    expect(await visitorHash("1.2.3.5", CHROME)).not.toBe(a);
    expect(await visitorHash("1.2.3.4", FIREFOX)).not.toBe(a);
    expect(await visitorHash("1.2.3.4", CHROME, "otro-secreto")).not.toBe(a); // con otro secreto no se reproduce
    expect(a).not.toContain("1.2.3.4");
  });
});

describe("contador de visitantes únicos", () => {
  const visit = (ip: string, ua: string | null, now: string) => recordVisit({ ip, userAgent: ua, now: new Date(now) });

  it("cuenta personas distintas, no visitas: repetir el mismo día no suma y los robots no cuentan", async () => {
    expect(await visit("1.1.1.1", CHROME, "2026-10-10T10:00:00Z")).toBe(true);
    expect(await visit("1.1.1.1", CHROME, "2026-10-10T18:00:00Z")).toBe(true); // misma persona, mismo día
    expect(await visit("2.2.2.2", FIREFOX, "2026-10-10T11:00:00Z")).toBe(true);
    expect(await visit("3.3.3.3", "Googlebot/2.1 (+http://www.google.com/bot.html)", "2026-10-10T11:00:00Z")).toBe(false);
    const store = await getMarketStore();
    const stats = await store.visitStats("2026-10-10");
    expect(stats).toMatchObject({ today: 2, last7: 2, last30: 2, total: 2, since: "2026-10-10" });
  });

  it("una persona que vuelve otro día cuenta en cada día pero una sola vez en los totales", async () => {
    await visit("1.1.1.1", CHROME, "2026-10-01T10:00:00Z");
    await visit("1.1.1.1", CHROME, "2026-10-09T10:00:00Z");
    await visit("2.2.2.2", FIREFOX, "2026-10-09T10:00:00Z");
    await visit("3.3.3.3", FIREFOX, "2026-10-10T10:00:00Z");
    const store = await getMarketStore();
    const stats = await store.visitStats("2026-10-10");
    expect(stats.today).toBe(1);
    expect(stats.last7).toBe(3); // 1.1.1.1 (9 oct), 2.2.2.2 y 3.3.3.3: el 1 de oct queda fuera de los 7 días
    expect(stats.last30).toBe(3);
    expect(stats.total).toBe(3);
    expect(stats.since).toBe("2026-10-01");
    expect(stats.byDay).toHaveLength(14);
    expect(stats.byDay.at(-1)).toEqual({ day: "2026-10-10", visitors: 1 });
    expect(stats.byDay.find((d) => d.day === "2026-10-09")?.visitors).toBe(2);
    expect(stats.byDay.find((d) => d.day === "2026-10-05")?.visitors).toBe(0);
  });

  it("las personas con cuenta de Google se cuentan una vez aunque entren muchas", async () => {
    const store = await getMarketStore();
    await store.recordLogin({ id: "g-1", email: "ana@example.com", name: "Ana" });
    await store.recordLogin({ id: "g-1", email: "ana@example.com", name: "Ana" });
    await store.recordLogin({ id: "g-2", email: "beto@example.com", name: "Beto" });
    expect((await store.visitStats("2026-10-10")).signedIn).toBe(2);
  });

  it("el resumen del panel incluye el contador", async () => {
    await recordVisit({ ip: "9.9.9.9", userAgent: CHROME });
    const overview = await adminOverview();
    expect(overview.visitors.total).toBe(1);
    expect(overview.visitors.byDay).toHaveLength(14);
  });
});
