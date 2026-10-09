/**
 * Mediciones de rendimiento del visor sobre un build de PRODUCCIÓN, en Chrome
 * real con la GPU de la máquina. Escribe un JSON y lo imprime.
 *
 *   pnpm build && pnpm start -p 3210
 *   node tools/measure-perf.mjs --url http://localhost:3210 --out docs/verification/perf-run.json [--long]
 *
 * Los fotogramas por segundo se miden SIN límite de vsync (`--uncapped`): con
 * límite, un equipo sobrado marca siempre la frecuencia del monitor y no se ve
 * ninguna diferencia entre dos versiones. El coste por fotograma se mide dentro
 * del propio bucle (CPU de actualización y de `render`, en ms).
 */
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const base = value("url", "http://localhost:3210");
// B.4: origen y vista inicial salen de la configuración de la ciudad.
const city = JSON.parse(await readFile("src/data/cities/malaga.geo.json", "utf8"));
const [ORIGIN_LON, ORIGIN_LAT] = city.scene.coverage.circle.center;
const HOME_DISTANCE = city.scene.camera.initialDistanceM;
const outFile = value("out", "");
const long = args.includes("--long");
const quick = args.includes("--quick");
const memoryOnly = args.includes("--memory-only");
const queryString = value("query", "");

const chromeArgs = [
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--use-angle=d3d11",
  "--enable-precise-memory-info",
  "--disable-gpu-vsync",
  "--disable-frame-rate-limit",
];
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: chromeArgs,
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

