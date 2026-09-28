// Revisão visual: cada cena de desenvolvimento (`?cena=`) em cada tamanho de tela.
//
// Uso (com `pnpm dev` rodando):
//   node scripts/scene-shots.mjs <pasta> 390x844,844x390,1436x809 cega,palpite,mao [ajustes-json]
// Um caminho começando com "/" no lugar da cena abre aquela página (ex.: "/" é o início).
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
const [outDir, sizesArg, scenesArg, extra = '{}'] = process.argv.slice(2);
if (!outDir || !sizesArg || !scenesArg) {
  console.error('uso: node scripts/scene-shots.mjs <pasta> <LxA,...> <cena,...> [ajustes-json]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const sizes = sizesArg.split(',').map((s) => s.split('x').map(Number));
const scenes = scenesArg.split(',');
const settings = { seenTips: ['palpite', 'jogar', 'cega', 'pe'], name: 'Thomas', sound: false, ...JSON.parse(extra) };
const browser = await chromium.launch();
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 900 });
  await ctx.addInitScript((v) => localStorage.setItem('fodinha:ajustes', JSON.stringify({ state: v, version: 1 })), settings);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const scene of scenes) {
    const url = scene.startsWith('/') ? `http://localhost:5173${scene}` : `http://localhost:5173/?cena=${scene}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    const name = scene.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'home';
    await page.screenshot({ path: `${outDir}/${w}x${h}-${name}.png` });
  }
  if (errors.length) console.log(`${w}x${h} errors:`, errors.join(' | '));
  await ctx.close();
}
await browser.close();
console.log('ok');
