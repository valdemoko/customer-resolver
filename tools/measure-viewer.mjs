/**
 * Mide el visor 3D en Chrome real (Playwright sobre el Chrome instalado).
 *
 * Uso:  node tools/measure-viewer.mjs [--url http://localhost:3210] [--seconds 20]
 *                                     [--label nombre] [--shots docs/verification/shots]
 *                                     [--mobile] [--query "?x=1"] [--uncapped]
 *
 * Imprime un JSON con las medidas. `--uncapped` quita el límite de 60 fps del
 * navegador para que los fotogramas por segundo midan el COSTE y no el vsync.
 * Todas las cifras salen de la página (datasets del contenedor y `performance`),
 * no de una estimación.
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
const seconds = Number(value("seconds", "20"));
const label = value("label", "medicion");
const shots = value("shots", "");
const mobile = flag("mobile");
const query = value("query", "");

const launchArgs = [
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--use-angle=d3d11",
  "--enable-precise-memory-info",
];
if (flag("uncapped")) launchArgs.push("--disable-gpu-vsync", "--disable-frame-rate-limit");

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: launchArgs,
});
const context = await browser.newContext(
  mobile
    ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
);
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 300)}`));

let transferred = 0;
let jsBytes = 0;
page.on("response", async (response) => {
  try {
    const headers = response.headers();
    const length = Number(headers["content-length"] ?? 0);
    transferred += length;
    if ((headers["content-type"] ?? "").includes("javascript")) jsBytes += length;
  } catch {
    /* respuesta cancelada */
  }
});

const started = Date.now();
await page.goto(`${base}/city/malaga/viewer${query}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-island-ready='true']", { timeout: 60_000 });
const readyMs = Date.now() - started;

const gpu = await page.evaluate(() => {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "desconocido";
});

if (shots) await mkdir(shots, { recursive: true });
const shot = async (name) => {
  if (!shots) return;
  await page.screenshot({ path: join(shots, `${label}-${name}.png`) });
};

await page.waitForTimeout(1500);
await shot("inicial");

// Deja correr el bucle y lee las medidas que publica el motor.
await page.waitForTimeout(seconds * 1000);
const snapshot = await page.evaluate(() => {
  const el = document.querySelector("[data-island]");
  const api = window.__alzadoIsland;
  return {
    dataset: { ...el.dataset },
    stats: api?.getStats?.() ?? null,
    summary: api?.getSummary?.() ?? null,
    perf: api?.getFrameCost?.() ?? null,
    memory: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    firstFrameMs: Number(el.dataset.islandFirstFrameMs ?? 0),
  };
});
await shot("tras-medicion");

const result = {
  label,
  measuredAt: new Date().toISOString(),
  conditions: {
    browser: `Chrome ${browser.version()}`,
    gpu,
    viewport: mobile ? "390x780 @2x (emulado)" : "1440x900",
    uncapped: flag("uncapped"),
    seconds,
    server: base,
  },
  timeToReadyMs: readyMs,
  ...snapshot,
  transferredBytesApprox: transferred,
  jsBytesApprox: jsBytes,
  consoleErrors,
};
console.log(JSON.stringify(result, null, 2));
if (value("out", "")) await writeFile(value("out", ""), JSON.stringify(result, null, 2));
await browser.close();
