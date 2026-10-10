/**
 * Genera el modelo de La Farola de Málaga (faro del puerto) como GLB.
 *
 *   node tools/build-farola-glb.mjs
 *
 * Convención de `landmarks.ts`: x y z en [-0,5, 0,5] (se estiran a la caja que
 * encierra la huella de OpenStreetMap, aquí ≈ 14 × 14 m) e y en METROS REALES.
 *
 * QUÉ SE MODELA: la casa del farero (cuerpo bajo cuadrado), la torre troncocónica
 * con su moldura, el balcón, la linterna acristalada, la cúpula y el remate.
 *
 * ALTURA: las fuentes no coinciden. El boletín del IAPH da 21,64 m para la torre
 * troncocónica; un informe de la Real Academia de Bellas Artes de San Fernando da
 * 33 m en total y alguna guía turística 37 m contando el remate. Se usa 33 m como
 * altura total (torre + linterna + cúpula). Las proporciones son una ESTIMACIÓN
 * a partir de fotografías: no hay plano publicado.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import earcut from "earcut";

const L = 14; // lado de la caja (m), de la huella de OSM (≈197 m²)
const W = 14;
const TOTAL = 33;

const positions = [];
const colors = [];
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const tri = (a, b, c, color) => {
  for (const p of [a, b, c]) {
    positions.push(p[0] / L, p[1], p[2] / W);
    colors.push(...color);
  }
};
const quad = (a, b, c, d, color) => {
  tri(a, b, c, color);
  tri(a, c, d, color);
};
const WHITE = hex("#ece7da");
const BAND = hex("#c9bda3");
const HOUSE = hex("#e2d6b6");
const PLINTH = hex("#c8b995");
const ROOF = hex("#a39a8b");
const GLASS = hex("#a9cfe0");
const FRAME = hex("#5f666e");
const CAP = hex("#6d7278");

const ring = (r, sides = 16) =>
  Array.from({ length: sides }, (_, i) => [Math.cos((i / sides) * Math.PI * 2) * r, Math.sin((i / sides) * Math.PI * 2) * r]);

/** Paredes inclinadas entre dos anillos (CCW), mismo orden que `walls` de la catedral. */
function frustum(r0, r1, y0, y1, color, sides = 16) {
  const a = ring(r0, sides);
  const b = ring(r1, sides);
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    quad([a[i][0], y0, a[i][1]], [b[i][0], y1, b[i][1]], [b[j][0], y1, b[j][1]], [a[j][0], y0, a[j][1]], color);
  }
}
/** Tapa horizontal hacia arriba. */
function cap(poly, y, color) {
  const idx = earcut(poly.flat());
  for (let i = 0; i < idx.length; i += 3) {
    const p = (k) => [poly[idx[i + k]][0], y, poly[idx[i + k]][1]];
    tri(p(0), p(2), p(1), color);
  }
}
/** Cono: anillo en la base y punta arriba. */
function cone(r, y0, y1, color, sides = 16) {
  const a = ring(r, sides);
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    tri([a[i][0], y0, a[i][1]], [0, y1, 0], [a[j][0], y0, a[j][1]], color);
  }
}
const square = (half) => [[-half, -half], [half, -half], [half, half], [-half, half]];
function prism(poly, y0, y1, wall, roof) {
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    quad([a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]], wall);
  }
  cap(poly, y1, roof);
}

// 1 · Zócalo y casa del farero (el cuerpo de 6 m que da OpenStreetMap).
prism(square(6.4), 0, 1.0, PLINTH, PLINTH);
prism(square(5.6), 1.0, 6.0, HOUSE, ROOF);

// 2 · Torre troncocónica: moldura de arranque, fuste en tres tramos y remate de cornisa.
frustum(4.6, 4.2, 6.0, 6.9, BAND);
cap(ring(4.2), 6.9, BAND);
frustum(3.7, 3.25, 6.9, 15.0, WHITE);
frustum(3.25, 3.2, 15.0, 15.7, BAND);
frustum(3.2, 2.7, 15.7, 23.6, WHITE);

// 3 · Balcón: ménsula que se abre, parapeto y losa.
frustum(2.7, 3.55, 23.6, 24.3, BAND);
frustum(3.55, 3.55, 24.3, 25.3, WHITE);
cap(ring(3.55), 25.3, ROOF);

// 4 · Linterna acristalada con montantes oscuros y su cornisa.
frustum(2.0, 2.0, 25.3, 25.55, FRAME);
frustum(1.9, 1.9, 25.55, 28.8, GLASS);
for (let k = 0; k < 8; k += 1) {
  const a = (k / 8) * Math.PI * 2;
  const cx = Math.cos(a) * 1.93;
  const cz = Math.sin(a) * 1.93;
  const t = [-0.1, 0.1];
  const tang = [-Math.sin(a), Math.cos(a)];
  const nrm = [Math.cos(a), Math.sin(a)];
  const p = (u, v, y) => [cx + tang[0] * u + nrm[0] * v, y, cz + tang[1] * u + nrm[1] * v];
  quad(p(t[0], 0.04, 25.55), p(t[0], 0.04, 28.8), p(t[1], 0.04, 28.8), p(t[1], 0.04, 25.55), FRAME);
}
frustum(2.15, 2.4, 28.8, 29.4, FRAME);
cap(ring(2.4), 29.4, FRAME);

// 5 · Cúpula y remate.
cone(2.3, 29.4, 32.0, CAP);
frustum(0.12, 0.08, 31.9, TOTAL, FRAME, 6);
cone(0.14, TOTAL - 0.05, TOTAL, FRAME, 6);

/* --------------------------------------------------------------------- GLB */
const position = new Float32Array(positions);
const color = new Float32Array(colors);
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < position.length; i += 3) {
  for (let k = 0; k < 3; k += 1) {
    min[k] = Math.min(min[k], position[i + k]);
    max[k] = Math.max(max[k], position[i + k]);
  }
}
const bin = Buffer.concat([Buffer.from(position.buffer), Buffer.from(color.buffer)]);
const json = {
  asset: { version: "2.0", generator: "alzado tools/build-farola-glb.mjs" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "farola-de-malaga" }],
  meshes: [{ name: "farola", primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, material: 0, mode: 4 }] }],
  materials: [{ name: "piedra", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: position.length / 3, type: "VEC3", min, max },
    { bufferView: 1, componentType: 5126, count: color.length / 3, type: "VEC3" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: position.byteLength, target: 34962 },
    { buffer: 0, byteOffset: position.byteLength, byteLength: color.byteLength, target: 34962 },
  ],
  buffers: [{ byteLength: bin.length }],
  extras: { osmId: "way/153212848", footprintBox: { lengthM: L, widthM: W }, totalHeightM: TOTAL, estimated: ["proportions", "totalHeight"] },
};
let jsonBuffer = Buffer.from(JSON.stringify(json));
jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc((4 - (jsonBuffer.length % 4)) % 4, 0x20)]);
const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuffer.length + 8 + binPadded.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonBuffer.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binPadded.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);
const out = "public/models/malaga/farola.glb";
await mkdir(dirname(out), { recursive: true });
await writeFile(out, Buffer.concat([header, jsonHeader, jsonBuffer, binHeader, binPadded]));
console.log(`${out}: ${(positions.length / 9) | 0} triángulos, ${TOTAL} m de altura total`);
