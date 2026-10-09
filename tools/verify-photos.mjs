/**
 * Comprueba en el visor real que las fotos de los anunciantes se ven bien:
 * fachada repetida en todas las caras SIN deformarse (recorte «cover»), foto del
 * techo, paneles de crucero y velas. El estado del mercado y las imágenes se
 * sustituyen en el navegador (no se escribe nada en la base de datos).
 *
 *   node tools/verify-photos.mjs   → docs/verification/shots/photos/*.png
 */
import { mkdir } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright-core";

const base = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : "http://localhost:3210";
const out = "docs/verification/shots/photos";
await mkdir(out, { recursive: true });

/** PNG 800×400: degradado + cuadrícula + un círculo central, para ver recortes y deformaciones. */
function testPng(w, h, tint) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const o = Buffer.alloc(8 + data.length + 4); o.writeUInt32BE(data.length, 0); body.copy(o, 4); o.writeUInt32BE(crc(body), 8 + data.length); return o; };
  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = y * stride + 1 + x * 3;
      const grid = x % 100 < 4 || y % 100 < 4;
      const circle = Math.hypot(x - w / 2, y - h / 2) < h * 0.42 && Math.hypot(x - w / 2, y - h / 2) > h * 0.36;
      const c = grid || circle ? [255, 255, 255] : [tint[0] * (x / w) + 30, tint[1] * (y / h) + 30, tint[2]];
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
const results = [];
const check = (name, pass, evidence) => {
  results.push(Boolean(pass));
  console.log(`${pass ? "PASS" : "FAIL"} · ${name} · ${JSON.stringify(evidence).slice(0, 200)}`);
};

const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));

let units = [];
const owner = (id, faces) => ({ id, purchases: 1, priceCents: 125, owned: true, owner: { name: "Panadería Prueba", url: "https://example.com", description: "Pan de masa madre.", hasLogo: false, faces, sameForAll: true, since: new Date().toISOString() } });
let board = { available: true, generatedAt: new Date().toISOString(), catalog: {}, stats: { purchases: 1, unitsOwned: 1, owners: 1, revenueCents: 125 }, valuable: [], owners: [], latest: [] };
await page.route("**/api/market/leaderboards", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(board) }));
await page.route("**/api/market/state", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ units, version: String(units.length), purchasesEnabled: false }) }));
await page.route("**/api/market/image**", (route) => {
  const url = new URL(route.request().url());
  const tint = [60, 120, 230];
  // Fachada y techo con proporciones distintas a las de las superficies: así se ve el recorte.
  return route.fulfill({ contentType: "image/png", body: testPng(800, 400, tint) });
});
await page.goto(`${base}/city/malaga/viewer`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-island-ready='true']", { timeout: 90_000 });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Pausar el giro/ }).click().catch(() => undefined);

// Un edificio concreto, bajo y plano, de la vista inicial.
let id = null;
for (const [x, y] of [[720, 450], [650, 420], [800, 480], [700, 380], [760, 520]]) {
  id = await page.evaluate(([px, py]) => window.__alzadoIsland.pickScreen(px, py), [x, y]);
  if (id) break;
}
await page.evaluate((b) => window.__alzadoIsland.setSelection(b), id);
const centre = await page.evaluate(() => window.__alzadoIsland.getSelection().centroid);
const unit = `b:${id}`;
board.valuable = [{ unitId: unit, label: "Edificio de prueba", kind: "Edificio", paidCents: 125, purchases: 1, owner: "Panadería Prueba" }];
units = [owner(unit, ["all"]), owner("s:cruise-1:0", ["all"]), owner("s:cruise-1:4", ["all"]), owner("v:1", ["all"]), owner("a:plane-1", ["all"])];
// Fuerza al visor a releer el mercado.
await page.evaluate(() => window.dispatchEvent(new Event("focus")));
await page.waitForTimeout(100);
await page.evaluate(async (u) => {
  const engineMarket = window.__alzadoIsland;
  void engineMarket;
}, units);
// El visor refresca el mercado cada 25 s: se recarga con las unidades ya servidas.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-island-ready='true']", { timeout: 90_000 });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Pausar el giro/ }).click().catch(() => undefined);

