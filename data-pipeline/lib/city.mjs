import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PIPELINE_DIR = join(HERE, "..");
export const REPO_DIR = join(PIPELINE_DIR, "..");
export const RAW_DIR = join(PIPELINE_DIR, "raw");
export const BUILD_DIR = join(PIPELINE_DIR, "build");
export const TILES_DIR = join(REPO_DIR, "public", "tiles");

/**
 * El área de la ciudad vive en un único archivo JSON que leen tanto el pipeline
 * como la aplicación (`src/data/cities/<slug>.geo.json`). Si cada uno tuviera su
 * copia, acabarían discrepando y el visor pediría teselas que no existen.
 */
export async function loadCity(slug = "malaga") {
  const path = join(REPO_DIR, "src", "data", "cities", `${slug}.geo.json`);
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  return { ...parsed, geoFile: path };
}

/** Lee un artefacto ya generado por un paso anterior. */
export async function readRaw(name) {
  return JSON.parse(await readFile(join(RAW_DIR, name), "utf8"));
}

export async function readBuild(name) {
  return JSON.parse(await readFile(join(BUILD_DIR, name), "utf8"));
}
