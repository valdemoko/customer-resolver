/**
 * Verificación de la Fase B.4 en Chrome real sobre el build de producción.
 *
 *   node tools/verify-port.mjs [--url http://localhost:3210] [--out docs/verification/shots/port]
 *                              [--only circle,water,flicker,exaggeration,alcazaba,port,parcels,mobile]
 *
 * Escribe capturas y `verify-port-results.json` con cada comprobación (pasa /
 * falla y con qué cifra). Lo visual se mira en las capturas; aquí solo se
 * comprueba lo que admite una medida.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const base = value("url", "http://localhost:3210");
const out = value("out", "docs/verification/shots/port");
const only = new Set((value("only", "") || "").split(",").filter(Boolean));
const run = (name) => only.size === 0 || only.has(name);
await mkdir(out, { recursive: true });

const city = JSON.parse(await readFile("src/data/cities/malaga.geo.json", "utf8"));
const [ORIGIN_LON, ORIGIN_LAT] = city.scene.coverage.circle.center;
const R = city.scene.coverage.circle.radiusM;
const BAND = city.scene.coverage.fadeBandM;
const HOME = city.scene.camera.initialDistanceM;
const MAX_DISTANCE = city.scene.camera.maxDistanceM;
const K = city.scene.verticalExaggeration.factor;
const local = (lon, lat) => [(lon - ORIGIN_LON) * 111320 * Math.cos((ORIGIN_LAT * Math.PI) / 180), -(lat - ORIGIN_LAT) * 111132];

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
const results = [];
const check = (name, pass, evidence) => {
  results.push({ name, pass: Boolean(pass), evidence });
  console.log(`${pass ? "PASS" : "FAIL"} · ${name} · ${JSON.stringify(evidence)}`);
};

async function open(contextOptions = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  await page.goto(`${base}/city/malaga/viewer`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-island-ready='true']", { timeout: 120_000 });
  // El ranking del visor tapa una esquina del lienzo: estas mediciones geométricas lo apartan.
  await page.addStyleTag({ content: "section[aria-label='Los espacios más caros']{display:none!important}" });
  await page.waitForTimeout(900);
  return { context, page, errors };
}
const api = (page, fn, arg) => page.evaluate(([f, a]) => window.__alzadoIsland[f](...(a ?? [])), [fn, arg]);
const pose = (page, p) => page.evaluate((x) => window.__alzadoIsland.setPose(x), p);
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`) });
async function freeze(page) {
  const button = page.getByRole("button", { name: /Pausar el giro/ });
  if (await button.count()) await button.click();
}

/** Ruido en zonas PLANAS entre dos fotogramas con un desplazamiento mínimo. */
async function flatNoise(page, makePose) {
  await page.evaluate(() => window.__alzadoIsland.freezeTime(true));
  await pose(page, makePose(1));
  await page.waitForTimeout(1600);
  const a = await page.screenshot();
  await pose(page, makePose(1.0004));
  await page.waitForTimeout(1600);
  const b = await page.screenshot();
  const result = await page.evaluate(
    async ({ a, b }) => {
      const load = (b64) =>
        new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.src = `data:image/png;base64,${b64}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = ia.width;
      const h = ia.height;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(ia, 0, 0);
      const da = ctx.getImageData(0, 0, w, h).data;
      ctx.drawImage(ib, 0, 0);
      const db = ctx.getImageData(0, 0, w, h).data;
      const lum = (d, i) => d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
      let flat = 0;
      let noisy = 0;
      for (let y = 6; y < h - 6; y += 2) {
        for (let x = 6; x < w - 6; x += 2) {
          const i = y * w + x;
          // «Plano»: vecindad 13×13 (esquinas y centro) casi constante en A.
          const c = lum(da, i);
          let calm = true;
          for (const [dx, dy] of [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, -6], [0, 6], [-6, 0], [6, 0]]) {
            if (Math.abs(lum(da, (y + dy) * w + x + dx) - c) > 14) {
              calm = false;
              break;
            }
          }
          if (!calm) continue;
          flat += 1;
          const diff = Math.abs(da[i * 4] - db[i * 4]) + Math.abs(da[i * 4 + 1] - db[i * 4 + 1]) + Math.abs(da[i * 4 + 2] - db[i * 4 + 2]);
          if (diff > 45) noisy += 1;
        }
      }
      return { flatSamples: flat, noisy, share: flat ? noisy / flat : 0 };
    },
    { a: a.toString("base64"), b: b.toString("base64") },
  );
  await page.evaluate(() => window.__alzadoIsland.freezeTime(false));
  return result;
}

/* ------------------------------------------------------------------ círculo */
if (run("circle")) {
  const { context, page, errors } = await open();
  await freeze(page);
  const rings = await page.evaluate(() => ({
    core: window.__alzadoIsland.coreBounds(),
    clip: window.__alzadoIsland.clipBounds(),
  }));
  const radii = (ring) => ring.map(([x, z]) => Math.hypot(x, z));
  const coreR = radii(rings.core);
  const clipR = radii(rings.clip);
  check("círculo: la zona de cámara es un polígono de 128 lados sobre el círculo del radio configurado más 120 m de margen para encuadrar las casas del borde", rings.core.length === 128 && Math.max(...coreR) - Math.min(...coreR) < 1e-6 && Math.abs(coreR[0] - (R + 120)) < 1e-6, { sides: rings.core.length, radius: coreR[0], R, margin: 120 });
  check("círculo: el recorte (círculo + banda + holgura) lo contiene entero", Math.min(...clipR) >= R + BAND + 60 - 1e-6, { minClip: Math.round(Math.min(...clipR)), needed: R + BAND + 60 });

  // Con el zoom máximo en 3.500 m la perspectiva alarga un poco el círculo hacia la cámara: se tolera un 12 % (antes, con 5.200 m, bastaba un 4,5 %).
  // Silueta vista desde arriba: radio de la zona visible por ángulo, medido sobre
  // la captura (sin nubes) a partir de la proyección del centro del círculo.
  await page.evaluate(() => window.__alzadoIsland.setClouds(0));
  // El zoom máximo (3.500 m) deja el círculo más grande que una ventana de 900 px: se mide en una ventana alta.
  await page.setViewportSize({ width: 2200, height: 1500 });
  await pose(page, { azimuthDeg: 0, pitchDeg: 80, distance: MAX_DISTANCE, target: [0, 0] });
  await page.waitForTimeout(1500);
  await shot(page, "circulo-cenital");
  const centre = await api(page, "screenOfPoint", [0, 0, 0]);
  const png = await page.screenshot();
  const radial = await page.evaluate(
    async ({ b64, centre }) => {
      const image = new Image();
      await new Promise((resolve) => {
        image.onload = resolve;
        image.src = `data:image/png;base64,${b64}`;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, image.width, image.height);
      // Color de fondo: la esquina superior izquierda (cielo/niebla).
      const bg = [data[(60 * width + 60) * 4], data[(60 * width + 60) * 4 + 1], data[(60 * width + 60) * 4 + 2]];
      const radii = [];
      for (let deg = 0; deg < 360; deg += 6) {
        const a = (deg * Math.PI) / 180;
        let last = 0;
        for (let r = 20; r < 1100; r += 1) {
          const x = Math.round(centre.x + Math.cos(a) * r);
          const y = Math.round(centre.y + Math.sin(a) * r);
          // Solo el lienzo: se excluyen la franja derecha (sin lienzo) y los botones.
          if (x < 0 || y < 56 || x >= width - 24 || y >= height) break;
          const i = (y * width + x) * 4;
          const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
          if (d > 14) last = r; // umbral bajo: el fondo es oscuro y el borde se funde con él
        }
        radii.push(last);
      }
      return radii;
    },
    { b64: png.toString("base64"), centre },
  );
  const mean = radial.reduce((s, r) => s + r, 0) / radial.length;
  const sd = Math.sqrt(radial.reduce((s, r) => s + (r - mean) ** 2, 0) / radial.length);
  const ratio = sd / mean;
  await page.setViewportSize({ width: 1440, height: 900 });
  check("círculo: la silueta de la zona visible es redonda (radio casi constante en 60 direcciones, sin esquinas)", ratio < 0.12 && Math.min(...radial) > 0, { meanPx: Math.round(mean), sdPx: Number(sd.toFixed(1)), ratio: Number(ratio.toFixed(4)), minPx: Math.min(...radial), maxPx: Math.max(...radial) });
  await page.evaluate(() => window.__alzadoIsland.setClouds(30));

  // Cuatro rumbos a baja inclinación y una cenital: capturas para mirar los bordes.
  for (const az of [0, 90, 180, 270]) {
    await pose(page, { azimuthDeg: az, pitchDeg: 6, distance: MAX_DISTANCE, target: [0, 0] });
    await page.waitForTimeout(700);
    await shot(page, `circulo-borde-az${az}`);
  }
  check("círculo: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

/* -------------------------------------------------------- agua y parpadeo */
if (run("water") || run("flicker")) {
  const { context, page, errors } = await open();
  await freeze(page);
  const water = await api(page, "waterStats");
  const ground = await api(page, "groundStats");
  check("agua: una superficie de mar + masas menores, con paredes de muelle", water.masses >= 20 && water.byKind.sea >= 1 && water.wallSegments > 1000, water);
  check("agua: el campo de distancia a la costa se calcula al cargar (≤ 250 ms)", water.shoreFieldMs <= 250 && water.shoreFieldPx >= 1024, { ms: water.shoreFieldMs, px: water.shoreFieldPx });
  check("suelo: las clases de superficie están separadas (15 clases como máximo, una malla cada una)", ground.classes >= 8 && ground.classes <= 16 && ground.drawCalls === ground.classes, ground);

  const zones = {
    "paseo-del-parque": [-4.4169, 36.7168],
    guadalmedina: [-4.4292, 36.7212],
    "muelle-uno": [-4.4141, 36.7165],
    palmeral: [-4.4172, 36.7180],
    "dique-levante": [-4.4146, 36.7060],
  };
  const poses = [
    { tag: "lejos", distance: 1500, pitch: 38, az: 195 },
    { tag: "medio", distance: 420, pitch: 32, az: 285 },
    { tag: "profundo", distance: 90, pitch: 26, az: 15 },
    { tag: "profundo-rasante", distance: 60, pitch: 10, az: 105 },
  ];
  let worst = { share: 0 };
  const rows = [];
  for (const [place, [lon, lat]] of Object.entries(zones)) {
    const target = local(lon, lat);
    for (const p of poses) {
      if (run("flicker")) {
        const noise = await flatNoise(page, (k) => ({ azimuthDeg: p.az, pitchDeg: p.pitch, distance: p.distance * k, target }));
        rows.push({ place, ...p, ...noise });
        if (noise.share > worst.share) worst = { place, ...p, ...noise };
      }
      await pose(page, { azimuthDeg: p.az, pitchDeg: p.pitch, distance: p.distance, target });
      await page.waitForTimeout(500);
      await shot(page, `despues-${place}-${p.tag}`);
    }
  }
  if (run("flicker")) {
    await writeFile(join(out, "despues-flicker.json"), JSON.stringify({ metric: "fracción de píxeles de zonas PLANAS que cambian > 45/765 al mover la cámara un 0,04 % de la distancia", rows }, null, 2));
    check("z-fighting: ninguna vista (5 zonas × 4 zooms/ángulos) tiene ruido en zonas planas > 1,5 %", worst.share < 0.015, { worst, views: rows.length });
  }
  check("agua/suelo: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

/* ------------------------------------------------------- exageración */
if (run("exaggeration")) {
  const { context, page, errors } = await open();
  await freeze(page);
  const sample = await api(page, "sampleBuildings", [400]);
  const worst = sample.reduce((m, b) => Math.max(m, Math.abs(b.renderHeightM / b.heightM - K)), 0);
  check(`exageración: los 400 edificios de la muestra se dibujan ×${K} sobre su altura real`, worst < 1e-6, { worst, sample: sample.length });
  const cathedral = await api(page, "findBuilding", ["Catedral de Málaga"]);
  check("exageración: la catedral conserva su altura verificada de 84 m y se dibuja ×" + K, cathedral && cathedral.heightM === 84 && Math.abs(cathedral.renderHeightM - 84 * K) < 1e-6, cathedral);
  await api(page, "setSelection", [cathedral.id]);
  await pose(page, { azimuthDeg: 250, pitchDeg: 24, distance: 340, target: [cathedral.centroid[0], cathedral.centroid[1]] });
  await page.waitForTimeout(900);
  const panel = (await page.locator("aside").first().innerText()).replace(/\s+/g, " ");
  check("exageración: la ficha de la catedral es mínima: su nombre y la compra, sin cifras de altura", /Catedral de Málaga/.test(panel) && !/\d+,\d m/.test(panel) && /1,00/.test(panel), panel.slice(0, 260));
  await shot(page, "exageracion-catedral-ficha");
  // Un edificio corriente: la ficha enseña el dato, no el dibujado.
  const ordinary = sample.find((b) => b.heightM > 12 && b.heightM < 30);
  await api(page, "setSelection", [ordinary.id]);
  await page.waitForTimeout(300);
  const ordinaryPanel = (await page.locator("aside").first().innerText()).replace(/\s+/g, " ");
  const realText = ordinary.heightM.toFixed(1).replace(".", ",");
  check("exageración: en un edificio corriente la ficha no enseña alturas (ni la real ni la dibujada)", !/\d+,\d m/.test(ordinaryPanel) && /Edificio sin nombre|\S/.test(ordinaryPanel), { realText, render: ordinary.renderHeightM.toFixed(1), panel: ordinaryPanel.slice(0, 80) });
  check("exageración: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

/* --------------------------------------------------------------- alcazaba */
if (run("alcazaba")) {
  const { context, page, errors } = await open();
  await freeze(page);
  const info = await api(page, "fortressInfo");
  const alcazaba = info.find((f) => f.id === "alcazaba");
  const gib = info.find((f) => f.id === "gibralfaro");
  check("Alcazaba: doble recinto, torres, puertas y coracha desde los datos", alcazaba && alcazaba.counts.walls >= 12 && alcazaba.counts.towers >= 8 && alcazaba.counts.gates >= 3, alcazaba);
  check("Gibralfaro: recinto y torres desde los datos", gib && gib.counts.walls >= 8 && gib.counts.towers >= 3, gib);
  const c = alcazaba.centroid;
  for (const [name, p] of [
    ["alcazaba-lejos", { azimuthDeg: 200, pitchDeg: 32, distance: 700 }],
    ["alcazaba-media", { azimuthDeg: 150, pitchDeg: 26, distance: 260 }],
    ["alcazaba-desde-la-ciudad", { azimuthDeg: 250, pitchDeg: 20, distance: 330 }],
    ["alcazaba-cenital", { azimuthDeg: 0, pitchDeg: 75, distance: 420 }],
  ]) {
    await pose(page, { ...p, target: [c[0], c[1]] });
    await page.waitForTimeout(800);
    await shot(page, name);
  }
  await pose(page, { azimuthDeg: 200, pitchDeg: 30, distance: 520, target: [c[0] + 120, c[1] - 90] });
  await page.waitForTimeout(500);
  await api(page, "setSelection", ["alcazaba"]);
  await page.waitForTimeout(500);
  const text = (await page.locator("aside").first().innerText()).replace(/\s+/g, " ");
  const fortress = await page.evaluate(() => { const r = window.__alzadoIsland.getSelection(); return r && { id: r.fortressId, landmark: r.landmark }; });
  check("Alcazaba: es un elemento seleccionable (un conjunto fortificado, no a la venta como un todo)", /Alcazaba de Málaga/.test(text) && fortress?.id === "alcazaba" && fortress.landmark === true, { text: text.slice(0, 120), fortress });
  await shot(page, "alcazaba-seleccionada");
  check("Alcazaba: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

/* ----------------------------------------------------- puerto y barcos */
if (run("port")) {
  const { context, page, errors } = await open();
  await freeze(page);
  const summary = await api(page, "getSummary");
  const ships = await api(page, "shipInfo");
  check("puerto: 3 cruceros colocados en los frentes de atraque", ships.placements.length === 3, ships.placements.map((p) => ({ berth: p.berth, quay: p.quay, length: p.lengthM, of: p.berthLengthM })));
  check("puerto: cada crucero cae por completo en el agua y a ≥ 2,5 m del muelle", ships.placements.every((p) => p.inWaterShare === 1 && p.quayGapM >= 2.5), ships.placements.map((p) => ({ share: p.inWaterShare, gap: p.quayGapM })));
  check("puerto: cada crucero es paralelo a su atraque y cabe en él", ships.placements.every((p) => p.lengthM <= p.berthLengthM - 24 + 0.5), ships.placements.map((p) => ({ length: p.lengthM, berth: p.berthLengthM })));
  check("puerto: embarcaciones pequeñas en las dársenas (instanciadas)", summary.smallBoats >= 20, { smallBoats: summary.smallBoats });
  const memory = await api(page, "memory");
  const cost = await page.evaluate(async () => {
    const api = window.__alzadoIsland;
    api.setPose({ azimuthDeg: 195, pitchDeg: 34, distance: 1500, target: [0, 450] });
    await new Promise((r) => setTimeout(r, 1500));
    api.resetFrameCost();
    await new Promise((r) => setTimeout(r, 4000));
    const on = api.getFrameCost();
    api.setSmallBoats(0);
    await new Promise((r) => setTimeout(r, 1200));
    api.resetFrameCost();
    await new Promise((r) => setTimeout(r, 4000));
    const off = api.getFrameCost();
    api.setSmallBoats(1);
    return { on, off };
  });
  check("barcos: el coste medido es pequeño (los pequeños añaden < 1 ms de CPU por fotograma)", cost.on.frameMs - cost.off.frameMs < 1, { conBarcosMs: Number(cost.on.frameMs.toFixed(2)), sinBarcosMs: Number(cost.off.frameMs.toFixed(2)), memory });
  // Barcos que no estorban: el rayo hacia un crucero no devuelve un barco (solo edificios o nada).
  const p0 = ships.placements[0];
  await pose(page, { azimuthDeg: 120, pitchDeg: 18, distance: 520, target: p0.center });
  await page.waitForTimeout(900);
  await shot(page, "crucero-1");
  const hit = await page.evaluate(() => window.__alzadoIsland.pickTargetScreen(720, 450));
  check("barcos: no entran en la selección ni en el hover (el rayo los atraviesa)", hit === null || hit.kind === "building", hit);
  for (const [i, placement] of ships.placements.entries()) {
    await pose(page, { azimuthDeg: 150 + i * 40, pitchDeg: 16, distance: 480, target: placement.center });
    await page.waitForTimeout(700);
    await shot(page, `crucero-${i + 1}-vista`);
  }
  for (const [name, p, lonlat] of [
    ["muelle-uno-vista-general", { azimuthDeg: 280, pitchDeg: 30, distance: 520 }, [-4.4141, 36.7165]],
    ["muelle-uno-dársena", { azimuthDeg: 235, pitchDeg: 22, distance: 300 }, [-4.4152, 36.7172]],
    ["muelle-uno-cenital", { azimuthDeg: 0, pitchDeg: 78, distance: 900 }, [-4.4148, 36.7168]],
    ["marina-barcos-pequeños", { azimuthDeg: 160, pitchDeg: 20, distance: 150 }, [-4.4147, 36.7185]],
  ]) {
    await pose(page, { ...p, target: local(lonlat[0], lonlat[1]) });
    await page.waitForTimeout(800);
    await shot(page, name.replace("á", "a"));
  }
  check("puerto: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

/* ------------------------------------------------------------- locales */
if (run("parcels")) {
  const { context, page, errors } = await open();
  await freeze(page);
  const stats = await api(page, "parcelStats");
  const list = await api(page, "parcelList");
  check("locales: miles de parcelas, contadas por origen, ninguna de origen catastral inventado", stats.total > 3000 && stats.bySource.osm_poi > 500 && stats.bySource.estimated > 1000 && stats.bySource.catastro_unit === 0, stats);
  check("locales: todas parten como «disponible» y los identificadores son únicos", list.every((p) => p.state === "available") && new Set(list.map((p) => p.id)).size === list.length, { total: list.length });

  /**
   * Busca una parcela de ese origen y zona con LÍNEA DE VISTA libre: se prueba
   * una lista de candidatas con distintas distancias hasta que el rayo del
   * centro de la parcela la devuelve a ella (si hay un edificio delante, el
   * edificio manda y la parcela no es alcanzable desde esa posición).
   */
  async function reachable(source, zone) {
    const pool = list.filter((p) => p.source === source && (!zone || p.zone === zone) && p.widthM >= 4 && p.heightM > 3);
    for (const parcel of pool.slice(0, 40)) {
      const mid = [(parcel.a[0] + parcel.b[0]) / 2, (parcel.a[1] + parcel.b[1]) / 2];
      const az = (Math.atan2(parcel.normal[0], parcel.normal[1]) * 180) / Math.PI;
      for (const [distance, pitch] of [[16, 8], [24, 10], [34, 14], [48, 18]]) {
        await pose(page, { azimuthDeg: az, pitchDeg: pitch, distance, target: mid });
        await page.waitForTimeout(450);
        const screen = await api(page, "screenOfParcel", [parcel.id]);
        if (!screen || screen.x < 80 || screen.x > 1340 || screen.y < 80 || screen.y > 820) continue;
        const hit = await api(page, "pickTargetScreen", [screen.x, screen.y]);
        if (hit?.kind === "parcel" && hit.id === parcel.id) return { parcel, screen, distance, pitch, az, mid };
      }
    }
    return null;
  }
  const found = [await reachable("osm_poi", "larios-constitucion"), await reachable("estimated", "larios-constitucion"), (await reachable("osm_poi", "muelle-uno")) ?? (await reachable("estimated", "muelle-uno"))].filter(Boolean);
  check("locales: se encuentran parcelas alcanzables con la cámara en la calle (OSM y estimada, Larios y Muelle Uno)", found.length === 3, found.map((f) => ({ id: f.parcel.id, source: f.parcel.source, distance: f.distance })));
  let idx = 0;
  for (const { parcel, distance, pitch, az, mid } of found) {
    idx += 1;
    // La cámara vuelve a la posición desde la que se vio la parcela.
    await pose(page, { azimuthDeg: az, pitchDeg: pitch, distance, target: mid });
    await page.waitForTimeout(700);
    const screen = await api(page, "screenOfParcel", [parcel.id]);
    await shot(page, `local-${idx}-reposo`);
    await page.mouse.move(screen.x, screen.y);
    await page.waitForTimeout(500);
    const hover = await page.evaluate(() => ({ id: document.querySelector("[data-island]").dataset.hover, cursor: document.querySelector("[data-island]").style.cursor }));
    check(`locales: el hover detecta la parcela ${parcel.id} (${parcel.source}) y el cursor es puntero`, hover.id === parcel.id && hover.cursor === "pointer", hover);
    await shot(page, `local-${idx}-hover`);
    await page.mouse.click(screen.x, screen.y);
    await page.waitForTimeout(500);
    const selected = await page.evaluate(() => ({ parcel: window.__alzadoIsland.getParcelSelection()?.id ?? null, building: window.__alzadoIsland.getSelection()?.id ?? null }));
    const panel = (await page.locator("aside").first().innerText()).replace(/\s+/g, " ");
    check(`locales: el clic selecciona SOLO el local ${parcel.id} y abre su ficha`, selected.parcel === parcel.id && selected.building === null && (panel.includes(parcel.poiName ?? "Local sin nombre")) && /Disponible/.test(panel), { selected, panel: panel.slice(0, 200) });
    await shot(page, `local-${idx}-seleccionado`);
    if (parcel.poiName) {
      const outside = await page.evaluate((name) => {
        const aside = document.querySelector("aside");
        const body = document.body.innerText;
        const inside = aside?.innerText ?? "";
        return { onlyInPanel: body.split(name).length - 1 === inside.split(name).length - 1 };
      }, parcel.poiName);
      check("locales: el nombre del negocio solo aparece en la ficha, nunca como rótulo del mapa", outside.onlyInPanel, { name: parcel.poiName, ...outside });
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__alzadoIsland.getParcelSelection());
    check("locales: Escape deselecciona el local", after === null, { after });
  }
  // Lejos las parcelas no se dibujan ni se seleccionan.
  await pose(page, { azimuthDeg: 195, pitchDeg: 34, distance: HOME });
  await page.waitForTimeout(500);
  const far = await page.evaluate(() => window.__alzadoIsland.pickTargetScreen(720, 450));
  check("locales: a distancia de vista inicial no hay parcelas seleccionables", !far || far.kind !== "parcel", far);
  // Sin etiquetas flotantes.
  const strays = await page.evaluate(() => {
    const container = document.querySelector("[data-island]");
    const labels = [];
    for (const el of document.querySelectorAll("body *")) {
      if (container?.contains(el) && el !== container && el.children.length === 0 && (el.textContent ?? "").trim().length > 0) labels.push(el.textContent.trim().slice(0, 40));
    }
    return labels;
  });
  check("locales: ninguna etiqueta flotante sobre el mapa", strays.length === 0, strays);
  check("locales: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

/* ------------------------------------------------------- móvil / reducido */
if (run("mobile")) {
  const { context, page, errors } = await open({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const summary = await api(page, "getSummary");
  await shot(page, "movil-inicial");
  check("móvil: carga con presupuesto reducido de barcos pequeños", summary.smallBoats <= city.scene.ships.small.maxMobile, { smallBoats: summary.smallBoats, max: city.scene.ships.small.maxMobile });
  await page.waitForTimeout(6000);
  const stats = await api(page, "getStats");
  check("móvil: dibuja con fps estables en emulación (no es una medición en teléfono real)", stats.fpsAvg >= 30, stats);
  check("móvil: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await context.close();
  const reduced = await open({ reducedMotion: "reduce" });
  const a = await reduced.page.evaluate(() => window.__alzadoIsland.camera().azimuthDeg);
  await reduced.page.waitForTimeout(2500);
  const b = await reduced.page.evaluate(() => window.__alzadoIsland.camera().azimuthDeg);
  const t0 = await reduced.page.evaluate(() => window.__alzadoIsland.sceneTime());
  await reduced.page.waitForTimeout(1500);
  const t1 = await reduced.page.evaluate(() => window.__alzadoIsland.sceneTime());
  check("prefers-reduced-motion: la escena no gira y el tiempo de la escena (oleaje, nubes, barcos) está parado", Math.abs(a - b) < 0.01 && t1 === t0, { a, b, t0, t1 });
  await shot(reduced.page, "reduced-motion");
  check("reduced-motion: sin errores de consola", reduced.errors.length === 0, reduced.errors.slice(0, 3));
  await reduced.context.close();
}

await writeFile(join(out, "verify-port-results.json"), JSON.stringify({ at: new Date().toISOString(), url: base, results }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones superadas${failed.length ? ` · FALLAN: ${failed.map((f) => f.name).join(" | ")}` : ""}`);
await browser.close();
process.exitCode = failed.length ? 1 : 0;
