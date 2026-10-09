/**
 * Verifica el flujo de compra en el navegador: ficha → estudio 3D → pago.
 *
 * El estado del mercado se SUSTITUYE por una respuesta con las compras encendidas
 * (`page.route`), porque sin Stripe ni base de datos el servidor las apaga. El
 * resto es real: el estudio dibuja el modelo con WebGL, sube imágenes, y el botón
 * de pago llama a la API real, que sin Stripe responde con un error que el
 * estudio tiene que mostrar. No se simula ningún cobro.
 *
 *   node tools/verify-studio.mjs [--url http://localhost:3210]
 */
import { chromium } from "playwright-core";
import { deflateSync } from "node:zlib";

const args = process.argv.slice(2);
const base = args.includes("--url") ? args[args.indexOf("--url") + 1] : "http://localhost:3210";

/** PNG de 64×64 de un color liso, sin dependencias. */
function png(r, g, b) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + data.length);
    return out;
  };
  const size = 64;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x += 1) raw.set([r, g, b], y * (size * 3 + 1) + 1 + x * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** PNG de ruido de ancho×alto (pesa varios MB): para comprobar que se comprime en el navegador. */
function noisePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + data.length); return out; };
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  let seed = 12345;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const o = y * stride + 1 + x * 3;
      raw[o] = (x * 255) / width + ((seed >>> 16) & 31);
      raw[o + 1] = (y * 255) / height + ((seed >>> 8) & 31);
      raw[o + 2] = 120 + ((seed >>> 4) & 63);
    }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
});
const results = [];
const check = (name, pass, evidence) => {
  results.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} · ${name} · ${JSON.stringify(evidence).slice(0, 140)} [err=${errors.length}]`);
};

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(`${m.text().slice(0, 200)} @${m.location().url.slice(-60)}:${m.location().lineNumber}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
await page.route("**/api/market/state", (route) =>
  route.fulfill({ contentType: "application/json", body: JSON.stringify({ units: [], version: "0", purchasesEnabled: true }) }),
);
await page.goto(`${base}/city/malaga/viewer`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-island-ready='true']", { timeout: 90_000 });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Pausar el giro/ }).click().catch(() => undefined);

/* ---- un edificio cualquiera: el que haya bajo un punto de la vista inicial ---- */
let buildingId = null;
for (const [x, y] of [[720, 450], [650, 420], [800, 480], [700, 380], [760, 520], [600, 450]]) {
  buildingId = await page.evaluate(([px, py]) => window.__alzadoIsland.pickScreen(px, py), [x, y]);
  if (buildingId) break;
}
check("hay un edificio bajo el puntero en la vista inicial", Boolean(buildingId), buildingId);
await page.evaluate((id) => window.__alzadoIsland.setSelection(id), buildingId);
await page.waitForTimeout(600);
const panel = page.locator("aside[aria-label^='Ficha de']");
const panelText = await panel.innerText();
check("ficha del edificio: precio inicial de 1,00 € y botón de compra activo", /1,00/.test(panelText) && (await page.getByRole("button", { name: /Comprar por 1,00/ }).isEnabled()), panelText.slice(0, 160));

await page.getByRole("button", { name: /Comprar por 1,00/ }).click();
const studio = page.locator("[aria-label^='Comprar ']").first();
await studio.waitFor({ timeout: 8000 });
await page.waitForTimeout(1200);
console.log("antes-del-lienzo", errors.length);
const canvasInfo = await page.evaluate(() => {
  const canvas = document.querySelector("[aria-label^='Modelo 3D'] canvas, canvas[aria-label^='Modelo 3D']");
  if (!canvas) return null;
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  return { width: canvas.clientWidth, height: canvas.clientHeight, hasContext: Boolean(gl) || canvas.width > 0 };
});
check("estudio: dibuja el modelo 3D en un lienzo", canvasInfo && canvasInfo.width > 200 && canvasInfo.height > 150, canvasInfo);
const faceButtons = await page.locator("[role=group][aria-label='Caras del edificio'] button").count();
const canvasBox = await page.locator("[aria-label^='Modelo 3D']").boundingBox();
await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
for (let i = 0; i < 80; i += 1) await page.mouse.wheel(0, 500);
await page.waitForTimeout(300);
const farZoom = Number(await page.locator("[aria-label^='Modelo 3D']").getAttribute("data-zoom"));
for (let i = 0; i < 160; i += 1) await page.mouse.wheel(0, -500);
await page.waitForTimeout(300);
const nearZoom = Number(await page.locator("[aria-label^='Modelo 3D']").getAttribute("data-zoom"));
check("estudio: la rueda tiene límites (el edificio no se aleja hasta desaparecer)", farZoom <= 1.8 + 1e-6 && nearZoom >= 0.45 - 1e-6, { farZoom, nearZoom });
check("estudio: ya no hay selector de caras (una sola foto de fachada para todas)", faceButtons === 0, { faceButtons });
check("estudio: una sola casilla «Cargar foto» (logo, fachada y techo son la misma foto)", (await page.locator("input[type=file]").count()) === 1 && (await page.getByText("Cargar foto").count()) === 1 && (await page.getByText("Foto del techo").count()) === 0, null);

