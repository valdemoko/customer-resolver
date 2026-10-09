/**
 * Compone comparativas lado a lado (antes / después, ortofoto / modelo) en un PNG
 * para los informes. Las etiquetas viven en la imagen del DOCUMENTO, no en el
 * visor.
 *
 *   node tools/compose-shots.mjs --out docs/verification/shots/port/comparativa.png \
 *        --pair "ruta-izq.png|Etiqueta izquierda" --pair "ruta-dcha.png|Etiqueta derecha" [--columns 2]
 */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const pairs = [];
let out = "comparativa.png";
let columns = 2;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--out") out = args[i + 1];
  if (args[i] === "--columns") columns = Number(args[i + 1]);
  if (args[i] === "--pair") pairs.push(args[i + 1]);
}
const cells = [];
for (const pair of pairs) {
  const [path, label] = pair.split("|");
  const bytes = await readFile(path);
  const mime = path.endsWith(".jpg") ? "image/jpeg" : "image/png";
  cells.push(`<figure><img src="data:${mime};base64,${bytes.toString("base64")}"/><figcaption>${label ?? ""}</figcaption></figure>`);
}
const html = `<body style="margin:0;background:#fff;font-family:system-ui,sans-serif">
<style>
  .grid{display:grid;grid-template-columns:repeat(${columns},1fr);gap:8px;padding:8px}
  figure{margin:0}
  img{width:100%;display:block;border:1px solid #bbb}
  figcaption{font-size:20px;font-weight:600;padding:6px 2px}
</style><div class="grid">${cells.join("")}</div></body>`;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1000 * columns, height: 700 } });
await page.setContent(html);
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`escrito ${out}`);
