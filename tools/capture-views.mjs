/**
 * Capturas reproducibles del visor: una lista de vistas (lugar + zoom + ángulo)
 * sobre el build de producción. Sirve para el antes/después del z-fighting, el
 * puerto, el Muelle Uno, la Alcazaba y los locales.
 *
 *   node tools/capture-views.mjs --url http://localhost:3210 --out docs/verification/shots/port \
 *        --prefix despues --origin -4.4185,36.7165 --set zfight [--flicker]
 *
 * `--origin` es el centro del sistema local de la escena (lon,lat). Las vistas
 * se dan en lon/lat y se convierten con la misma aproximación local que usa el
 * motor. Con `--flicker` se toman dos fotogramas con una sacudida mínima de la
 * cámara (0,02°) y se cuenta cuántos píxeles de la zona central cambian de color
 * de forma "salvaje" (>40 niveles): un z-fighting parpadea; una escena estable
 * apenas cambia al mover la cámara una fracción de píxel.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const base = value("url", "http://localhost:3210");
const out = value("out", "docs/verification/shots");
const prefix = value("prefix", "vista");
const [originLon, originLat] = value("origin", "-4.4185,36.7165").split(",").map(Number);
const setName = value("set", "zfight");
const mobile = flag("mobile");

const METERS_PER_DEG_LAT = 111_132;
const metersPerDegLon = 111_320 * Math.cos((originLat * Math.PI) / 180);
const local = (lon, lat) => [(lon - originLon) * metersPerDegLon, -(lat - originLat) * METERS_PER_DEG_LAT];

/** Lugares en [lon, lat]. */
const PLACES = {
  paseoDelParque: [-4.4169, 36.7168],
  alamedaPrincipal: [-4.4247, 36.7163],
  guadalmedina: [-4.4292, 36.7212],
  catedral: [-4.4195, 36.7202],
  alcazaba: [-4.4158, 36.7212],
  muelleUno: [-4.4141, 36.7167],
  muelleUnoSur: [-4.4150, 36.7150],
  palmeral: [-4.4172, 36.7180],
  puerto: [-4.4147, 36.7070],
  levante: [-4.4145, 36.7040],
  larios: [-4.4216, 36.7198],
  plazaConstitucion: [-4.4218, 36.7212],
  catedralSur: [-4.4196, 36.7198],
  plazaMarina: [-4.4207, 36.7167],
  farola: [-4.4120, 36.7090],
  gibralfaro: [-4.4118, 36.7232],
};

const SETS = {
  // Césped junto a calles, agua y muelles, a tres distancias y cuatro ángulos.
  zfight: Object.entries({ paseoDelParque: 0, guadalmedina: 0, muelleUno: 0, palmeral: 0 }).flatMap(([place]) =>
    [
      { dist: 1400, pitch: 38, az: 195 },
      { dist: 420, pitch: 32, az: 195 },
      { dist: 420, pitch: 32, az: 285 },
      { dist: 140, pitch: 28, az: 15 },
      { dist: 140, pitch: 60, az: 105 },
    ].map((v) => ({ name: `${place}-${v.dist}m-az${v.az}-p${v.pitch}`, place, ...v })),
  ),
  locales: [
    { name: "larios-fachadas", place: "larios", dist: 70, pitch: 14, az: 15 },
    { name: "larios-fachadas-b", place: "larios", dist: 45, pitch: 8, az: 195 },
    { name: "plaza-constitucion", place: "plazaConstitucion", dist: 90, pitch: 20, az: 200 },
    { name: "catedral-entorno", place: "catedralSur", dist: 80, pitch: 16, az: 330 },
    { name: "muelle-uno-locales", place: "muelleUno", dist: 60, pitch: 12, az: 280 },
    { name: "muelle-uno-locales-b", place: "muelleUno", dist: 120, pitch: 22, az: 100 },
  ],
  port: [
    { name: "puerto-general", place: "muelleUno", dist: 1500, pitch: 34, az: 195 },
    { name: "muelle-uno", place: "muelleUno", dist: 520, pitch: 30, az: 280 },
    { name: "muelle-uno-cerca", place: "muelleUno", dist: 160, pitch: 24, az: 250 },
    { name: "cruceros", place: "levante", dist: 700, pitch: 28, az: 100 },
    { name: "cruceros-cerca", place: "levante", dist: 300, pitch: 14, az: 80 },
    { name: "alcazaba", place: "alcazaba", dist: 520, pitch: 32, az: 200 },
    { name: "alcazaba-cerca", place: "alcazaba", dist: 200, pitch: 26, az: 150 },
    { name: "larios-locales", place: "larios", dist: 90, pitch: 18, az: 195 },
    { name: "inicio", place: "larios", dist: 2300, pitch: 34, az: 195, home: true },
  ],
};
const views = SETS[setName];
if (!views) throw new Error(`Conjunto desconocido: ${setName}`);

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
const context = await browser.newContext(
  mobile
    ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
);
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
await page.goto(`${base}/city/malaga/viewer`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-island-ready='true']", { timeout: 90_000 });
await page.waitForTimeout(1200);
// Pausa el giro automático para que las vistas sean reproducibles.
await page.evaluate(() => window.__alzadoIsland.setManuallyPaused?.(true));

