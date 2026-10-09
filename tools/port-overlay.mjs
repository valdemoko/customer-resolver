/**
 * Contraste de la geometría del puerto con la ORTOFOTO PNOA (IGN), con medición.
 *
 *   node tools/port-overlay.mjs
 *
 * 1. Dibuja sobre la ortofoto de Muelle Uno el contorno del mar, los muelles y
 *    los edificios del paquete, más 10 puntos de control numerados (esquinas
 *    fuertes de la orilla). Guarda `muelle-uno-superposicion.png`.
 * 2. MIDE: segmenta el agua de la ortofoto por color (azul-verdoso oscuro) y, para
 *    cada vértice de la costa del paquete dentro de la ortofoto, calcula la
 *    distancia a la orilla visible en la imagen. Para los 10 puntos de control y
 *    para el conjunto (mediana, p90). Guarda `muelle-uno-contraste.json`.
 *
 * Limitaciones declaradas: la segmentación por color confunde sombras largas y el
 * barco amarrado a la izquierda con agua o tierra; los puntos junto a él se
 * excluyen de la estadística. Es una comprobación de consistencia posicional, no
 * un levantamiento.
 */
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const BBOX = { south: 36.7125, west: -4.419, north: 36.7205, east: -4.409 };
const W = 1500;
const H = 1200;
const toPx = ([lon, lat]) => [((lon - BBOX.west) / (BBOX.east - BBOX.west)) * W, ((BBOX.north - lat) / (BBOX.north - BBOX.south)) * H];
const M_PER_PX = ((BBOX.east - BBOX.west) * 89_170) / W;

const ortho = await readFile("docs/verification/ortho/muelle-uno-pnoa.jpg");
const water = JSON.parse(await readFile("data-pipeline/build/malaga.water.geojson", "utf8")).features.filter((f) => f.properties.kind === "sea");
const surface = JSON.parse(await readFile("data-pipeline/build/malaga.surface.geojson", "utf8")).features;
const buildings = JSON.parse(await readFile("data-pipeline/build/malaga.buildings.geojson", "utf8")).features;

const polys = (f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates);
const inBox = ([lon, lat]) => lon >= BBOX.west && lon <= BBOX.east && lat >= BBOX.south && lat <= BBOX.north;

// Vértices de la costa dentro de la ortofoto, con su ángulo de giro.
const vertices = [];
const samples = [];
for (const f of water) {
  for (const poly of polys(f)) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const p = ring[i];
        if (!inBox(p)) continue;
        const a = toPx(ring[(i + ring.length - 2) % (ring.length - 1)]);
        const b = toPx(p);
        const c = toPx(ring[i + 1]);
        const v1 = [b[0] - a[0], b[1] - a[1]];
        const v2 = [c[0] - b[0], c[1] - b[1]];
        const turn = Math.abs(Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]));
        vertices.push({ lonlat: p, px: b, turn });
        // Muestras intermedias cada ~15 m de la arista (para la estadística).
        const q = ring[i + 1];
        const lengthM = Math.hypot((q[0] - p[0]) * 89_170, (q[1] - p[1]) * 111_132);
        const n = Math.floor(lengthM / 15);
        for (let k = 1; k <= n; k += 1) {
          const f = k / (n + 1);
          const lonlat = [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
          if (inBox(lonlat)) samples.push({ lonlat, px: toPx(lonlat) });
        }
      }
    }
  }
}

// Segmentación del agua de la ortofoto (decodificada en el navegador).
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const mask = await page.evaluate(
  async ({ b64, W, H }) => {
    const image = new Image();
    await new Promise((resolve) => {
      image.onload = resolve;
      image.src = `data:image/jpeg;base64,${b64}`;
    });
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, W, H).data;
    const out = new Array(W * H);
    for (let i = 0; i < W * H; i += 1) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      out[i] = r < 105 && g > r * 1.35 && b > g * 0.82 && b > r * 1.35 ? 1 : 0;
    }
    return out;
  },
  { b64: ortho.toString("base64"), W, H },
);

