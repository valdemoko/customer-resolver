/**
 * Mide el catálogo (`/`) sobre un build de producción: LCP, CLS, TTFB, peso del
 * JavaScript y peticiones a terceros. Dos lecturas: caché vacía y recarga.
 *
 *   node tools/measure-catalog.mjs --url http://localhost:3210
 */
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const base = args.includes("--url") ? args[args.indexOf("--url") + 1] : "http://localhost:3210";

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=d3d11"],
});

async function read(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        let lcp = 0;
        let cls = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) lcp = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => {
          const nav = performance.getEntriesByType("navigation")[0];
          const resources = performance.getEntriesByType("resource");
          const scripts = resources.filter((r) => /\.js(\?|$)/.test(r.name));
          resolve({
            lcpMs: Math.round(lcp),
            cls: Math.round(cls * 1000) / 1000,
            ttfbMs: Math.round(nav.responseStart),
            htmlBytes: nav.encodedBodySize,
            initialJsBytes: scripts.reduce((s, r) => s + r.encodedBodySize, 0),
            initialJsTransferBytes: scripts.reduce((s, r) => s + r.transferSize, 0),
            initialJsFiles: scripts.length,
            requests: resources.length + 1,
            thirdPartyRequests: resources.filter((r) => !r.name.startsWith(location.origin)).length,
          });
        }, 2500);
      }),
  );
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
await page.goto(`${base}/`, { waitUntil: "load" });
const first = await read(page);
await page.reload({ waitUntil: "load" });
const second = await read(page);
console.log(JSON.stringify({ browser: `Chrome ${browser.version()}`, first, second }, null, 2));
await browser.close();
