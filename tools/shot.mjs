// Screenshot a page: node tools/shot.mjs <url> <out.png> [width] [height] [script-to-eval]
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { homedir } from 'node:os';
const base = `${homedir()}/.cache/ms-playwright`;
const dir = readdirSync(base).find((d) => d.startsWith('chromium-'));
const [url, out, w = '1200', h = '900', script] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: `${base}/${dir}/chrome-linux64/chrome` });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'networkidle' });
if (script) await page.evaluate(script);
await page.waitForTimeout(+(process.env.WAIT ?? 500));
await page.screenshot({ path: out, fullPage: true });
console.log(logs.join('\n'));
await browser.close();
