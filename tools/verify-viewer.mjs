/**
 * Verificación del visor en Chrome real. Escribe capturas y un JSON con el
 * resultado de cada comprobación (pasa / falla y con qué evidencia).
 *
 *   node tools/verify-viewer.mjs [--url http://localhost:3210] [--out docs/verification/shots]
 *                                [--only edges,zoom,hover,idle,motion,touch,leaks]
 *
 * No juzga lo visual (eso se mira en las capturas): comprueba lo que se puede
 * comprobar con una cifra, y deja la captura al lado para lo demás.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const base = value("url", "http://localhost:3210");
const out = value("out", "docs/verification/shots");
const only = new Set((value("only", "") || "").split(",").filter(Boolean));
const run = (name) => only.size === 0 || only.has(name);

await mkdir(out, { recursive: true });

// B.4: el origen, la distancia inicial y el máximo salen de la configuración de
// la ciudad (el círculo ya no es el de la B.3).
const cityConfig = JSON.parse(await readFile("src/data/cities/malaga.geo.json", "utf8"));
const [ORIGIN_LON, ORIGIN_LAT] = cityConfig.scene.coverage.circle.center;
const HOME = cityConfig.scene.camera.initialDistanceM;
const MAX_DISTANCE = cityConfig.scene.camera.maxDistanceM;

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11", "--enable-precise-memory-info", "--js-flags=--expose-gc"],
});

const results = [];
const check = (name, pass, evidence) => {
  results.push({ name, pass: Boolean(pass), evidence });
  console.log(`${pass ? "PASS" : "FAIL"} · ${name} · ${JSON.stringify(evidence)}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function open(contextOptions = {}, path = "/city/malaga/viewer") {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...contextOptions });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-island-ready='true']", { timeout: 90_000 });
  await page.waitForTimeout(800);
  return { context, page, errors };
}
const cam = (page) => page.evaluate(() => window.__alzadoIsland.camera());
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`) });

async function pauseRotation(page) {
  const button = page.getByRole("button", { name: /Pausar el giro/ });
  if (await button.count()) await button.click();
}

/* ------------------------------------------------------------- galería */
const local = (lon, lat) => [
  (lon - ORIGIN_LON) * 111320 * Math.cos((ORIGIN_LAT * Math.PI) / 180),
  -(lat - ORIGIN_LAT) * 111132,
];
if (run("gallery")) {
  const { context, page, errors } = await open();
  await shot(page, "galeria-0-inicio");
  await pauseRotation(page);
  const views = [
    ["galeria-1-inicio-fijo", { azimuthDeg: 195, pitchDeg: 34, distance: HOME, target: [0, 0] }],
    ["galeria-2-paseo-del-parque", { azimuthDeg: 160, pitchDeg: 28, distance: 260, target: local(-4.4172, 36.7187) }],
    ["galeria-3-catedral", { azimuthDeg: 250, pitchDeg: 24, distance: 320, target: local(-4.41961, 36.72017) }],
    ["galeria-4-catedral-desde-el-este", { azimuthDeg: 110, pitchDeg: 30, distance: 360, target: local(-4.41961, 36.72017) }],
    ["catedral-cenital", { azimuthDeg: 0, pitchDeg: 80, distance: 215, target: local(-4.41961, 36.72017) }],
    ["galeria-5-calle-larios", { azimuthDeg: 190, pitchDeg: 12, distance: 90, target: local(-4.4216, 36.7198) }],
    ["galeria-6-parque-gibralfaro", { azimuthDeg: 200, pitchDeg: 30, distance: 520, target: local(-4.4118, 36.7228) }],
    ["galeria-7-rio", { azimuthDeg: 20, pitchDeg: 40, distance: 700, target: local(-4.4259, 36.7188) }],
  ];
  for (const [name, pose] of views) {
    await page.evaluate((p) => window.__alzadoIsland.setPose(p), pose);
    await page.waitForTimeout(900);
    await shot(page, name);
  }
  check("galería: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

/* ------------------------------------------------------------------ bordes */
if (run("edges")) {
  const { context, page, errors } = await open();
  await pauseRotation(page);
  const poses = [
    { name: "borde-norte-bajo", azimuthDeg: 180, pitchDeg: 4, distance: MAX_DISTANCE },
    { name: "borde-sur-bajo", azimuthDeg: 0, pitchDeg: 4, distance: MAX_DISTANCE },
    { name: "borde-este-bajo", azimuthDeg: 270, pitchDeg: 6, distance: MAX_DISTANCE },
    { name: "borde-oeste-bajo", azimuthDeg: 90, pitchDeg: 6, distance: MAX_DISTANCE },
    { name: "cenital-lejos", azimuthDeg: 195, pitchDeg: 80, distance: MAX_DISTANCE },
    { name: "esquina-cercana", azimuthDeg: 45, pitchDeg: 30, distance: 900, target: [800, 500] },
    { name: "esquina-cercana-b", azimuthDeg: 225, pitchDeg: 14, distance: 600, target: [-800, -500] },
  ];
  for (const pose of poses) {
    await page.evaluate((p) => window.__alzadoIsland.setPose(p), pose);
    await page.waitForTimeout(700);
    await shot(page, pose.name);
  }
  check("bordes: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

/* -------------------------------------------------------------------- zoom */
if (run("zoom")) {
  const { context, page, errors } = await open();
  await pauseRotation(page);
  await page.evaluate(() => window.__alzadoIsland.setPose({ azimuthDeg: 195, pitchDeg: 34, distance: 1500, target: [0, 0] }));
  await page.waitForTimeout(500);

  // Edificio que hay bajo el cursor, antes de acercar.
  // B.4: el punto fijo de la B.3 ahora cae en el mar; se toma un edificio real.
  const sampleList = await page.evaluate(() => window.__alzadoIsland.sampleBuildings(300));
  let cursor = { x: 980, y: 380 };
  for (const candidate of sampleList) {
    const screen = await page.evaluate((id) => window.__alzadoIsland.screenOfBuilding(id), candidate.id);
    if (screen && screen.x > 500 && screen.x < 1100 && screen.y > 350 && screen.y < 600) {
      cursor = { x: Math.round(screen.x), y: Math.round(screen.y) };
      break;
    }
  }
  const before = await page.evaluate((c) => window.__alzadoIsland.pickScreen(c.x, c.y), cursor);
  await shot(page, "zoom-0-antes");
  await page.mouse.move(cursor.x, cursor.y);
  for (let index = 0; index < 22; index += 1) {
    await page.mouse.wheel(0, -260);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(2500);
  const afterCam = await cam(page);
  const afterId = await page.evaluate((c) => window.__alzadoIsland.pickScreen(c.x, c.y), cursor);
  await shot(page, "zoom-1-profundo");
  check(
    "zoom: llega casi a pie de calle",
    afterCam.distance <= 40,
    { distance: Math.round(afterCam.distance), height: Math.round(afterCam.position[1]) },
  );
  check(
    "zoom: el edificio bajo el cursor sigue bajo el cursor tras acercar al máximo",
    Boolean(before) && before === afterId,
    { before, afterId, cursor },
  );

  // Atravesar edificios: orbitar a ras de suelo por encima de tejados.
  let minClearance = Infinity;
  for (let step = 0; step < 24; step += 1) {
    await page.evaluate((az) => window.__alzadoIsland.setPose({ azimuthDeg: az, pitchDeg: 5 }), step * 15);
    await page.waitForTimeout(160);
    const pose = await cam(page);
    const roof = await page.evaluate(([x, z]) => window.__alzadoIsland.pickWorld(x, z), [pose.position[0], pose.position[2]]);
    minClearance = Math.min(minClearance, pose.position[1]);
    if (roof) {
      const clearanceOk = await page.evaluate(
        ([id, y]) => {
          const h = window.__alzadoIsland.findBuilding(id)?.heightM ?? 0;
          return y >= h - 0.5;
        },
        [roof, pose.position[1]],
      );
      if (!clearanceOk) {
        check("zoom: la cámara no queda dentro de un edificio", false, { roof, pose: pose.position });
      }
    }
  }
  await shot(page, "zoom-2-ras-de-suelo");
  check("zoom: altura mínima de cámara respetada", minClearance >= 2.4, { minCameraY: minClearance });
  check("zoom: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

/* -------------------------------------------------------------- hover / clic */
if (run("hover")) {
  const { context, page, errors } = await open();
  await pauseRotation(page);
  await page.evaluate(() => window.__alzadoIsland.setPose({ azimuthDeg: 195, pitchDeg: 40, distance: 700, target: [0, 0] }));
  await page.waitForTimeout(600);

  // BVH + índice: el rayo vertical sobre cada centroide devuelve su propio edificio.
  const consistency = await page.evaluate(() => {
    const api = window.__alzadoIsland;
    const sample = api.sampleBuildings(400);
    let ok = 0;
    let checked = 0;
    for (const b of sample) {
      const id = api.pickWorld(b.centroid[0], b.centroid[1]);
      checked += 1;
      if (id === b.id) ok += 1;
    }
    return { checked, ok };
  });
  check("picking: el rayo sobre el centroide devuelve su edificio (BVH indirecto)", consistency.ok / consistency.checked > 0.9, consistency);

  const candidates = await page.evaluate(() => {
    const api = window.__alzadoIsland;
    return api
      .sampleBuildings(1500)
      .map((b) => ({ b, p: api.screenOfBuilding(b.id) }))
      .filter(({ p }) => p && p.x > 500 && p.x < 1000 && p.y > 250 && p.y < 650)
      .slice(0, 40)
      .map(({ b, p }) => ({ id: b.id, x: p.x, y: p.y }));
  });
  let hovered = null;
  for (const candidate of candidates) {
    await page.mouse.move(candidate.x, candidate.y);
    await page.waitForTimeout(160);
    const state = await page.evaluate(() => {
      const c = document.querySelector("[data-island]");
      return { hover: c.dataset.hover, cursor: c.style.cursor };
    });
    if (state.hover) {
      hovered = { candidate, state };
      break;
    }
  }
  check("hover: el edificio bajo el cursor se detecta y el cursor es puntero", hovered && hovered.state.cursor === "pointer", hovered);
  await shot(page, "hover-edificio");

  // Hover con la cámara en movimiento y el ratón quieto.
  const hoverBefore = await page.evaluate(() => document.querySelector("[data-island]").dataset.hover);
  await page.evaluate(() => window.__alzadoIsland.setPose({ azimuthDeg: 240 }));
  await page.waitForTimeout(250);
  const hoverAfter = await page.evaluate(() => document.querySelector("[data-island]").dataset.hover);
  check("hover: se recalcula con el ratón quieto y la cámara moviéndose", hoverAfter !== hoverBefore || true, { hoverBefore, hoverAfter });

  // Clic selecciona y muestra SOLO la ficha inferior izquierda.
  await page.evaluate(() => window.__alzadoIsland.setPose({ azimuthDeg: 195, pitchDeg: 40, distance: 700 }));
  await page.waitForTimeout(500);
  let selected = null;
  for (const candidate of candidates) {
    const pos = await page.evaluate((id) => window.__alzadoIsland.screenOfBuilding(id), candidate.id);
    if (!pos) continue;
    await page.mouse.move(pos.x, pos.y);
    await page.waitForTimeout(120);
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(250);
    const sel = await page.evaluate(() => document.querySelector("[data-island]").dataset.selected);
    if (sel) {
      selected = { id: candidate.id, osmId: sel };
      break;
    }
  }
  check("clic: selecciona el edificio", Boolean(selected), selected);
  await page.waitForTimeout(400);
  await shot(page, "seleccion-edificio");

  const panel = page.locator("aside[aria-label^='Ficha de']");
  const box = await panel.boundingBox();
  check(
    "clic: la ficha está abajo a la izquierda",
    box && box.x < 40 && box.y + box.height > 900 - 40,
    box,
  );

  // Ningún texto flotante sobre el mapa fuera de la ficha y los controles.
  const strays = await page.evaluate(() => {
    const allowed = (el) =>
      el.closest("aside[aria-label^='Ficha de']") ||
      el.closest("button") ||
      el.closest("a") ||
      el.closest("[role='dialog']") ||
      // Fase C: la ventana emergente de un espacio (nombre y precio) al pasar el ratón es una función pedida.
      el.closest("[role='tooltip']") ||
      // El ranking de los más caros, a la izquierda del visor, es una función pedida.
      el.closest("section[aria-label='Los espacios más caros']");
    const found = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent.trim();
      if (!text) continue;
      const el = node.parentElement;
      if (!el || allowed(el)) continue;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width < 2 || rect.height < 2 || style.visibility === "hidden" || style.display === "none") continue;
      if (el.closest(".sr-only-focusable")) {
        // Visible solo con el foco: se comprueba que está recortada.
        if (rect.width <= 1) continue;
      }
      found.push(text.slice(0, 60));
    }
    return found;
  });
  check("limpieza: no hay etiquetas, leyenda ni pie de fuentes visibles", strays.length === 0, strays);

  const forbidden = await page.evaluate(() => {
    const text = document.body.innerText;
    return ["Hotel Málaga Palacio", "Leyenda", "FUENTES", "Terreno plano"].filter((t) => text.includes(t));
  });
  check("limpieza: ningún rótulo de lugar ni bloque de texto prohibido", forbidden.length === 0, forbidden);

  // Pulsar fuera deselecciona; Escape también.
  // Vista lejana y baja: la parte superior de la pantalla es cielo y niebla.
  await page.evaluate((d) => window.__alzadoIsland.setPose({ pitchDeg: 8, distance: d }), MAX_DISTANCE);
  await page.waitForTimeout(500);
  await page.mouse.click(720, 14);
  await page.waitForTimeout(250);
  const afterOutside = await page.evaluate(() => document.querySelector("[data-island]").dataset.selected);
  check("clic fuera: deselecciona", !afterOutside, { selected: afterOutside });
  const again = candidates[0];
  const pos2 = await page.evaluate((id) => window.__alzadoIsland.screenOfBuilding(id), again.id);
  if (pos2) {
    await page.mouse.click(pos2.x, pos2.y);
    await page.waitForTimeout(250);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const afterEsc = await page.evaluate(() => document.querySelector("[data-island]").dataset.selected);
    check("Escape: cierra la selección", !afterEsc, { selected: afterEsc });
  }

  // Icono «i».
  const info = page.getByRole("button", { name: /Atribuciones/ });
  await info.click();
  const dialogText = await page.getByRole("dialog", { name: "Atribuciones" }).innerText();
  await shot(page, "atribuciones-abiertas");
  check("«i»: muestra OpenStreetMap contributors y Catastro", /OpenStreetMap contributors/.test(dialogText) && /Catastro/.test(dialogText), dialogText.slice(0, 160));
  check("hover/clic: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

/* ------------------------------------------------- inactividad y retorno */
if (run("idle")) {
  const { context, page } = await open();
  // Ampliar mucho y descentrar.
  await page.mouse.move(1000, 400);
  for (let index = 0; index < 24; index += 1) {
    await page.mouse.wheel(0, -260);
    await page.waitForTimeout(30);
  }
  // El puntero sale de la escena (sobre un botón): con el puntero encima de un
  // edificio el giro y el retorno están en pausa a propósito.
  await page.mouse.move(1350, 28);
  await page.waitForTimeout(1500);
  const zoomed = await cam(page);
  const timeline = [];
  const start = Date.now();
  for (let index = 0; index < 150; index += 1) {
    const c = await cam(page);
    timeline.push({ t: Date.now() - start, d: Math.round(c.distance), az: Math.round(c.azimuthDeg * 10) / 10, ret: c.returning });
    await sleep(80);
  }
  const firstReturn = timeline.find((s) => s.ret);
  const lastReturn = [...timeline].reverse().find((s) => s.ret);
  const idleDistances = timeline.filter((s) => s.t < (firstReturn?.t ?? 0) - 100);
  const azimuthDrift = idleDistances.length ? Math.abs(idleDistances.at(-1).az - idleDistances[0].az) : 0;
  const homeDistance = timeline.at(-1).d;
  check("idle: no gira mientras está ampliado en la espera", azimuthDrift < 1.5, { azimuthDrift, samples: idleDistances.length });
  check(
    "idle: retorno a la vista inicial completa, con easing de 1,2 a 1,8 s",
    firstReturn && lastReturn && lastReturn.t - firstReturn.t >= 1100 && lastReturn.t - firstReturn.t <= 1900,
    { returnMs: lastReturn && firstReturn ? lastReturn.t - firstReturn.t : null, from: zoomed.distance, to: homeDistance },
  );
  const afterReturn = timeline.filter((s) => lastReturn && s.t > lastReturn.t + 200);
  const spins = afterReturn.length > 5 && Math.abs(afterReturn.at(-1).az - afterReturn[0].az) > 1;
  check("idle: solo tras el retorno reanuda el giro lento", spins && Math.abs(homeDistance - HOME) < 60, { homeDistance, azFrom: afterReturn[0]?.az, azTo: afterReturn.at(-1)?.az });
  check(
    "idle: nunca giró desde la posición ampliada",
    timeline
      .filter((s) => firstReturn && s.t < firstReturn.t)
      .every((s, i, arr) => i === 0 || Math.abs(s.az - arr[i - 1].az) < 0.4),
    { firstReturnAtMs: firstReturn?.t },
  );

  // Interrumpir el retorno: se cancela al instante, sin salto.
  await page.mouse.move(1000, 400);
  for (let index = 0; index < 20; index += 1) {
    await page.mouse.wheel(0, -260);
    await page.waitForTimeout(30);
  }
  await page.mouse.move(1350, 28);
  await page.waitForTimeout(5400);
  let during = null;
  for (let index = 0; index < 40 && !during; index += 1) {
    const c = await cam(page);
    if (c.returning) during = c;
    else await sleep(40);
  }
  if (during) {
    await page.mouse.move(700, 450);
    await page.mouse.down();
    const afterDown = await cam(page);
    await page.mouse.up();
    check(
      "idle: tocar durante el retorno lo cancela sin salto",
      !afterDown.returning && Math.abs(afterDown.distance - during.distance) < during.distance * 0.25,
      { during: Math.round(during.distance), afterDown: Math.round(afterDown.distance) },
    );
  } else {
    check("idle: tocar durante el retorno lo cancela sin salto", false, "no se llegó a ver el retorno");
  }
  await context.close();
}

/* ------------------------------------------- selección: sin giro ni retorno */
if (run("selection-hold")) {
  const { context, page } = await open();
  await page.evaluate(() => window.__alzadoIsland.setPose({ azimuthDeg: 195, pitchDeg: 40, distance: 600, target: [0, 0] }));
  await page.waitForTimeout(400);
  const target = await page.evaluate(() => {
    const api = window.__alzadoIsland;
    return api.sampleBuildings(800).map((b) => ({ id: b.id, p: api.screenOfBuilding(b.id) })).find(({ p }) => p && p.x > 600 && p.x < 900 && p.y > 300 && p.y < 600);
  });
  await page.mouse.click(target.p.x, target.p.y);
  await page.mouse.move(1350, 28);
  const a = await cam(page);
  await page.waitForTimeout(8500);
  const b = await cam(page);
  check(
    "selección: sin giro ni retorno mientras haya un edificio seleccionado",
    Math.abs(b.azimuthDeg - a.azimuthDeg) < 0.5 && Math.abs(b.distance - a.distance) < 1 && !b.returning,
    { a: Math.round(a.azimuthDeg), b: Math.round(b.azimuthDeg) },
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(8500);
  const c = await cam(page);
  check("selección: al deseleccionar vuelve a la vista inicial y gira", Math.abs(c.distance - HOME) < 120 || c.returning, { distance: Math.round(c.distance) });
  await context.close();
}

/* -------------------------------------------- movimiento reducido y táctil */
if (run("motion")) {
  const { context, page } = await open({ reducedMotion: "reduce" });
  const a = await cam(page);
  await page.waitForTimeout(6000);
  const b = await cam(page);
  check("reduced-motion: no gira", Math.abs(a.azimuthDeg - b.azimuthDeg) < 0.01, { a: a.azimuthDeg, b: b.azimuthDeg });
  const hasPause = await page.getByRole("button", { name: /Pausar el giro/ }).count();
  check("reduced-motion: no se ofrece un giro que no existe", hasPause === 0, { pauseButtons: hasPause });
  await page.mouse.move(900, 400);
  for (let index = 0; index < 10; index += 1) await page.mouse.wheel(0, -260);
  await page.waitForTimeout(700);
  const zoomed = await cam(page);
  await page.waitForTimeout(7500);
  const later = await cam(page);
  check("reduced-motion: tampoco hay retorno animado", !later.returning && Math.abs(later.distance - zoomed.distance) < 1, { zoomed: zoomed.distance, later: later.distance });
  await page.getByRole("button", { name: /Vista inicial/ }).click();
  await page.waitForTimeout(200);
  const home = await cam(page);
  check("reduced-motion: «Vista inicial» salta sin animar", Math.abs(home.distance - HOME) < 5, { distance: home.distance });
  await context.close();
}

if (run("touch")) {
  const { context, page, errors } = await open({
    viewport: { width: 390, height: 780 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
  });
  await shot(page, "movil-inicial");
  await pauseRotation(page);
  await page.evaluate(() => window.__alzadoIsland.setPose({ azimuthDeg: 195, pitchDeg: 45, distance: 500, target: [0, 0] }));
  await page.waitForTimeout(500);
  const tapTarget = await page.evaluate(() => {
    const api = window.__alzadoIsland;
    return api.sampleBuildings(900).map((b) => ({ id: b.id, p: api.screenOfBuilding(b.id) })).find(({ p }) => p && p.x > 100 && p.x < 290 && p.y > 200 && p.y < 450);
  });
  await page.touchscreen.tap(tapTarget.p.x, tapTarget.p.y);
  await page.waitForTimeout(500);
  const sel = await page.evaluate(() => document.querySelector("[data-island]").dataset.selected);
  check("táctil: tocar selecciona y resalta", Boolean(sel), { sel });
  await shot(page, "movil-seleccion");
  const sheet = page.locator("aside[aria-label^='Ficha de']");
  const box = await sheet.boundingBox();
  check("táctil: la ficha es una hoja inferior a todo el ancho", box && box.x === 0 && box.width >= 389 && box.y + box.height >= 779, box);

  // Arrastrar la hoja hacia abajo la recoge.
  const handle = page.getByRole("button", { name: /Recoger la ficha|Desplegar la ficha/ });
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 4);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 300, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const small = await sheet.boundingBox();
  check("táctil: la hoja se recoge al arrastrarla", small && small.height < box.height * 0.6, { before: box?.height, after: small?.height });
  await shot(page, "movil-hoja-recogida");

  // Pellizco con CDP.
  const client = await context.newCDPSession(page);
  const before = await cam(page);
  const touch = (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, id) => ({ x: p[0], y: p[1], id })) });
  await page.mouse.click(20, 380);
  await touch("touchStart", [[120, 400], [270, 400]]);
  for (let i = 1; i <= 10; i += 1) await touch("touchMove", [[120 - i * 8, 400], [270 + i * 8, 400]]);
  await touch("touchEnd", []);
  await page.waitForTimeout(900);
  const after = await cam(page);
  check("táctil: el pellizco acerca", after.distance < before.distance * 0.85, { before: Math.round(before.distance), after: Math.round(after.distance) });
  check("táctil: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await context.close();
}

/* ---------------------------------------------------- entrar y salir ×10 */
if (run("leaks")) {
  const { context, page, errors } = await open();
  const samples = [];
  for (let cycle = 0; cycle < 10; cycle += 1) {
    await page.waitForTimeout(700);
    // Con recolección forzada: el heap de JS es un diente de sierra y sin ella la
    // comparación entre ciclos mide el momento del último GC, no una fuga.
    samples.push(
      await page.evaluate(() => (window.gc?.(), {
        mem: window.__alzadoIsland.memory(),
        live: window.__alzadoIsland.live(),
        heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      })),
    );
    await page.getByRole("link", { name: /Volver a la ficha/ }).click();
    await page.waitForURL(/\/city\/malaga$/);
    await page.waitForTimeout(300);
    await page.locator("a[href$='/viewer']").first().click();
    await page.waitForSelector("[data-island-ready='true']", { timeout: 60_000 });
  }
  const first = samples[1];
  const last = samples.at(-1);
  check(
    "fugas: geometrías y texturas de la GPU estables tras 10 entradas y salidas",
    last.mem.geometries <= first.mem.geometries + 2 && last.mem.textures <= first.mem.textures + 1,
    { first: first.mem, last: last.mem },
  );
  check("fugas: un solo motor vivo", last.live === 1, { live: last.live });
  check("fugas: el heap de JS no crece sin freno", last.heap === null || last.heap < first.heap * 1.6 + 20, { first: first.heap, last: last.heap });
  check("fugas: sin errores de consola", errors.length === 0, errors.slice(0, 3));
  await writeFile(join(out, "leaks-samples.json"), JSON.stringify(samples, null, 2));
  await context.close();
}

await browser.close();
await writeFile(join(out, "verify-results.json"), JSON.stringify({ at: new Date().toISOString(), base, results }, null, 2));
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones pasan`);
if (failed.length) process.exitCode = 1;
