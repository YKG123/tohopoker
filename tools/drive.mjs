// Scripted play-through for visual checks.
// node tools/drive.mjs <url> <outdir> '<steps json>'   steps: {"click":[x,y]} (stage coords) | {"wait":ms} | {"shot":"name"} | {"eval":"js"}
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
const base = `${homedir()}/.cache/ms-playwright`;
const dir = readdirSync(base).find((d) => d.startsWith('chromium-'));
const [url, outdir, stepsJson] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: `${base}/${dir}/chrome-linux64/chrome` });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('console', (m) => m.type() !== 'debug' && console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'networkidle' });
for (const step of JSON.parse(stepsJson)) {
  if (step.wait) await page.waitForTimeout(step.wait);
  if (step.click) {
    const box = await page.locator('.stage').boundingBox();
    const zoom = box.width / 400;
    await page.mouse.click(box.x + step.click[0] * zoom, box.y + step.click[1] * zoom);
  }
  if (step.eval) console.log(await page.evaluate(step.eval));
  if (step.shot) await page.screenshot({ path: `${outdir}/${step.shot}.png` });
}
await browser.close();