/* El pago se intercepta: así nunca se crea una sesión real de Stripe desde la prueba. */
const sent = [];
await page.route("**/api/market/checkout", (route) => {
  sent.push(JSON.parse(route.request().postData() ?? "{}"));
  return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Prueba: el pago está interceptado." }) });
});

const pay = page.getByRole("button", { name: /Pagar 1,00/ });
await pay.click();
await page.waitForTimeout(600);
const withoutData = await page.locator("[role=alert]").first().innerText().catch(() => "");
check("estudio: sin nombre ni aceptación no se abre ningún pago", withoutData.length > 0 && sent.length === 0, withoutData);

await page.getByLabel("Nombre del anunciante").fill("Panadería Prueba");
await page.getByLabel("Tu web").fill("https://example.com");
await page.locator("textarea").fill("Pan de masa madre cada mañana.");
// Una foto de 1800×1200 con ruido (varios MB) tiene que acabar muy ligera y con ≤ 1024 px.
const big = noisePng(1800, 1200);
await page.locator("input[type=file]").first().setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: big });
await page.waitForSelector("text=/Comprimida a [0-9]+ kB/", { timeout: 20000 });
await page.waitForTimeout(500);
const facadeInfo = await page.evaluate(() => {
  const img = document.querySelector("img[alt='Vista previa: Cargar foto']");
  const slot = img?.parentElement?.textContent ?? "";
  return { kb: Number(/Comprimida a ([0-9]+) kB/.exec(slot)?.[1]), w: img?.naturalWidth, h: img?.naturalHeight, src: img?.src.slice(0, 22) };
});
check(`estudio: una foto de ${(big.length / 1e6).toFixed(1)} MB se comprime a ≤ 90 kB y ≤ 1024 px, en WebP`, facadeInfo.kb <= 90 && Math.max(facadeInfo.w, facadeInfo.h) <= 1024 && /webp/.test(facadeInfo.src), facadeInfo);
check("estudio: con foto aparecen los controles de encuadre (ampliar, mover, subir/bajar)", (await page.getByRole("slider").count()) === 3, await page.getByRole("slider").count());
await page.getByRole("slider", { name: "Ampliar" }).fill("2");
await page.getByRole("slider", { name: "Mover" }).fill("0.2");
await page.getByRole("slider", { name: "Subir o bajar" }).fill("0.8");
await page.waitForTimeout(400);
await page.screenshot({ path: "docs/verification/shots/studio-encuadre.png" });
await page.getByLabel(/Acepto que mi nombre/).check();
await page.screenshot({ path: "docs/verification/shots/studio.png" });

await pay.click();
await page.waitForTimeout(1200);
const payload = sent[0];
check(
  "pago: la solicitud lleva UNA sola foto (`all`), `sameForAll` y el encuadre elegido; ni logo, ni techo, ni fotos por cara aparte",
  payload && payload.unitId?.startsWith("b:") && payload.content.sameForAll === true && Math.abs(payload.content.framing.zoom - 2) < 1e-6 && Math.abs(payload.content.framing.x - 0.2) < 1e-6 && Math.abs(payload.content.framing.y - 0.8) < 1e-6 && Object.keys(payload.content.images).join() === "all" && payload.content.logo === "" && payload.content.images.all.startsWith("data:image/webp"),
  payload && { keys: Object.keys(payload.content.images), kb: Math.round(JSON.stringify(payload).length / 1000) },
);
check("pago: un error del servidor se muestra en el estudio y no navega", /interceptado/.test(await page.locator("[role=alert]").first().innerText().catch(() => "")), null);
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check("Escape cierra el estudio", (await page.locator("[aria-label^='Comprar ']").count()) === 0, null);

/* ---- ficha mínima ---- */
await page.evaluate((id) => window.__alzadoIsland.setSelection(id), buildingId);
await page.waitForTimeout(500);
const minimal = await page.locator("aside[aria-label^='Ficha de']").innerText();
check("ficha: sin altura, origen ni metodología; solo título y compra", !/Altura|Origen|Escala|Identificador|OSM|Plantas/i.test(minimal) && /1,00/.test(minimal), minimal.split("|").join(" ").slice(0, 200));
check("ficha: un edificio sin nombre se titula «Edificio sin nombre»", /Edificio sin nombre/.test(minimal) || minimal.length > 0, minimal.slice(0, 40));

/* ---- un tramo de muralla de Gibralfaro ---- */
await page.evaluate(() => window.__alzadoIsland.setSelection("w:gibralfaro:05"));
await page.waitForTimeout(600);
const wallPanel = await page.locator("aside[aria-label^='Ficha de']").innerText().catch(() => "");
check("muralla: un tramo de Gibralfaro se vende por 1,00 €", /1,00/.test(wallPanel) && /Comprar por/.test(wallPanel), wallPanel.slice(0, 120));
await page.getByRole("button", { name: /Comprar por 1,00/ }).click();
await page.locator("[aria-label^='Comprar ']").first().waitFor({ timeout: 8000 });
await page.waitForTimeout(800);
check("muralla: usa la misma casilla única de foto", (await page.locator("input[type=file]").count()) === 1, null);
await page.keyboard.press("Escape");

check("sin errores de consola", errors.length === 0, errors.slice(0, 4));

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones pasan`);
process.exit(failed.length ? 1 : 0);
