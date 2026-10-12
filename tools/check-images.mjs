// Image check: loads every UI frame and character sprite, then autoplays matches while checking that
// every <img> and background image on the stage actually loaded. Needs the dev server running.
// Usage: node tools/check-images.mjs [url=http://localhost:5199] [matches=2]
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
const base = `${homedir()}/.cache/ms-playwright`;
const dir = readdirSync(base).find((d) => d.startsWith('chromium-'));
const url = process.argv[2] ?? 'http://localhost:5199';
const matches = Number(process.argv[3] ?? 2);
const browser = await chromium.launch({ executablePath: `${base}/${dir}/chrome-linux64/chrome` });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const failedRequests = new Set();
page.on('requestfailed', (r) => failedRequests.add(r.url()));
page.on('response', (r) => r.status() >= 400 && failedRequests.add(`${r.status()} ${r.url()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

// 1. Every file loads and decodes.
await page.goto(`${url}/`, { waitUntil: 'networkidle' });
const fileReport = await page.evaluate(async () => {
  const m = await (await fetch('/ui/manifest.json')).json();
  const mod = await import('/src/characters/index.ts');
  const urls = [
    ...Object.values(m).map((a) => `/ui/${a.file}`),
    ...mod.characters.flatMap((c) => [...Object.values(c.art), ...Object.values(c.companionArt ?? {})]),
  ];
  const bad = [];
  await Promise.all(urls.map((u) => new Promise((res) => {
    const img = new Image();
    img.onload = () => (img.naturalWidth ? res() : (bad.push(u), res()));
    img.onerror = () => (bad.push(u), res());
    img.src = u;
  })));
  return { checked: urls.length, bad };
});
console.log(`files: ${fileReport.checked} checked, ${fileReport.bad.length} broken`, fileReport.bad);

// 2. Live check during autoplayed matches.
const problems = new Map();
for (let m = 0; m < matches; m++) {
  await page.goto(`${url}/?speed=25&autoplay`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  const box = await page.locator('.stage').boundingBox();
  const z = box.width / 400;
  const click = (x, y) => page.mouse.click(box.x + x * z, box.y + y * z);
  await page.waitForTimeout(800);
  await click(260, 130);
  await page.waitForTimeout(400);
  await click(380, 180); // Auto
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    const found = await page.evaluate(() => {
      const out = [];
      for (const img of document.querySelectorAll('.stage img')) {
        const cs = getComputedStyle(img);
        if (cs.visibility === 'hidden' || cs.display === 'none' || !img.getAttribute('src')) continue;
        if (img.complete && img.naturalWidth === 0) out.push(`img ${img.getAttribute('src')} (${img.className})`);
      }
      return { out, done: !!document.querySelector('.jien-text.pressable')?.textContent?.includes('Thank') };
    });
    for (const p of found.out) problems.set(p, (problems.get(p) ?? 0) + 1);
    if (found.done) break;
    await page.waitForTimeout(100);
  }
  console.log(`match ${m + 1} finished`);
}
console.log(`live: ${problems.size} broken images seen`, [...problems.keys()]);
console.log(`failed requests: ${failedRequests.size}`, [...failedRequests]);
await browser.close();
