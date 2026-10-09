import { step, fail, log } from "./lib/log.mjs";

/**
 * Orquestador del pipeline.
 *
 *   pnpm pipeline            todos los pasos, en orden
 *   node run.mjs osm        solo un paso (para reanudar sin repetir descargas)
 *
 * Los datos crudos quedan en data-pipeline/raw y los artefactos en
 * data-pipeline/build. Ninguno de los dos se versiona: se regeneran.
 */
const STEPS = {
  osm: () => import("./steps/01-osm.mjs"),
  catastro: () => import("./steps/02-catastro.mjs"),
  layers: () => import("./steps/03-layers.mjs"),
  trees: () => import("./steps/03b-trees.mjs"),
  surface: () => import("./steps/03c-surface.mjs"),
  fortress: () => import("./steps/03d-fortress.mjs"),
  berths: () => import("./steps/03e-berths.mjs"),
  parcels: () => import("./steps/03f-parcels.mjs"),
  units: () => import("./steps/03g-units.mjs"),
  tiles: () => import("./steps/04-tiles.mjs"),
  verify: () => import("./steps/05-verify.mjs"),
  publish: () => import("./steps/06-publish.mjs"),
};

// `publish` va último a propósito: decide con la evidencia que han dejado los
// pasos anteriores, y el rendimiento se mide a mano sobre el build de
// producción (ver docs/performance.md) porque necesita un navegador.
const ORDER = ["osm", "catastro", "layers", "trees", "surface", "fortress", "berths", "parcels", "units", "tiles", "verify", "publish"];

async function main() {
  const argument = process.argv[2] ?? "all";
  const queue = argument === "all" ? ORDER : [argument];

  for (const name of queue) {
    const loader = STEPS[name];
    if (!loader) {
      fail(new Error(`Paso desconocido: ${name}. Opciones: all, ${ORDER.join(", ")}`));
      process.exitCode = 1;
      return;
    }
    const module = await loader();
    await module.run();
  }

  step("Pipeline terminado");
}

main().catch((error) => {
  fail(error);
  process.exitCode = 1;
});
