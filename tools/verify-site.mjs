/**
 * Verificación de la portada y de la página de Málaga en Chrome real:
 * sin desbordes horizontales, sin errores de consola, enlaces válidos, CTA
 * correctos, foco por teclado, movimiento reducido y clasificaciones con datos.
 *
 *   node tools/verify-site.mjs [--url http://localhost:3210] [--shots docs/verification/shots/site]
 *
 * Las clasificaciones se prueban dos veces: con la respuesta REAL de la API (vacía
 * si aún no hay compras) y con una respuesta de ejemplo interceptada solo en el
 * navegador para comprobar la maquetación llena. Los datos de ejemplo nunca
 * llegan a la base de datos ni a la aplicación.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const val = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const base = val("url", "http://localhost:3210");
const shots = val("shots", "docs/verification/shots/site");
await mkdir(shots, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
const results = [];
const check = (name, pass, evidence) => {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} · ${name} · ${JSON.stringify(evidence).slice(0, 220)}`);
};

const SAMPLE = {
  available: true,
  generatedAt: new Date().toISOString(),
  catalog: { buildings: 5399, parcels: 5188, walls: 151, mobile: 147 },
  stats: { purchases: 18, unitsOwned: 16, owners: 9, revenueCents: 4120 },
  valuable: Array.from({ length: 15 }, (_, i) => ({
    unitId: `b:way/${100 + i}`,
    label: i === 0 ? "Catedral de Málaga" : i === 1 ? "Plaza de toros de La Malagueta" : `Edificio way/${100 + i}`,
    kind: "Edificio",
    paidCents: 2000 - i * 110,
    purchases: 3 - (i % 3),
    owner: `Anunciante de prueba ${i + 1}`,
  })),
  owners: Array.from({ length: 15 }, (_, i) => ({ name: `Anunciante de prueba ${i + 1}`, units: 15 - i })),
  latest: Array.from({ length: 15 }, (_, i) => ({
    unitId: `p:L-aaaaa0${i}`,
    label: `Local L-aaaaa0${i}`,
    kind: "Local",
    buyer: `Anunciante de prueba ${i + 1}`,
    amountCents: 100 + i * 25,
    createdAt: new Date(Date.now() - i * 3_600_000 * 7).toISOString(),
  })),
};

async function visit(context, path, { sample = false } = {}) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  if (sample) {
    await page.route("**/api/market/leaderboards", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify(SAMPLE) }),
    );
  }
  await page.goto(`${base}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(2200);
  return { page, errors };
}

async function scrollAll(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
}

const overflow = (page) =>
  page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));

for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["movil", { width: 390, height: 844 }]]) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: label === "movil" ? 2 : 1 });

  /* ---------------------------------------------------------- portada */
  const home = await visit(context, "/");
  await scrollAll(home.page);
  const o1 = await overflow(home.page);
  check(`${label} · portada: sin desbordamiento horizontal`, o1.scroll <= o1.client, o1);
  check(`${label} · portada: sin errores de consola`, home.errors.length === 0, home.errors.slice(0, 3));
  const h1 = await home.page.locator("h1").count();
  check(`${label} · portada: un único h1`, h1 === 1, { h1 });
  const cta = await home.page.getByRole("link", { name: "Explore Málaga in 3D" }).first().getAttribute("href");
  check(`${label} · portada: la CTA principal abre el visor real de Málaga`, cta === "/city/malaga/viewer", cta);
  await home.page.screenshot({ path: join(shots, `portada-${label}.png`), fullPage: true });

  /* ---- todos los enlaces internos de la portada responden 200 */
  const hrefs = await home.page.$$eval("a[href^='/']", (links) => [...new Set(links.map((a) => a.getAttribute("href")))]);
  const broken = [];
  for (const href of hrefs) {
    if (href.startsWith("/#") || href.includes("?")) continue;
    const response = await context.request.get(`${base}${href}`);
    if (response.status() >= 400) broken.push({ href, status: response.status() });
  }
  check(`${label} · portada: enlaces internos sin romper`, broken.length === 0, { checked: hrefs.length, broken });

  /* ---- marcador de Málaga: ratón / teclado */
  const marker = home.page.getByRole("link", { name: /^Málaga, España/ });
  check(`${label} · mapa: el marcador de Málaga es un enlace accesible`, (await marker.count()) === 1, await marker.count());
  if (label === "desktop") {
    await home.page.evaluate(() => window.scrollTo(0, 300));
    await marker.hover();
    await home.page.waitForTimeout(400);
    const panel = home.page.getByRole("link", { name: "Abrir en 3D" }).first();
    check("desktop · mapa: al pasar el ratón aparece el panel con la acción de abrir en 3D", await panel.isVisible(), null);
    await home.page.screenshot({ path: join(shots, "mapa-hover-desktop.png") });
    await home.page.mouse.move(5, 5);
    await marker.focus();
    await home.page.waitForTimeout(300);
    check("desktop · mapa: el marcador también se activa con el teclado (foco)", await home.page.getByRole("link", { name: "Abrir en 3D" }).first().isVisible(), null);
  }
  await home.page.close();

  /* -------------------------------------------------------- Málaga */
  const real = await visit(context, "/city/malaga");
  await scrollAll(real.page);
  const o2 = await overflow(real.page);
  check(`${label} · Málaga: sin desbordamiento horizontal`, o2.scroll <= o2.client, o2);
  const openLink = await real.page.getByRole("link", { name: "Open Málaga in 3D", exact: true }).getAttribute("href");
  check(`${label} · Málaga: «Open Málaga in 3D» abre el visor real`, openLink === "/city/malaga/viewer", openLink);
  const apiState = await real.page.evaluate(async () => (await fetch("/api/market/leaderboards")).json());
  const emptyText = await real.page.locator("section[aria-labelledby='clasificaciones']").innerText();
  check(
    `${label} · Málaga: con datos reales muestra tres clasificaciones coherentes con la API`,
    apiState.available
      ? (apiState.valuable.length === 0 ? /Todavía no se ha completado/.test(emptyText) : true) && (await real.page.locator("section[aria-labelledby^='rk-']").count()) === 3
      : /no están disponibles/.test(emptyText),
    { purchases: apiState.stats?.purchases, rows: apiState.valuable?.length },
  );
  check(`${label} · Málaga: sin errores de consola`, real.errors.length === 0, real.errors.slice(0, 3));
  await real.page.screenshot({ path: join(shots, `malaga-real-${label}.png`), fullPage: true });
  await real.page.close();

  const full = await visit(context, "/city/malaga", { sample: true });
  await full.page.waitForSelector("section[aria-labelledby='rk-valor'] ol > li", { timeout: 15000 });
  await scrollAll(full.page);
  const rows = await full.page.$$eval("section[aria-labelledby^='rk-'] ol", (lists) => lists.map((l) => l.querySelectorAll(":scope > li").length));
  check(`${label} · Málaga: tres clasificaciones de 15 filas como máximo`, rows.length === 3 && rows.every((n) => n === 15), rows);
  const firstValues = await full.page.$$eval("section[aria-labelledby='rk-valor'] ol > li td:last-child", (cells) => cells.map((c) => c.textContent));
  const euros = firstValues.map((t) => Number((t ?? "").replace(/[^\d,]/g, "").replace(",", ".")));
  check(`${label} · Málaga: «más valiosos» ordenado de mayor a menor importe`, euros.every((v, i) => i === 0 || euros[i - 1] >= v), euros);
  const o3 = await overflow(full.page);
  check(`${label} · Málaga con datos: sin desbordamiento horizontal`, o3.scroll <= o3.client, o3);
  await full.page.screenshot({ path: join(shots, `malaga-datos-${label}.png`), fullPage: true });
  await full.page.close();

  /* ----------------------------------------------- movimiento reducido */
  if (label === "desktop") {
    const reduced = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const r = await visit(reduced, "/");
    const hidden = await r.page.evaluate(() => [...document.querySelectorAll(".reveal")].filter((n) => getComputedStyle(n).opacity === "0").length);
    check("desktop · movimiento reducido: ningún bloque queda oculto por el revelado", hidden === 0, { hidden });
    const litReduced = await r.page.evaluate(() => { const c = document.querySelector("canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1; return n; });
    check("desktop · movimiento reducido: el mapa de puntos se ve completo y quieto desde el principio", litReduced > 5000, { litReduced });
    await reduced.close();
  }
  await context.close();
}

/* ------------------------------------- puntos: aparecen uno a uno y se sueltan al bajar */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  const lit = () => page.evaluate(() => { const c = document.querySelector("canvas"); if (!c) return -1; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1; return n; });
  await page.waitForSelector("canvas");
  await page.waitForTimeout(500);
  const early = await lit();
  await page.waitForTimeout(1000);
  const mid = await lit();
  await page.waitForTimeout(3500);
  const full = await lit();
  check("portada: los puntos aparecen progresivamente al cargar (no de golpe)", early >= 0 && early < full * 0.2 && mid > early, { early, mid, full });
  await page.screenshot({ path: join(shots, "puntos-completo.png") });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const section = await page.evaluate(() => document.querySelector("section[aria-labelledby='titulo']").getBoundingClientRect().height);
  await page.evaluate((y) => window.scrollTo(0, y), (section - 900) * 0.5);
  await page.waitForTimeout(900);
  const half = await lit();
  await page.screenshot({ path: join(shots, "puntos-mitad.png") });
  await page.evaluate((y) => window.scrollTo(0, y), section - 900 + 5);
  await page.waitForTimeout(900);
  const gone = await lit();
  check("portada: al bajar, los puntos se sueltan poco a poco hasta desaparecer", full > half && half > gone && gone < full * 0.05, { full, half, gone, height });
  await page.evaluate(() => window.scrollTo(0, 0));
  await context.close();
}

/* ----------------------------------------------------------- aura del cursor */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/`, { waitUntil: "load" });
  await page.mouse.move(300, 300);
  await page.mouse.move(900, 500, { steps: 6 });
  await page.waitForTimeout(900);
  const aura = await page.evaluate(() => { const a = document.querySelector(".cursor-aura"); const box = a.getBoundingClientRect(); return { opacity: getComputedStyle(a).opacity, cx: Math.round(box.left + box.width / 2), cy: Math.round(box.top + box.height / 2) }; });
  check("el aura sigue al ratón", Number(aura.opacity) > 0.9 && Math.abs(aura.cx - 900) < 40 && Math.abs(aura.cy - 500) < 40, aura);
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".ambient")).backgroundImage.slice(0, 40));
  const y0 = await page.evaluate(() => getComputedStyle(document.querySelector(".ambient .contours.a")).transform);
  await page.evaluate(() => window.scrollTo(0, 1800));
  await page.waitForTimeout(500);
  const y1 = await page.evaluate(() => getComputedStyle(document.querySelector(".ambient .contours.a")).transform);
  check("el fondo se mueve con el scroll (parallax)", y0 !== y1, { y0, y1 });
  check("el fondo no es negro puro y lleva curvas de nivel (sin cuadrícula ni aro de cursor)", /gradient/.test(bg) && (await page.locator(".ambient .grid, .cursor-ring").count()) === 0 && (await page.locator(".ambient .contours").count()) === 2, bg);
  await context.close();
}