async function openViewer(contextOptions = {}, { throttle = 1 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  if (throttle > 1) {
    const client = await context.newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  }
  const t0 = Date.now();
  await page.goto(`${base}/city/malaga/viewer${queryString}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-island-ready='true']", { timeout: 120_000 });
  const readyMs = Date.now() - t0;
  const firstFrameMs = await page.evaluate(() => Number(document.querySelector("[data-island]").dataset.islandFirstFrameMs));
  return { context, page, errors, readyMs, firstFrameMs };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Cada escenario se mide REPS veces y se publica la MEDIANA de cada cifra (las
 * tres lecturas quedan en `runs`). En una máquina con otras cargas, una sola
 * lectura puede salir 3× peor sin que el visor haya cambiado.
 */
const REPS = 3;
async function scenario(page, name, setup, seconds = 6) {
  const runs = [];
  for (let rep = 0; rep < REPS; rep += 1) runs.push(await scenarioOnce(page, name, rep === 0 ? setup : "", seconds));
  const pick = (key) => median(runs.map((r) => r[key]));
  return {
    ...runs[0],
    fpsAvg: pick("fpsAvg"),
    fpsP5: pick("fpsP5"),
    frameCpuMs: round(pick("frameCpuMs"), 3),
    updateCpuMs: round(pick("updateCpuMs"), 3),
    renderCallMs: round(pick("renderCallMs"), 3),
    runs: runs.map((r) => ({ fpsAvg: r.fpsAvg, fpsP5: r.fpsP5, frameCpuMs: r.frameCpuMs })),
  };
}

async function scenarioOnce(page, name, setup, seconds = 8) {
  if (setup) await page.evaluate(setup);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__alzadoIsland.resetFrameCost());
  // Ventana de al menos dos lecturas de 120 fotogramas.
  await page.waitForTimeout(seconds * 1000);
  const data = await page.evaluate(() => {
    const api = window.__alzadoIsland;
    const cost = api.getFrameCost();
    const stats = api.getStats();
    return { cost, stats, trees: api.treeStats(), clouds: api.cloudInfo() };
  });
  return {
    scenario: name,
    fpsAvg: data.stats.fpsAvg,
    fpsP5: data.stats.fpsP5,
    frameCpuMs: round(data.cost.frameMs, 3),
    updateCpuMs: round(data.cost.updateMs, 3),
    renderCallMs: round(data.cost.renderMs, 3),
    samples: data.cost.samples,
    drawCalls: data.stats.drawCalls,
    triangles: data.stats.triangles,
    treesDrawn: data.trees?.visible,
    cloudsActive: data.clouds?.active,
    qualityLevel: data.stats.qualityLevel,
  };
}

const pause = async (page) => {
  const button = page.getByRole("button", { name: /Pausar el giro/ });
  if (await button.count()) await button.click();
};

const result = {
  measuredAt: new Date().toISOString(),
  browser: `Chrome ${browser.version()}`,
  server: base,
  note: "Fotogramas sin límite de vsync; GPU de la máquina; localhost sin red.",
};

const loads = [];
if (memoryOnly) {
  // Solo la sesión larga de memoria (ver más abajo).
  const run = await openViewer();
  const samples = [];
  const started = Date.now();
  let step = 0;
  while (Date.now() - started < 5 * 60 * 1000 + 5000) {
    await run.page.mouse.move(700 + (step % 5) * 20, 450);
    if (step % 3 === 0) await run.page.mouse.wheel(0, step % 6 === 0 ? -400 : 400);
    await sleep(10_000);
    samples.push(await run.page.evaluate(() => ({ heapMb: performance.memory ? Math.round((performance.memory.usedJSHeapSize / 1048576) * 10) / 10 : null, gpu: window.__alzadoIsland.memory(), fps: window.__alzadoIsland.getStats().fpsAvg })));
    step += 1;
  }
  result.memory5min = { seconds: Math.round((Date.now() - started) / 1000), samples, errors: run.errors };
  await run.context.close();
  await browser.close();
  const text = JSON.stringify(result, null, 2);
  console.log(text);
  if (outFile) await writeFile(outFile, text);
  process.exit(0);
}
if (!quick) {
for (let run = 0; run < 5; run += 1) {
  const session = await openViewer();
  const bytes = await session.page.evaluate(() => {
    const entries = performance.getEntriesByType("resource");
    const sum = (filter) => entries.filter(filter).reduce((s, e) => s + (e.encodedBodySize || 0), 0);
    return {
      js: sum((e) => /\.js(\?|$)/.test(e.name)),
      jsFiles: entries.filter((e) => /\.js(\?|$)/.test(e.name)).length,
      pmtiles: sum((e) => /\.pmtiles/.test(e.name)),
      glb: sum((e) => /\.glb/.test(e.name)),
      total: sum(() => true),
      thirdParty: entries.filter((e) => !e.name.startsWith(location.origin)).length,
    };
  });
  loads.push({ firstFrameMs: session.firstFrameMs, readyMs: session.readyMs, ...bytes });
  await session.context.close();
}
if (!quick) loads.sort((a, b) => a.firstFrameMs - b.firstFrameMs);
if (!quick) result.coldLoad = { runs: loads, medianFirstFrameMs: loads[Math.floor(loads.length / 2)].firstFrameMs };

}
/* ---------------------------------------------------------- escenarios */
const session = await openViewer();
const { page } = session;
await pause(page);
const scenarios = [];
const HOME = `window.__alzadoIsland.setPose({ azimuthDeg: 195, pitchDeg: 34, distance: ${HOME_DISTANCE}, target: [0, 0] })`;
const at = (lon, lat) =>
  `[${(lon - ORIGIN_LON) * 111320 * Math.cos((ORIGIN_LAT * Math.PI) / 180)}, ${-(lat - ORIGIN_LAT) * 111132}]`;
scenarios.push(await scenario(page, "vista inicial (todo activo)", HOME));
if (quick) { await page.evaluate("window.__alzadoIsland.setClouds(30)"); }
scenarios.push(await scenario(page, "vista inicial · sin nubes", `${HOME}; window.__alzadoIsland.setClouds(0)`));
await page.evaluate("window.__alzadoIsland.setClouds(100)");
if (quick) {
  result.scenarios = scenarios;
  console.log(JSON.stringify(scenarios.map((x) => ({ n: x.scenario, fps: x.fpsAvg, frameMs: x.frameCpuMs, renderMs: x.renderCallMs, draws: x.drawCalls })), null, 1));
  await browser.close();
  process.exit(0);
}
scenarios.push(await scenario(page, "vista inicial · sin árboles", `${HOME}; window.__alzadoIsland.setTrees(0.1)`));
await page.evaluate("window.__alzadoIsland.setTrees(1)");
scenarios.push(
  await scenario(
    page,
    "Paseo del Parque (zoom medio, muchos árboles)",
    `window.__alzadoIsland.setPose({ azimuthDeg: 160, pitchDeg: 28, distance: 260, target: ${at(-4.4172, 36.7187)} })`,
  ),
);
scenarios.push(
  await scenario(
    page,
    "calle (zoom máximo)",
    `window.__alzadoIsland.setPose({ azimuthDeg: 190, pitchDeg: 12, distance: 60, target: ${at(-4.4216, 36.7198)} })`,
  ),
);
// B.4: agua, barcos y locales.
scenarios.push(
  await scenario(
    page,
    "puerto: dársena, agua y cruceros (zoom medio)",
    `window.__alzadoIsland.setPose({ azimuthDeg: 235, pitchDeg: 26, distance: 650, target: ${at(-4.4150, 36.7120)} })`,
  ),
);
scenarios.push(
  await scenario(
    page,
    "puerto · sin barcos pequeños",
    `window.__alzadoIsland.setPose({ azimuthDeg: 235, pitchDeg: 26, distance: 650, target: ${at(-4.4150, 36.7120)} }); window.__alzadoIsland.setSmallBoats(0)`,
  ),
);
await page.evaluate("window.__alzadoIsland.setSmallBoats(1)");
scenarios.push(
  await scenario(
    page,
    "Muelle Uno (locales de planta baja a 60 m)",
    `window.__alzadoIsland.setPose({ azimuthDeg: 280, pitchDeg: 12, distance: 60, target: ${at(-4.4141, 36.7165)} })`,
  ),
);
scenarios.push(
  await scenario(
    page,
    "Alcazaba (murallas, torres y almenas)",
    `window.__alzadoIsland.setPose({ azimuthDeg: 200, pitchDeg: 30, distance: 400, target: ${at(-4.4158, 36.7208)} })`,
  ),
);
result.scenarios = scenarios;
result.errorsDesktop = session.errors;
result.memoryInfo = await page.evaluate(() => window.__alzadoIsland.memory());
result.summary = await page.evaluate(() => window.__alzadoIsland.getSummary());
result.treePlan = await page.evaluate(() => window.__alzadoIsland.treePlan());
result.cloudInfo = await page.evaluate(() => window.__alzadoIsland.cloudInfo());
result.waterStats = await page.evaluate(() => window.__alzadoIsland.waterStats());
result.groundStats = await page.evaluate(() => window.__alzadoIsland.groundStats());
result.shipInfo = await page.evaluate(() => window.__alzadoIsland.shipInfo());
result.parcelStats = await page.evaluate(() => window.__alzadoIsland.parcelStats());
await session.context.close();

/* ------------------------------------- móvil de gama media (emulación 4×) */
const mobile = await openViewer(
  { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  { throttle: 4 },
);
await pause(mobile.page);
const mobileScenario = await scenario(mobile.page, "móvil emulado (CPU ×4, 390×780 @2x)", HOME, 10);
result.mobile = {
  firstFrameMs: mobile.firstFrameMs,
  readyMs: mobile.readyMs,
  ...mobileScenario,
  errors: mobile.errors,
  caveat:
    "Emulación en un ordenador de sobremesa: CPU limitada 4×, pero la GPU es la de la máquina. No sustituye a un móvil real.",
};
await mobile.context.close();

/* ----------------------------------- memoria tras 5 minutos (con uso real) */
if (long) {
  const run = await openViewer();
  const samples = [];
  const started = Date.now();
  let step = 0;
  while (Date.now() - started < 5 * 60 * 1000 + 5000) {
    // Uso: orbitar con el ratón y acercar/alejar de vez en cuando.
    await run.page.mouse.move(700, 450);
    if (step % 3 === 0) {
      await run.page.mouse.wheel(0, step % 6 === 0 ? -400 : 400);
    }
    await sleep(10_000);
    samples.push(
      await run.page.evaluate(() => ({
        heapMb: performance.memory ? Math.round((performance.memory.usedJSHeapSize / 1048576) * 10) / 10 : null,
        gpu: window.__alzadoIsland.memory(),
        fps: window.__alzadoIsland.getStats().fpsAvg,
      })),
    );
    step += 1;
  }
  result.memory5min = { seconds: Math.round((Date.now() - started) / 1000), samples, errors: run.errors };
  await run.context.close();
}

await browser.close();
const text = JSON.stringify(result, null, 2);
console.log(text);
if (outFile) await writeFile(outFile, text);
