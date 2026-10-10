/**
 * Genera las curvas de nivel del fondo (public/brand/contours-a.svg y -b.svg).
 *
 * Un campo de ruido de valor suave (determinista, con semilla) se corta con
 * «marching squares» a varias alturas: son isolíneas como las de un plano
 * topográfico. Es la seña de identidad del fondo: cartografía, no brillos.
 *
 *   node tools/build-contours.mjs
 */
import { writeFile, mkdir } from "node:fs/promises";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeField(seed, cols, rows) {
  const rand = mulberry32(seed);
  const octaves = [
    { size: 7, amp: 1 },
    { size: 14, amp: 0.5 },
    { size: 29, amp: 0.22 },
  ].map(({ size, amp }) => {
    const gw = size + 2;
    const gh = Math.ceil((size * rows) / cols) + 2;
    const grid = Array.from({ length: gw * gh }, () => rand());
    return { size, amp, gw, gh, grid };
  });
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (o, x, y) => {
    const fx = (x / cols) * o.size;
    const fy = (y / rows) * o.size * (rows / cols);
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const g = (i, j) => o.grid[Math.min(o.gh - 1, j) * o.gw + Math.min(o.gw - 1, i)];
    const a = g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx;
    const b = g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx;
    return a * (1 - ty) + b * ty;
  };
  const values = new Float32Array((cols + 1) * (rows + 1));
  let max = 0;
  for (let y = 0; y <= rows; y += 1) {
    for (let x = 0; x <= cols; x += 1) {
      let v = 0;
      for (const o of octaves) v += sample(o, x, y) * o.amp;
      values[y * (cols + 1) + x] = v;
      max = Math.max(max, v);
    }
  }
  for (let i = 0; i < values.length; i += 1) values[i] /= max;
  return values;
}

function contours(values, cols, rows, level, scale) {
  const at = (x, y) => values[y * (cols + 1) + x];
  const lerp = (a, b) => (level - a) / (b - a);
  let d = "";
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      const index = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      if (index === 0 || index === 15) continue;
      const top = [x + lerp(tl, tr), y];
      const right = [x + 1, y + lerp(tr, br)];
      const bottom = [x + lerp(bl, br), y + 1];
      const left = [x, y + lerp(tl, bl)];
      const segs = {
        1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]],
        5: [[left, top], [bottom, right]], 6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]],
        9: [[top, bottom]], 10: [[left, bottom], [top, right]], 11: [[top, right]], 12: [[left, right]],
        13: [[bottom, right]], 14: [[left, bottom]],
      }[index];
      for (const [p, q] of segs) {
        d += `M${(p[0] * scale).toFixed(0)} ${(p[1] * scale).toFixed(0)}L${(q[0] * scale).toFixed(0)} ${(q[1] * scale).toFixed(0)}`;
      }
    }
  }
  return d;
}

await mkdir("public/brand", { recursive: true });
for (const [name, seed, stroke, levels] of [
  ["contours-a.svg", 20261009, "#f1ece2", 13],
  ["contours-b.svg", 77123, "#f1ece2", 10],
]) {
  const cols = 64;
  const rows = 100;
  const scale = 30; // viewBox 1920 × 3000
  const values = makeField(seed, cols, rows);
  let body = "";
  for (let i = 1; i <= levels; i += 1) {
    const level = 0.12 + (i / (levels + 1)) * 0.8;
    const major = i % 4 === 0;
    body += `<path d="${contours(values, cols, rows, level, scale)}" stroke-width="${major ? 1.6 : 0.8}" opacity="${major ? 0.9 : 0.55}"/>`;
  }
  // Lienzo TRES veces más ancho: el dibujo original en el centro y dos copias espejadas a los lados (los bordes
  // coinciden, sin costuras). Así el fondo llena también las bandas laterales en pantallas anchas, donde un
  // dibujo de proporción 1920 × 3000 solo ocuparía una franja central. `slice` lo hace cubrir el recuadro.
  const width = cols * scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-width} 0 ${width * 3} ${rows * scale}" preserveAspectRatio="xMidYMid slice" fill="none" stroke="${stroke}" stroke-linecap="round"><g id="t">${body}</g><use href="#t" transform="scale(-1 1)"/><use href="#t" transform="translate(${width * 2} 0) scale(-1 1)"/></svg>`;
  await writeFile(`public/brand/${name}`, svg);
  console.log(name, (svg.length / 1024).toFixed(0), "kB");
}