/* ------------------------------------------------------------ catálogo de ciudades */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page, errors } = await visit(context, "/ciudades");
  await page.waitForTimeout(1200);
  const tile = page.locator("article", { hasText: "Ciudad inaugural" });
  check("ciudades: Málaga se presenta como ciudad inaugural, con sello propio", (await tile.count()) === 1 && (await tile.locator("svg textPath").count()) === 1, await tile.count());
  const nav = await page.locator("header nav[aria-label='Principal'] a").allInnerTexts();
  check("ciudades: la barra enseña «Ciudades» y no una ciudad concreta", nav.includes("Ciudades") && !nav.includes("Málaga"), nav);
  await page.locator("main").getByPlaceholder("Buscar ciudad o país").fill("zzzz");
  await page.waitForTimeout(400);
  check("ciudades: la búsqueda sin coincidencias enseña un estado vacío con salida", /Sin resultados/.test(await page.locator("main").innerText()), null);
  await page.getByRole("button", { name: "Ver todas las ciudades" }).click();
  await page.waitForTimeout(500);
  check("ciudades: se puede volver a ver todo", (await page.locator("article", { hasText: "Málaga" }).count()) === 1, null);
  await page.screenshot({ path: join(shots, "ciudades-desktop.png"), fullPage: true });
  check("ciudades: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  const old = await context.request.get(`${base}/?q=malaga`, { maxRedirects: 0 });
  check("las URLs antiguas del catálogo (/?q=…) redirigen a /ciudades", [307, 308].includes(old.status()) && /\/ciudades\?q=malaga/.test(old.headers().location ?? ""), { status: old.status(), to: old.headers().location });
  await context.close();
}

/* --------------------------------------------------- foco por teclado visible */
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page } = await visit(context, "/");
  const seen = [];
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press("Tab");
    seen.push(await page.evaluate(() => {
      const el = document.activeElement;
      const style = el ? getComputedStyle(el) : null;
      return { tag: el?.tagName, text: (el?.textContent ?? "").trim().slice(0, 24), outline: style?.outlineStyle, width: style?.outlineWidth };
    }));
  }
  check("teclado: los primeros elementos enfocables muestran contorno de foco", seen.every((s) => s.outline && s.outline !== "none" && s.width !== "0px"), seen);
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones pasan`);
process.exit(failed.length ? 1 : 0);
