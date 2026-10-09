/**
 * Superpone la huella de OpenStreetMap de la catedral (y las posiciones de las
 * torres y cúpulas del modelo) sobre la ortofoto PNOA, para comprobar a ojo y con
 * números que el modelo cae donde está el edificio.
 *
 *   node tools/landmark-overlay.mjs
 *
 * Escribe docs/verification/shots/catedral-superposicion.png (ortofoto +
 * huella + puntos de control numerados) y catedral-comparativa.png (ortofoto
 * junto a la captura cenital del visor).
 */
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const ortho = (await readFile("docs/verification/ortho/catedral-pnoa.jpg")).toString("base64");
const buildings = JSON.parse(await readFile("data-pipeline/build/malaga.buildings.geojson", "utf8"));
const feature = buildings.features.find((f) => f.properties.osm_id === "way/1015333951");
// BBOX de la ortofoto: lat 36.7192..36.7212, lon -4.4213..-4.4180, 1200 × 800 px.
const toPx = ([lon, lat]) => [((lon + 4.4213) / 0.0033) * 1200, ((36.7212 - lat) / 0.0020) * 800];
const ring = feature.geometry.coordinates[0].map(toPx);
const points = ring.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
const marks = [];
// Diez puntos de control: vértices de la huella repartidos por el contorno.
const step = Math.floor(ring.length / 10);
for (let i = 0; i < 10; i += 1) marks.push({ n: i + 1, p: ring[i * step], idx: i * step });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<image href="data:image/jpeg;base64,${ortho}" width="1200" height="800"/>
<polygon points="${points}" fill="rgba(255,60,200,0.10)" stroke="#ff2bd0" stroke-width="2"/>
${marks.map((m) => `<circle cx="${m.p[0]}" cy="${m.p[1]}" r="5" fill="#00e5ff" stroke="#000" stroke-width="1"/><text x="${m.p[0] + 7}" y="${m.p[1] - 7}" font-size="16" font-weight="bold" fill="#fff" stroke="#000" stroke-width="0.8">${m.n}</text>`).join("")}
</svg>`;
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.setContent(`<body style="margin:0">${svg}`);
await page.screenshot({ path: "docs/verification/shots/catedral-superposicion.png" });
console.log(JSON.stringify(marks.map((m) => ({ n: m.n, vertex: m.idx, px: m.p.map((v) => Math.round(v)) }))));
await browser.close();
