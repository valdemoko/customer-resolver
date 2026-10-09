/**
 * Verificación de la Fase C en Chrome real: tráfico móvil, anuncios en barcos y
 * avionetas, carreteras y API del mercado. Cada comprobación lleva una cifra.
 *
 *   node tools/verify-market.mjs [--url http://localhost:3210]
 */
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const base = args.includes("--url") ? args[args.indexOf("--url") + 1] : "http://localhost:3210";
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
const results = [];
const check = (name, pass, evidence) => {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} · ${name} · ${JSON.stringify(evidence)}`);
};

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
await page.goto(`${base}/city/malaga/viewer`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-island-ready='true']", { timeout: 90_000 });
await page.waitForTimeout(1500);

const api = (fn, arg) => page.evaluate(fn, arg);

/* ---------------------------------------------------------------- tráfico */
const stats = await api(() => window.__alzadoIsland.trafficStats());
check("tráfico: hay cruceros con ruta, veleros navegando y 3 avionetas", stats && stats.cruiseMoving >= 1 && stats.sailingBoats >= 1 && stats.planes === 3, stats);
check("tráfico: las rutas de crucero tienen más de 10 m de agua libre fuera del atraque", stats?.cruisePaths.length > 0 && stats.cruisePaths.every((p) => p.minClearM >= 10), stats?.cruisePaths);
check("paneles: 8 por crucero + velas + 3 carteles", stats && stats.panels >= stats.cruiseMoving * 8 + stats.cruiseStatic * 8 + 3, { panels: stats?.panels });

const at = async (t) => {
  await api((time) => window.__alzadoIsland.setSceneTime(time), t);
  return api(() => window.__alzadoIsland.trafficSnapshot());
};
const home = await at(0);
const out = await at(560);
const far = await at(0.7 * 900 - 1);
const back = await at(0.95 * 900 + 600);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const moved = home.cruise.map((c, i) => Math.max(dist(c, out.cruise[i]), dist(c, far.cruise[i])));
check("cruceros: zarpan (se alejan del atraque en el ciclo)", moved.some((m) => m > 200), moved.map(Math.round));
const cycles = await at(900 * 3);
check("cruceros: al terminar el ciclo vuelven a su atraque", cycles.cruise.every((c, i) => dist(c, home.cruise[i]) < 2), cycles.cruise.map((c, i) => Math.round(dist(c, home.cruise[i]))));
const planesA = await at(10);
const planesB = await at(70);
check("avionetas: vuelan alrededor de la ciudad (cambian de sitio y mantienen altura)", planesA.planes.every((p, i) => dist(p, planesB.planes[i]) > 500 && Math.abs(p.y - planesB.planes[i].y) < 1), planesA.planes);
const planeRadii = planesB.planes.map((p) => Math.round(Math.hypot(p.x, p.z)));
check("avionetas: dentro de la zona (radio < 1400 m)", planeRadii.every((r) => r < 1400), planeRadii);
await at(0);

/* --------------------------------------------------------------- carreteras */
const roads = await api(() => window.__alzadoIsland.roadStats());
check("carreteras: bordillos y líneas discontinuas generados", roads && roads.curbSegments > 1000 && roads.dashes > 100, roads);

/* ----------------------------------------------------------- puntería de anuncios */
await page.getByRole("button", { name: /Pausar el giro/ }).click().catch(() => undefined);
const bases = await api(() => window.__alzadoIsland.shipBases());
const unit = "s:cruise-1:0";
let found = null;
for (const az of [0, 45, 90, 135, 180, 225, 270, 315]) {
  await api((pose) => window.__alzadoIsland.setPose(pose), { azimuthDeg: az, pitchDeg: 18, distance: 220, target: bases[0].base });
  await page.waitForTimeout(1800);
  const screen = await api((id) => window.__alzadoIsland.screenOfUnit(id), unit);
  if (!screen || screen.x < 0 || screen.y < 0 || screen.x > 1440 || screen.y > 900) continue;
  const hit = await api(([x, y]) => window.__alzadoIsland.pickTargetScreen(x, y), [screen.x, screen.y]);
  if (hit?.kind === "ad" && hit.id === unit) {
    found = { az, screen, hit };
    break;
  }
}
check("anuncio de crucero: el rayo lo encuentra desde algún lado del casco", Boolean(found), found);
if (found) {
  await page.mouse.move(found.screen.x, found.screen.y);
  await page.waitForTimeout(700);
  const tip = await page.locator("[role=tooltip]").innerText().catch(() => "");
  const tipBox = await page.locator("[role=tooltip]").boundingBox();
  check("hover: la ventana emergente enseña el precio de un espacio libre", /Disponible/.test(tip) && /1,00/.test(tip), tip);
  check("hover: la ventana emergente aparece junto al cursor y a la vista (no en una esquina)", tipBox && Math.abs(tipBox.x - found.screen.x) < 340 && Math.abs(tipBox.y - found.screen.y) < 200 && tipBox.x > 20 && tipBox.y > 20, { tipBox, cursor: found.screen });
  await page.mouse.click(found.screen.x, found.screen.y);
  await page.waitForTimeout(500);
  const panel = await page.locator("aside[aria-label^='Ficha de']").first().innerText().catch(() => "");
  check("clic: la ficha del panel de crucero ofrece comprar (compras apagadas sin Stripe)", /Panel de crucero/.test(panel) && /1,00/.test(panel) && /(Comprar por 1,00|Compras próximamente)/.test(panel), panel.slice(0, 200));
}

/* ------------------------------------------------------------------ mercado */
const market = await page.evaluate(async () => {
  const response = await fetch("/api/market/state", { cache: "no-store" });
  return { status: response.status, body: await response.json() };
});
check(
  "mercado: el estado se lee siempre y declara si las compras están activas",
  market.status === 200 && Array.isArray(market.body.units) && typeof market.body.purchasesEnabled === "boolean",
  { status: market.status, units: market.body.units?.length, purchasesEnabled: market.body.purchasesEnabled },
);
const bad = await page.evaluate(async () => (await fetch("/api/market/unit?id=" + encodeURIComponent("x:1"))).status);
check("mercado: una unidad inventada se rechaza", bad === 400 || bad === 404, bad);
const checkout = await page.evaluate(async () =>
  (await fetch("/api/market/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unitId: "a:plane-1", content: {} }) })).status,
);
check("mercado: sin contenido válido no se abre ningún pago", checkout >= 400, checkout);

// Las sondas de la API devuelven 4xx/5xx a propósito: esos avisos del navegador no cuentan.
const real = errors.filter((e) => !e.startsWith("Failed to load resource"));
check("sin errores de consola", real.length === 0, real.slice(0, 5));
await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones pasan`);
process.exit(failed.length ? 1 : 0);
