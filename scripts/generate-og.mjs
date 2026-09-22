/**
 * Generates public/og.png (1200×630) — the Open Graph / Twitter card image.
 *
 * Run with:  node scripts/generate-og.mjs
 *
 * Why a script: the card must use the site's real fonts and colors, and PNG is
 * a binary asset. Chromium renders it deterministically, so the image can be
 * regenerated whenever the brand copy changes instead of being edited by hand.
 */
import { chromium } from "@playwright/test";

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: #1a1a18; color: #ffffff;
    font-family: "Inter", Arial, sans-serif;
    position: relative;
  }
  .grid {
    position: absolute; inset: 0; opacity: 0.05;
    background-image:
      linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px);
    background-size: 80px 80px;
  }
  .frame {
    position: relative; height: 100%;
    padding: 64px 72px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand span {
    font-size: 26px; font-weight: 600; letter-spacing: -0.01em;
  }
  h1 {
    font-family: "Instrument Serif", Georgia, serif;
    font-weight: 400; font-size: 88px; line-height: 1.08;
    letter-spacing: -0.02em;
  }
  h1 em { font-style: normal; color: #2dd4bf; }
  .label {
    font-size: 17px; font-weight: 600; letter-spacing: 0.14em;
    text-transform: uppercase; color: #2dd4bf; margin-bottom: 22px;
  }
  .foot {
    display: flex; align-items: flex-end; justify-content: space-between;
    color: #b9b4ac; font-size: 22px;
  }
  .foot .sub { font-size: 20px; line-height: 1.5; max-width: 640px; color: #cfcac2; }
  .foot .domain { font-weight: 500; color: #ffffff; }
</style>
</head>
<body>
  <div class="grid"></div>
  <div class="frame">
    <div class="brand">
      <svg width="44" height="44" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="7" fill="#2dd4bf" />
        <path d="M10 16h12M22 16l-4-4M22 16l-4 4M10 16l4-4M10 16l4 4"
              stroke="#1a1a18" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Resolveo</span>
    </div>
    <div>
      <div class="label">Análisis de problemas de consumo</div>
      <h1>Entiende tu problema.<br /><em>Resuélvelo.</em></h1>
    </div>
    <div class="foot">
      <div class="sub">Fuentes verificables · Normativa vigente · Pasos concretos</div>
      <div class="domain">resolveo.site</div>
    </div>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(async () => {
  await document.fonts.ready;
});
await page.screenshot({ path: "public/og.png", animations: "disabled" });
await browser.close();
console.log("public/og.png written (1200×630)");
