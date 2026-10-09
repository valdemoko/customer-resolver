/**
 * Dibuja en un PNG (vista cenital, norte arriba) las capas que el pipeline deja
 * en data-pipeline/build: tierra, agua, superficies por clase, edificios,
 * murallas, atraques, locales… Es la comprobación visual previa al visor 3D.
 *
 *   node tools/render-data.mjs --out docs/verification/shots/port/datos-puerto.png \
 *        --bbox -900,-1500,1100,200 [--size 1800] [--layers land,water,surface,buildings,parcels,fortress,berths]
 *
 * `--bbox` en metros locales (minX,minY,maxX,maxY) respecto al centro del círculo.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const out = value("out", "render.png");
const [minX, minY, maxX, maxY] = value("bbox", "-1700,-1700,1700,1700").split(",").map(Number);
const size = Number(value("size", "1800"));
const layers = value("layers", "land,water,surface,buildings,fortress,berths,parcels").split(",");
const build = value("build", "data-pipeline/build");
const city = JSON.parse(await readFile("src/data/cities/malaga.geo.json", "utf8"));
const [lon0, lat0] = city.scene.coverage.circle.center;
const mx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
const toXY = ([lon, lat]) => [(lon - lon0) * mx, (lat - lat0) * 111_132];

const scale = size / Math.max(maxX - minX, maxY - minY);
const px = ([x, y]) => `${((x - minX) * scale).toFixed(1)},${((maxY - y) * scale).toFixed(1)}`;
const ringPath = (ring) => `M${ring.map((p) => px(toXY(p))).join("L")}Z`;
const polyPath = (geometry) => {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polys.map((poly) => poly.map(ringPath).join("")).join("");
};
const linePath = (coords) => `M${coords.map((p) => px(toXY(p))).join("L")}`;
const read = async (name) => {
  try {
    return JSON.parse(await readFile(join(build, `malaga.${name}.geojson`), "utf8")).features;
  } catch {
    return [];
  }
};

const FILL = {
  land: "#e6dfcf", sea: "#2f7fc4", river: "#6fb4e0", fountain: "#6fb4e0", water: "#6fb4e0", pond: "#6fb4e0", basin: "#6fb4e0",
  road_major: "#9a9a9a", road_minor: "#b3b0a8", road_other: "#bdb9b0", bridge: "#8c8c8c", rail: "#6b645c", plaza: "#d8c9a8",
  path: "#cdbf9d", steps: "#c3b48f", quay: "#c9c4b8", pier: "#bfb9ab", breakwater: "#8f8a80", beach: "#efdc9d", green: "#79ad5a", landuse: "#ddd3c0", pontoon: "#7a5a3a",
};
const parts = [];
const add = (d, fill, extra = "") => parts.push(`<path d="${d}" fill="${fill}" fill-rule="evenodd" ${extra}/>`);

if (layers.includes("land")) for (const f of await read("land")) add(polyPath(f.geometry), FILL.land);
if (layers.includes("water")) for (const f of await read("water")) add(polyPath(f.geometry), FILL[f.properties.kind] ?? FILL.water);
if (layers.includes("surface")) {
  const order = ["landuse", "green", "beach", "breakwater", "pier", "quay", "steps", "path", "plaza", "rail", "road_other", "road_minor", "road_major", "bridge", "pontoon"];
  const features = await read("surface");
  for (const kind of order) for (const f of features.filter((x) => x.properties.kind === kind)) add(polyPath(f.geometry), FILL[kind] ?? "#ccc");
}
if (layers.includes("buildings")) {
  for (const f of await read("buildings")) {
    const landmark = f.properties.name && /Catedral|Ayuntamiento/.test(f.properties.name);
    add(polyPath(f.geometry), landmark ? "#c8896a" : "#a8a49c", 'stroke="#6f6b63" stroke-width="0.6"');
  }
}
if (layers.includes("fortress")) {
  for (const f of await read("fortress")) {
    if (f.geometry.type === "LineString") parts.push(`<path d="${linePath(f.geometry.coordinates)}" fill="none" stroke="#7a3b22" stroke-width="3"/>`);
    else add(polyPath(f.geometry), "#b0502e", 'stroke="#5e2a17" stroke-width="0.8"');
  }
}
if (layers.includes("berths")) {
  for (const f of await read("berths")) {
    if (f.geometry.type === "LineString") parts.push(`<path d="${linePath(f.geometry.coordinates)}" fill="none" stroke="#e11d48" stroke-width="3" stroke-dasharray="10 5"/>`);
    else parts.push(`<path d="${polyPath(f.geometry)}" fill="rgba(225,29,72,.35)" stroke="#e11d48" stroke-width="1.5"/>`);
  }
}
if (layers.includes("parcels")) {
  for (const f of await read("parcels")) {
    const colour = f.properties.source === "osm_poi" ? "#0ea5e9" : f.properties.source === "catastro_unit" ? "#16a34a" : "#f59e0b";
    parts.push(`<path d="${linePath(f.geometry.coordinates)}" fill="none" stroke="${colour}" stroke-width="2.4" stroke-linecap="butt"/>`);
  }
}
const circleR = city.scene.coverage.circle.radiusM;
parts.push(`<circle cx="${((0 - minX) * scale).toFixed(1)}" cy="${((maxY - 0) * scale).toFixed(1)}" r="${(circleR * scale).toFixed(1)}" fill="none" stroke="#e11d48" stroke-width="2" stroke-dasharray="14 8"/>`);

const width = Math.round((maxX - minX) * scale);
const height = Math.round((maxY - minY) * scale);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#cddde6"/>${parts.join("")}</svg>`;

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width, height } });
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.screenshot({ path: out });
await browser.close();
console.log(`escrito ${out} (${width}x${height})`);
