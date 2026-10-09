import { describe, expect, it } from "vitest";
import { cities, getCityBySlug } from "@/lib/cities/registry";
import { sceneFitsCoverage } from "@/lib/cities/schema";
import { boundsOfLocalRing } from "./tiles";
import { regularPolygon } from "./polygon";
import { localFrame, tilesForBounds, toLocal } from "./geo";

/**
 * Estas comprobaciones son sobre la CIUDAD REAL, no sobre un ejemplo: si alguien
 * mueve el círculo, la banda o la cámara, aquí se ve antes de compilar.
 */

const malaga = getCityBySlug("malaga");

function frame() {
  if (!malaga) throw new Error("Málaga debería estar en el registro");
  return localFrame(malaga.scene.coverage.circle.center as [number, number]);
}

/** Distancia (m) de un punto [lon, lat] al centro del círculo. */
function distanceFromCenter(lon: number, lat: number): number {
  const [x, z] = toLocal(frame(), lon, lat);
  return Math.hypot(x, z);
}

describe("configuración de la escena (zona circular)", () => {
  it("el círculo más su banda cabe dentro del área con datos", () => {
    for (const city of cities) {
      if (!city.tiles) continue;
      expect(sceneFitsCoverage(city)).toBe(true);
    }
  });

  it("el origen de la escena es el centro del círculo", () => {
    expect(malaga).toBeDefined();
    if (!malaga) return;
    expect(malaga.scene.center).toEqual(malaga.scene.coverage.circle.center);
  });

  it("la banda de difuminado es radial y las teselas que hacen falta existen", () => {
    expect(malaga?.tiles).toBeTruthy();
    if (!malaga?.tiles) return;
    const { circle, fadeBandM } = malaga.scene.coverage;
    const clip = regularPolygon(circle.radiusM + fadeBandM + 60, 128, "circumscribed");
    const bounds = boundsOfLocalRing(malaga.scene.center as [number, number], clip);
    const tiles = tilesForBounds(malaga.scene.detailZoom, bounds);
    expect(malaga.tiles.dataVersion).toMatch(/^\d{4}\.\d{2}\.\d+$/);
    expect(tiles.length).toBeGreaterThan(150);
    expect(tiles.length).toBeLessThanOrEqual(520);
    expect(fadeBandM).toBeGreaterThanOrEqual(60);
  });

  it("el radio incluye el centro histórico, el puerto, Muelle Uno, la Alcazaba y Gibralfaro", () => {
    expect(malaga).toBeDefined();
    if (!malaga) return;
    const radius = malaga.scene.coverage.circle.radiusM;
    const places: Record<string, [number, number]> = {
      "Calle Larios": [-4.421622, 36.719828],
      Catedral: [-4.4195, 36.7202],
      "Plaza de la Marina": [-4.4207, 36.7167],
      "Muelle Uno (huella OSM, extremo este)": [-4.41232, 36.7168],
      "Muelle Uno (extremo norte)": [-4.4139, 36.7192],
      Alcazaba: [-4.4158, 36.7212],
      "Castillo de Gibralfaro": [-4.4115, 36.7236],
      "Terminal de cruceros (Muelle de Levante)": [-4.4146, 36.7068],
      "Faro de Málaga": [-4.41455, 36.71417],
    };
    for (const [name, [lon, lat]] of Object.entries(places)) {
      expect(distanceFromCenter(lon, lat), name).toBeLessThan(radius - 60);
    }
  });

  it("la vista inicial cae dentro de la zona nítida", () => {
    expect(malaga).toBeDefined();
    if (!malaga) return;
    const d = distanceFromCenter(malaga.initialView.center[0], malaga.initialView.center[1]);
    expect(d).toBeLessThan(malaga.scene.coverage.circle.radiusM - 300);
  });

  it("los límites de cámara son coherentes y permiten acercarse a pie de calle", () => {
    expect(malaga).toBeDefined();
    if (!malaga) return;
    const camera = malaga.scene.camera;
    expect(camera.minDistanceM).toBeLessThan(camera.maxDistanceM);
    expect(camera.minDistanceM).toBeLessThanOrEqual(40);
    expect(camera.minPitchDeg).toBeLessThan(camera.maxPitchDeg);
    expect(camera.initialDistanceM).toBeGreaterThanOrEqual(camera.minDistanceM);
    expect(camera.initialDistanceM).toBeLessThanOrEqual(camera.maxDistanceM);
    expect(camera.initialPitchDeg).toBeGreaterThanOrEqual(camera.minPitchDeg);
    expect(camera.initialPitchDeg).toBeLessThanOrEqual(camera.maxPitchDeg);
    expect(camera.rotationSeconds).toBeGreaterThanOrEqual(90);
    expect(camera.rotationSeconds).toBeLessThanOrEqual(120);
    expect(camera.returnDurationMs).toBeGreaterThanOrEqual(1200);
    expect(camera.returnDurationMs).toBeLessThanOrEqual(1800);
    expect(camera.idleReturnMs).toBe(5000);
  });

  it("la exageración vertical es un único factor uniforme y configurable", () => {
    expect(malaga).toBeDefined();
    if (!malaga) return;
    expect(malaga.scene.verticalExaggeration.factor).toBe(1.25);
    expect(malaga.scene.verticalExaggeration.note).toMatch(/NO modifica los datos/);
  });

  it("cada emblemático y cada fortaleza declaran de dónde sale su altura", () => {
    expect(malaga).toBeDefined();
    if (!malaga) return;
    for (const landmark of malaga.scene.landmarks) {
      expect(landmark.osmId).toMatch(/^(way|relation)\//);
      expect(landmark.heightSource.length).toBeGreaterThan(10);
      if (landmark.modelUrl) expect(landmark.fidelity).toBe("detailed");
    }
    for (const fortress of malaga.scene.fortresses) {
      expect(fortress.heightSource.length).toBeGreaterThan(30);
      // Sin fuente técnica de alturas: el conjunto es siempre «simplificado».
      expect(fortress.fidelity).toBe("simplified");
    }
  });

  it("el agua tiene nivel por debajo del suelo para cada tipo", () => {
    expect(malaga).toBeDefined();
    if (!malaga) return;
    for (const level of Object.values(malaga.scene.water.levelsM)) expect(level).toBeLessThan(0);
    expect(malaga.scene.water.levelsM.sea).toBeLessThanOrEqual(-1);
  });

  it("los cruceros no llevan nombres ni librea de navieras", () => {
    expect(malaga).toBeDefined();
    if (!malaga) return;
    expect(malaga.scene.ships.cruise.length).toBeGreaterThanOrEqual(2);
    expect(malaga.scene.ships.cruise.length).toBeLessThanOrEqual(3);
    expect(malaga.scene.ships.note).toMatch(/sin nombres, logotipos ni librea/i);
  });

  it("no hay elevación declarada: la ciudad se muestra plana y se dice", () => {
    expect(malaga).toBeDefined();
    if (!malaga) return;
    expect(malaga.terrain).toBeNull();
  });
});