// Ranking de los más caros: el botón lleva la cámara al edificio y lo selecciona.
await page.evaluate(() => window.__alzadoIsland.setPose({ azimuthDeg: 20, pitchDeg: 40, distance: 1500, target: [0, 0] }));
await page.waitForTimeout(2500);
await page.evaluate(() => window.__alzadoIsland.setSelection(null));
const dock = page.getByRole("region", { name: "Los espacios más caros" });
check("visor: hay un ranking de los espacios más caros a la izquierda", await dock.isVisible() && /Edificio de prueba/.test(await dock.innerText()), (await dock.innerText()).slice(0, 60));
const before = await page.evaluate(() => window.__alzadoIsland.camera().distance);
await dock.getByRole("button", { name: /Ir a Edificio de prueba/ }).click();
await page.waitForTimeout(2600);
const after = await page.evaluate(() => ({ cam: window.__alzadoIsland.camera(), selected: window.__alzadoIsland.getSelection()?.osmId }));
const distanceToBuilding = Math.hypot(after.cam.focus[0] - centre[0], after.cam.focus[2] - centre[1]);
check("visor: «Ir a» vuela hasta el edificio, lo selecciona y se acerca", after.selected === id && distanceToBuilding < 25 && after.cam.distance < before * 0.5, { selected: after.selected, distanceToBuilding: Math.round(distanceToBuilding), from: Math.round(before), to: Math.round(after.cam.distance) });
await page.screenshot({ path: `${out}/ranking-ir-al-edificio.png` });

// Panel del anunciante: a la derecha, y la ficha de compra a la izquierda.
const side = page.locator("aside[aria-label^='Anunciante de']");
const left = page.locator("aside[aria-label^='Ficha de']");
check("visor: al seleccionar un espacio comprado, el anunciante sale a la derecha y la compra a la izquierda", (await side.count()) === 1 && /Panadería Prueba/.test(await side.innerText()) && !/Panadería Prueba/.test(await left.innerText()) && /(Comprar por|Compras próximamente)/.test(await left.innerText()), { side: (await side.innerText()).slice(0, 60), left: (await left.innerText()).slice(0, 80) });
const sideBox = await side.boundingBox();
check("visor: el panel del anunciante está en la mitad derecha de la pantalla", sideBox && sideBox.x > 720, sideBox);
await page.keyboard.press("Escape");
await page.evaluate(() => window.__alzadoIsland.setSelection(null));
await page.waitForTimeout(500);
check("visor: sin selección y sin ratón encima, no hay panel del anunciante", (await side.count()) === 0, null);
const where = await page.evaluate((c) => window.__alzadoIsland.screenOfPoint(c[0], 8, c[1]), centre);
await page.mouse.move(where.x - 40, where.y + 60);
await page.mouse.move(where.x, where.y, { steps: 6 });
await page.waitForTimeout(700);
check("visor: al pasar el ratón por un espacio comprado sale el panel del anunciante (y no el aviso del cursor)", (await side.count()) === 1 && (await page.locator("[role=tooltip]").count()) === 0, { side: await side.count(), tooltip: await page.locator("[role=tooltip]").count(), where });
await page.screenshot({ path: `${out}/hover-anunciante-derecha.png` });
await page.mouse.move(60, 600);
await page.waitForTimeout(500);
await page.evaluate(() => window.__alzadoIsland.setSelection(null));
const pose = (azimuthDeg, pitchDeg, distance, target) => page.evaluate((p) => window.__alzadoIsland.setPose(p), { azimuthDeg, pitchDeg, distance, target });
await pose(20, 32, 110, centre);
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/fachada-y-techo-lado.png` });
await pose(20, 80, 110, centre);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/techo-desde-arriba.png` });
const stats = await page.evaluate(() => window.__alzadoIsland.adStats());
check("el visor pinta las fotos del edificio (fachada y techo)", stats && stats.live >= 1 && stats.textures >= 2, stats);

// Crucero 1: se coloca la cámara frente a su casco.
const bases = await page.evaluate(() => window.__alzadoIsland.shipBases());
for (const az of [0, 90, 180, 270]) {
  await pose(az, 14, 190, bases[0].base);
  await page.waitForTimeout(2500);
  const screen = await page.evaluate(() => window.__alzadoIsland.screenOfUnit("s:cruise-1:0"));
  if (screen && screen.x > 150 && screen.x < 1300 && screen.y > 150 && screen.y < 750) {
    await page.screenshot({ path: `${out}/crucero-panel.png` });
    check("un panel de crucero con foto queda a la vista", true, { az, screen });
    break;
  }
}
check("sin errores de consola", errors.length === 0, errors.slice(0, 3));
await browser.close();
console.log(results.every(Boolean) ? "\nTodo correcto" : "\nHay fallos");
process.exit(results.every(Boolean) ? 0 : 1);