// Distancia (px) de cada píxel al borde agua/tierra de la ortofoto (chamfer 3-4).
const dist = new Float32Array(W * H).fill(1e9);
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const i = y * W + x;
    const m = mask[i];
    const edge = (x > 0 && mask[i - 1] !== m) || (y > 0 && mask[i - W] !== m);
    if (edge) dist[i] = 0;
  }
}
const relax = (i, j, w) => {
  if (dist[j] + w < dist[i]) dist[i] = dist[j] + w;
};
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  const i = y * W + x;
  if (x > 0) relax(i, i - 1, 1);
  if (y > 0) {
    relax(i, i - W, 1);
    if (x > 0) relax(i, i - W - 1, 1.414);
    if (x < W - 1) relax(i, i - W + 1, 1.414);
  }
}
for (let y = H - 1; y >= 0; y -= 1) for (let x = W - 1; x >= 0; x -= 1) {
  const i = y * W + x;
  if (x < W - 1) relax(i, i + 1, 1);
  if (y < H - 1) {
    relax(i, i + W, 1);
    if (x < W - 1) relax(i, i + W + 1, 1.414);
    if (x > 0) relax(i, i + W - 1, 1.414);
  }
}
const edgeDistanceM = ([x, y]) => {
  const xi = Math.min(W - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(H - 1, Math.max(0, Math.round(y)));
  return dist[yi * W + xi] * M_PER_PX;
};

// Se excluye lo que cae sobre el barco amarrado (px 100..260, 640..900).
const notShip = (v) => !(v.px[0] > 100 && v.px[0] < 270 && v.px[1] > 640 && v.px[1] < 900);
const usable = [...vertices, ...samples].filter(notShip);
const all = usable.map((v) => edgeDistanceM(v.px)).sort((a, b) => a - b);
const pct = (q) => all[Math.min(all.length - 1, Math.floor(all.length * q))] ?? 0;

// Diez puntos de control: esquinas fuertes repartidas (se evitan las muy próximas).
const corners = vertices.filter(notShip).filter((v) => v.turn > 0.12).sort((a, b) => b.turn - a.turn);
const controls = [];
for (const c of corners) {
  if (controls.every((k) => Math.hypot(k.px[0] - c.px[0], k.px[1] - c.px[1]) > 55)) controls.push(c);
  if (controls.length === 10) break;
}
// Si no hay 10 esquinas útiles (la orilla del paquete tiene pocos vértices), se
// completan con los puntos medios de las aristas más largas de la orilla.
if (controls.length < 10) {
  const edges = [];
  for (const f of water) {
    for (const poly of polys(f)) {
      for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i += 1) {
          const mid = [(ring[i][0] + ring[i + 1][0]) / 2, (ring[i][1] + ring[i + 1][1]) / 2];
          if (!inBox(mid)) continue;
          const px = toPx(mid);
          const lengthM = Math.hypot((ring[i + 1][0] - ring[i][0]) * 89_170, (ring[i + 1][1] - ring[i][1]) * 111_132);
          edges.push({ lonlat: mid, px, lengthM, kind: "mitad de arista" });
        }
      }
    }
  }
  edges.sort((a, b) => b.lengthM - a.lengthM);
  for (const e of edges.filter(notShip)) {
    if (controls.length >= 10) break;
    if (controls.every((k) => Math.hypot(k.px[0] - e.px[0], k.px[1] - e.px[1]) > 55)) controls.push(e);
  }
}
const report = {
  generatedAt: new Date().toISOString().slice(0, 10),
  orthophoto: { source: "PNOA (IGN), WMS OI.OrthoimageCoverage", bbox: BBOX, size: [W, H], metersPerPixel: Number(M_PER_PX.toFixed(3)) },
  coastVerticesInImage: vertices.length,
  coastSamplesUsed: usable.length,
  p75: Number(pct(0.75).toFixed(2)),
  distanceToVisibleShoreM: { median: Number(pct(0.5).toFixed(2)), p90: Number(pct(0.9).toFixed(2)), max: Number(all.at(-1).toFixed(2)) },
  controlPoints: controls.map((c, i) => ({
    n: i + 1,
    kind: c.kind ?? "esquina",
    lonlat: c.lonlat.map((v) => Number(v.toFixed(6))),
    px: c.px.map(Math.round),
    distanceToVisibleShoreM: Number(edgeDistanceM(c.px).toFixed(2)),
  })),
  note: "Segmentación del agua por color; las sombras y el barco amarrado pueden confundirse. Consistencia posicional, no levantamiento.",
};
await writeFile("docs/verification/ortho/muelle-uno-contraste.json", JSON.stringify(report, null, 2));

// Superposición dibujada.
const ringPath = (ring) => `M${ring.map((p) => toPx(p).map((v) => v.toFixed(1)).join(",")).join("L")}Z`;
const geomPath = (g) => polys({ geometry: g }).map((poly) => poly.map(ringPath).join("")).join("");
const parts = [];
for (const f of water) parts.push(`<path d="${geomPath(f.geometry)}" fill="rgba(0,120,255,0.14)" stroke="#00b7ff" stroke-width="2" fill-rule="evenodd"/>`);
for (const f of surface.filter((x) => ["quay", "pier", "breakwater"].includes(x.properties.kind))) {
  parts.push(`<path d="${geomPath(f.geometry)}" fill="rgba(255,200,0,0.10)" stroke="#ffcc00" stroke-width="1.5"/>`);
}
for (const f of buildings) {
  const first = f.geometry.coordinates[0]?.[0];
  if (first && inBox(first)) parts.push(`<path d="${geomPath(f.geometry)}" fill="none" stroke="#ff2bd0" stroke-width="1.2"/>`);
}
for (const [i, c] of controls.entries()) {
  parts.push(`<circle cx="${c.px[0]}" cy="${c.px[1]}" r="7" fill="#00ffa3" stroke="#000" stroke-width="1.5"/><text x="${c.px[0] + 10}" y="${c.px[1] - 10}" font-size="20" font-weight="bold" fill="#fff" stroke="#000" stroke-width="1">${i + 1}</text>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><image href="data:image/jpeg;base64,${ortho.toString("base64")}" width="${W}" height="${H}"/>${parts.join("")}</svg>`;
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.screenshot({ path: "docs/verification/shots/port/muelle-uno-superposicion.png" });
await browser.close();
console.log(JSON.stringify({ ...report, controlPoints: report.controlPoints.map((c) => `${c.n}:${c.distanceToVisibleShoreM}m`) }, null, 2));
