/**
 * Genera los iconos PNG de la web a partir de public/brand/resolveo-mark.svg
 * (favicon 32 px, icono táctil de Apple 180 px e icono de aplicación 512 px).
 *   node tools/build-icons.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const svg = await readFile("public/brand/resolveo-mark.svg", "utf8");
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
await mkdir("public/brand", { recursive: true });
for (const [name, size, background] of [
  ["icon-32.png", 32, "transparent"],
  ["apple-touch-icon.png", 180, "#0f1828"],
  ["icon-512.png", 512, "transparent"],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:${background}}svg{display:block;width:${size}px;height:${size}px}</style>${svg.replace(/width="256" height="256"/, "")}`);
  await writeFile(`public/brand/${name}`, await page.screenshot({ omitBackground: background === "transparent" }));
  await page.close();
}
await browser.close();
console.log("iconos generados");
