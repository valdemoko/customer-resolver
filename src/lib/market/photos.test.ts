import { describe, expect, it } from "vitest";
import { coverUV, roofUVs, unitHasRoof } from "./faces";
import { ContentSchema } from "./types";

describe("encuadre «cover» de las fotos", () => {
  it("una foto más ancha que la superficie se recorta por los lados, centrada", () => {
    const [u0, v0, u1, v1] = coverUV(1, 2); // superficie cuadrada, foto 2:1
    expect([v0, v1]).toEqual([0, 1]);
    expect(u0).toBeCloseTo(0.25);
    expect(u1).toBeCloseTo(0.75);
  });

  it("una foto más alta se recorta por arriba y por abajo", () => {
    const [u0, v0, u1, v1] = coverUV(3, 1); // cartel 3:1, foto cuadrada
    expect([u0, u1]).toEqual([0, 1]);
    expect(v1 - v0).toBeCloseTo(1 / 3);
    expect((v0 + v1) / 2).toBeCloseTo(0.5);
  });

  it("con la misma relación no se recorta nada, y con datos inválidos tampoco", () => {
    expect(coverUV(1.5, 1.5)).toEqual([0, 0, 1, 1]);
    expect(coverUV(0, 2)).toEqual([0, 0, 1, 1]);
    expect(coverUV(2, Number.NaN)).toEqual([0, 0, 1, 1]);
  });
});

describe("foto del techo", () => {
  const rect: Array<[number, number]> = [[0, 0], [40, 0], [40, 10], [0, 10]];

  it("todas las coordenadas caen dentro de la imagen y la foto cubre la huella", () => {
    const uvs = roofUVs(rect, 4); // huella 4:1 y foto 4:1: se usa entera
    for (const [u, v] of uvs) {
      expect(u).toBeGreaterThanOrEqual(-1e-9);
      expect(u).toBeLessThanOrEqual(1 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
    const us = uvs.map((p) => p[0]);
    const vs = uvs.map((p) => p[1]);
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(1);
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(1);
  });

  it("la huella girada da el mismo reparto que sin girar (se alinea con su lado largo)", () => {
    const angle = 0.7;
    const turned = rect.map(([x, z]) => [x * Math.cos(angle) - z * Math.sin(angle), x * Math.sin(angle) + z * Math.cos(angle)] as [number, number]);
    const a = roofUVs(rect, 2).map((p) => p[0]);
    const b = roofUVs(turned, 2).map((p) => p[0]);
    expect(Math.max(...b) - Math.min(...b)).toBeCloseTo(Math.max(...a) - Math.min(...a));
  });

  it("solo edificios y tramos de muralla tienen techo", () => {
    expect(unitHasRoof("b:way/1")).toBe(true);
    expect(unitHasRoof("w:gibralfaro:05")).toBe(true);
    for (const id of ["p:L-aaaaaaa", "s:cruise-1:0", "v:3", "a:plane-1"]) expect(unitHasRoof(id)).toBe(false);
  });
});

describe("contenido con foto de techo", () => {
  const PIXEL = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
  it("acepta `all` y `roof` y rechaza claves desconocidas", () => {
    const ok = ContentSchema.safeParse({ name: "Panadería", images: { all: PIXEL, roof: PIXEL }, sameForAll: true });
    expect(ok.success).toBe(true);
    const bad = ContentSchema.safeParse({ name: "Panadería", images: { techo: PIXEL } });
    expect(bad.success).toBe(false);
  });
});