const report = [];
for (const view of views) {
  const [lon, lat] = PLACES[view.place];
  const target = local(lon, lat);
  await page.evaluate(
    ({ pose }) => window.__alzadoIsland.setPose(pose),
    { pose: { azimuthDeg: view.az, pitchDeg: view.pitch, distance: view.dist, target } },
  );
  await page.waitForTimeout(700);
  const file = join(out, `${prefix}-${view.name}.png`);
  await page.screenshot({ path: file });
  const entry = { view: view.name, file };
  if (flag("flicker")) {
    // Dos fotogramas con una sacudida casi nula: mide el parpadeo de la zona.
    const clip = { x: 360, y: 225, width: 720, height: 450 };
    const a = await page.screenshot({ clip });
    await page.evaluate(
      ({ pose }) => window.__alzadoIsland.setPose(pose),
      { pose: { azimuthDeg: view.az + 0.03, pitchDeg: view.pitch, distance: view.dist, target } },
    );
    await page.waitForTimeout(500);
    const b = await page.screenshot({ clip });
    entry.shots = [a.length, b.length];
    entry.pair = [a.toString("base64").length, b.toString("base64").length];
    entry.flickerBuffers = { a: a.toString("base64"), b: b.toString("base64") };
  }
  report.push(entry);
  console.log(`· ${view.name}`);
}

if (flag("flicker")) {
  // Compara pares dentro de la página con un canvas 2D.
  const result = [];
  for (const entry of report) {
    const diff = await page.evaluate(async ({ a, b }) => {
      const load = (b64) =>
        new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.src = `data:image/png;base64,${b64}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const canvas = document.createElement("canvas");
      canvas.width = ia.width;
      canvas.height = ia.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(ia, 0, 0);
      const da = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      ctx.drawImage(ib, 0, 0);
      const db = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let wild = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        if (d > 120) wild += 1;
      }
      return { wildPixels: wild, share: wild / (da.length / 4) };
    }, { a: entry.flickerBuffers.a, b: entry.flickerBuffers.b });
    delete entry.flickerBuffers;
    delete entry.shots;
    delete entry.pair;
    result.push({ ...entry, ...diff });
  }
  await writeFile(join(out, `${prefix}-flicker.json`), JSON.stringify({ errors, result }, null, 2));
  console.log(JSON.stringify(result.map((r) => [r.view, r.wildPixels]), null, 0));
}
console.log(errors.length ? `ERRORES: ${errors.join(" | ")}` : "sin errores de consola");
await browser.close();
