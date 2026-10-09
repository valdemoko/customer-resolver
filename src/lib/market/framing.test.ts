import { describe, expect, it } from "vitest";
import { coverUV, frameUV, roofUVs } from "./faces";
import { ContentSchema, DEFAULT_FRAMING } from "./types";

describe("encuadre de la foto", () => {
  it("centrada y sin ampliar es exactamente el recorte «cover»", () => {
    for (const [surface, image] of [[1, 2], [3, 1], [1.5, 1.5]] as const) {
      const cover = coverUV(surface, image);
      const frame = frameUV(surface, image, DEFAULT_FRAMING);
      cover.forEach((value, i) => expect(frame[i]).toBeCloseTo(value));
    }
  });

  it("ampliar reduce la ventana a 1/zoom y mantiene la proporción", () => {
    const [u0, v0, u1, v1] = frameUV(1, 2, { x: 0.5, y: 0.5, zoom: 2 });
    expect(u1 - u0).toBeCloseTo(0.25); // cover a zoom 1 ocupa 0,5 del ancho
    expect(v1 - v0).toBeCloseTo(0.5);
  });

  it("izquierda y derecha mueven la ventana de extremo a extremo sin salirse de la foto", () => {
    const left = frameUV(1, 2, { x: 0, y: 0.5, zoom: 1 });
    const right = frameUV(1, 2, { x: 1, y: 0.5, zoom: 1 });
    expect(left[0]).toBeCloseTo(0);
    expect(right[2]).toBeCloseTo(1);
    for (const w of [left, right]) w.forEach((value) => { expect(value).toBeGreaterThanOrEqual(-1e-9); expect(value).toBeLessThanOrEqual(1 + 1e-9); });
  });

  it("arriba es la parte alta de la foto (v = 1) y abajo la baja (v = 0)", () => {
    const top = frameUV(3, 1, { x: 0.5, y: 0, zoom: 1 });
    const bottom = frameUV(3, 1, { x: 0.5, y: 1, zoom: 1 });
    expect(top[3]).toBeCloseTo(1);
    expect(bottom[1]).toBeCloseTo(0);
  });

  it("valores fuera de rango se acotan", () => {
    const w = frameUV(1, 1, { x: -5, y: 9, zoom: 10 });
    expect(w[2] - w[0]).toBeCloseTo(1 / 3);
    w.forEach((value) => { expect(value).toBeGreaterThanOrEqual(-1e-9); expect(value).toBeLessThanOrEqual(1 + 1e-9); });
  });

  it("el techo respeta el encuadre", () => {
    const rect: Array<[number, number]> = [[0, 0], [40, 0], [40, 10], [0, 10]];
    const a = roofUVs(rect, 4, { x: 0.5, y: 0.5, zoom: 1 });
    const b = roofUVs(rect, 4, { x: 0.5, y: 0.5, zoom: 2 });
    const span = (list: Array<[number, number]>) => Math.max(...list.map((p) => p[0])) - Math.min(...list.map((p) => p[0]));
    expect(span(b)).toBeCloseTo(span(a) / 2);
  });

  it("el contenido sin encuadre lo recibe centrado y el servidor rechaza valores absurdos", () => {
    expect(ContentSchema.parse({ name: "Panadería" }).framing).toEqual(DEFAULT_FRAMING);
    expect(ContentSchema.safeParse({ name: "Panadería", framing: { x: 0.2, y: 0.8, zoom: 2 } }).success).toBe(true);
    expect(ContentSchema.safeParse({ name: "Panadería", framing: { x: 2, y: 0, zoom: 1 } }).success).toBe(false);
    expect(ContentSchema.safeParse({ name: "Panadería", framing: { x: 0, y: 0, zoom: 9 } }).success).toBe(false);
  });
});
