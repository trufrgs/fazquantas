// Screenshot helper for visual review: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [actions-json]
import { chromium } from '@playwright/test';

const [url, out, w = '390', h = '844', wait = '800', actions = '[]'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 2,
  hasTouch: Number(w) < 900,
});
if (process.env.SETTINGS) {
  const state = JSON.parse(process.env.SETTINGS);
  await page.addInitScript((value) => {
    window.localStorage.setItem('fodinha:ajustes', JSON.stringify({ state: value, version: 1 }));
  }, state);
}
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
await page.goto(url, { waitUntil: 'networkidle' });
for (const a of JSON.parse(actions)) {
  if (a.click) await page.click(a.click, { timeout: 10_000 });
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.eval) await page.evaluate(a.eval);
  if (a.waitFor) await page.waitForSelector(a.waitFor, { timeout: a.timeout ?? 30_000 });
  if (a.clickFirstEnabled) {
    await page.waitForSelector(`${a.clickFirstEnabled}:not([disabled])`, { timeout: a.timeout ?? 30_000 });
    await page.locator(`${a.clickFirstEnabled}:not([disabled])`).first().click();
  }
}
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out, fullPage: false });
await browser.close();
if (errors.length) console.log(errors.join('\n'));
console.log('saved', out);
