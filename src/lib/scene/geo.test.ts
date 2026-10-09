import { describe, expect, it } from "vitest";
import {
  localFrame,
  toLocal,
  toLonLat,
  tilePointToLonLat,
  tileLonLatBounds,
  tilesForBounds,
  METERS_PER_DEG_LAT,
} from "./geo";

const MALAGA: [number, number] = [-4.4205, 36.72];

describe("proyección local", () => {
  it("ida y vuelta grados → metros → grados sin pérdida apreciable", () => {
    const frame = localFrame(MALAGA);
    // Un punto a media isla de distancia: es el orden de magnitud que importa.
    const [lon, lat] = [-4.4255, 36.7245];
    const [x, z] = toLocal(frame, lon, lat);
    const [backLon, backLat] = toLonLat(frame, [x, z]);
    expect(backLon).toBeCloseTo(lon, 10);
    expect(backLat).toBeCloseTo(lat, 10);
  });

  it("sitúa el norte en -z, que es hacia donde mira la cámara por defecto", () => {
    const frame = localFrame(MALAGA);
    const [x, z] = toLocal(frame, MALAGA[0], MALAGA[1] + 0.001);
    expect(x).toBeCloseTo(0, 6);
    expect(z).toBeLessThan(0);
    expect(Math.abs(z)).toBeCloseTo(0.001 * METERS_PER_DEG_LAT, 3);
  });
});

describe("coordenadas de tesela", () => {
  it("la esquina (0,0) es la esquina noroeste y la (extent,extent) la sureste", () => {
    // Esta comprobación existe porque el eje Y de una tesela va HACIA ABAJO: si
    // se olvida, la ciudad sale reflejada y no hay nada en el código que lo
    // delate salvo una comprobación contra las esquinas conocidas.
    const z = 17;
    const x = 63925;
    const y = 51144;
    const extent = 4096;
    const bounds = tileLonLatBounds(z, x, y);

    const [westLon, northLat] = tilePointToLonLat(z, x, y, extent, 0, 0);
    expect(westLon).toBeCloseTo(bounds.west, 9);
    expect(northLat).toBeCloseTo(bounds.north, 9);

    const [eastLon, southLat] = tilePointToLonLat(z, x, y, extent, extent, extent);
    expect(eastLon).toBeCloseTo(bounds.east, 9);
    expect(southLat).toBeCloseTo(bounds.south, 9);

    // Y el centro cae en medio de las dos. La latitud no da la media aritmética
    // exacta de las esquinas: la proyección de Mercator no es lineal en latitud,
    // así que la diferencia es del orden de 1e-8 grados (un milímetro). Se
    // tolera ese margen en lugar de exigir una igualdad que sería falsa.
    const [midLon, midLat] = tilePointToLonLat(z, x, y, extent, extent / 2, extent / 2);
    expect(midLon).toBeCloseTo((bounds.west + bounds.east) / 2, 9);
    expect(midLat).toBeCloseTo((bounds.south + bounds.north) / 2, 6);
  });

  it("una latitud mayor está más al norte, que es lo mismo que decir py menor", () => {
    const z = 17;
    const [lonA, latA] = tilePointToLonLat(z, 63925, 51144, 4096, 0, 0);
    const [lonB, latB] = tilePointToLonLat(z, 63925, 51144, 4096, 0, 2048);
    expect(lonA).toBeCloseTo(lonB, 9);
    expect(latA).toBeGreaterThan(latB);
  });
});

describe("teselas necesarias", () => {
  it("cubre el rectángulo pedido y no se sale del mundo", () => {
    const tiles = tilesForBounds(17, { west: -4.4283, south: 36.7138, east: -4.4128, north: 36.7262 });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThan(64);
    for (const tile of tiles) {
      expect(tile.z).toBe(17);
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThan(2 ** 17);
      expect(tile.y).toBeLessThan(2 ** 17);
    }
    // Todas las teselas contienen alguna parte del rectángulo.
    for (const tile of tiles) {
      const bounds = tileLonLatBounds(tile.z, tile.x, tile.y);
      expect(bounds.east).toBeGreaterThan(-4.4283);
      expect(bounds.west).toBeLessThan(-4.4128);
    }
  });
});

describe("conversión afín por tesela (B.4)", () => {
  it("interpolar entre las dos esquinas equivale a la inversa de Mercator con error < 1 mm", () => {
    const frame = localFrame([-4.4185, 36.715]);
    const z = 17;
    const x = 63922;
    const y = 51152;
    const extent = 4096;
    const exact = (px: number, py: number) => {
      const [lon, lat] = tilePointToLonLat(z, x, y, extent, px, py);
      return toLocal(frame, lon, lat);
    };
    const [x0, z0] = exact(0, 0);
    const [x1, z1] = exact(extent, extent);
    let worst = 0;
    for (let i = 0; i <= 40; i += 1) {
      for (let j = 0; j <= 40; j += 1) {
        const px = (i / 40) * extent;
        const py = (j / 40) * extent;
        const [ex, ez] = exact(px, py);
        const ax = x0 + ((x1 - x0) * px) / extent;
        const az = z0 + ((z1 - z0) * py) / extent;
        worst = Math.max(worst, Math.hypot(ex - ax, ez - az));
      }
    }
    expect(worst).toBeLessThan(0.001);
  });
});
