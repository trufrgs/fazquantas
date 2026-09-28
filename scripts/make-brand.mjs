// Gera todas as peças da marca a partir de brand/marca.html (fonte única): ícones do PWA e do
// favicon, ícones e aberturas nativas (Android e iOS), logotipo, arte da Play Store e prévia de
// link. Usa o Chromium do Playwright, com as fontes do projeto.
//
// Uso: node scripts/make-brand.mjs
import { mkdirSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps/web');
const RES = join(WEB, 'android/app/src/main/res');
const XC = join(WEB, 'ios/App/App/Assets.xcassets');
const PAGE = 'file://' + join(ROOT, 'brand/marca.html');

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });

/** Fotografa uma peça. `transparente` mantém o alfa (camadas e símbolo). */
async function shot(params, w, h, out, { transparente = false, redondo = false } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.goto(`${PAGE}?${new URLSearchParams(params)}`);
  await page.waitForSelector('body[data-pronto]');
  if (redondo) await page.addStyleTag({ content: '.peca{border-radius:50%}' });
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: h }, omitBackground: transparente || redondo });
  await page.close();
}

const sq = (peca, tam, out, extra = {}, opts = {}) => shot({ peca, tam: String(tam), ...extra }, tam, tam, out, opts);

// Web / PWA
const ICONS = join(WEB, 'public/icons');
await sq('icone', 512, join(ICONS, 'icon-512.png'));
await sq('icone', 192, join(ICONS, 'icon-192.png'));
await sq('icone', 180, join(ICONS, 'apple-touch-icon.png'));
await sq('icone', 64, join(ICONS, 'favicon-64.png'));
await sq('icone', 32, join(ICONS, 'favicon-32.png'));
// Maskable: o sistema recorta um círculo de 80%; o símbolo encolhe para caber.
await shot({ peca: 'maskable', tam: '512' }, 512, 512, join(ICONS, 'icon-maskable-512.png'));

// Android: ícone clássico, redondo e adaptativo (fundo + frente + monocromático do Android 13).
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENS)) {
  const dir = join(RES, `mipmap-${d}`);
  if (!existsSync(dir)) continue;
  await sq('legado', Math.round(48 * k), join(dir, 'ic_launcher.png'), {}, { transparente: true });
  await sq('icone', Math.round(48 * k), join(dir, 'ic_launcher_round.png'), {}, { redondo: true });
  const fg = Math.round(108 * k);
  await sq('simbolo', fg, join(dir, 'ic_launcher_foreground.png'), { escala: '0.6' }, { transparente: true });
  await sq('fundo', fg, join(dir, 'ic_launcher_background.png'));
  await sq('simbolo', fg, join(dir, 'ic_launcher_monochrome.png'), { escala: '0.6', cor: 'mono' }, { transparente: true });
}
const ADAPTIVE = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
writeFileSync(join(RES, 'mipmap-anydpi-v26/ic_launcher.xml'), ADAPTIVE);
writeFileSync(join(RES, 'mipmap-anydpi-v26/ic_launcher_round.xml'), ADAPTIVE);
writeFileSync(
  join(RES, 'values/ic_launcher_background.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#B3302A</color>\n</resources>\n',
);
// Aberturas do Android (retrato e paisagem, em cada densidade) e do iOS.
const { imageSize } = await import('./lib/png-size.mjs');
for (const dir of readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
  const f = join(RES, dir, 'splash.png');
  if (!existsSync(f)) continue;
  const { width, height } = imageSize(f);
  await shot({ peca: 'splash', w: String(width), h: String(height) }, width, height, f);
}
await sq('icone', 1024, join(XC, 'AppIcon.appiconset/AppIcon-512@2x.png'));
for (const n of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await shot({ peca: 'splash', w: '2732', h: '2732' }, 2732, 2732, join(XC, 'Splash.imageset', n));
}

// Peças de divulgação.
const OUT = join(ROOT, 'brand/pecas');
await sq('icone', 1024, join(OUT, 'icone-1024.png'));
await sq('icone', 512, join(OUT, 'icone-loja-512.png'));
await shot({ peca: 'destaque' }, 1024, 500, join(OUT, 'destaque-play-1024x500.png'));
await shot({ peca: 'og' }, 1200, 630, join(OUT, 'previa-link-1200x630.png'));
await shot({ peca: 'og' }, 1200, 630, join(WEB, 'public/og.png'));
for (const tema of ['claro', 'escuro']) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: 2 });
  await page.goto(`${PAGE}?peca=logo&tema=${tema}&px=120`);
  await page.waitForSelector('body[data-pronto]');
  await page.locator('.peca').screenshot({ path: join(OUT, `logo-${tema}.png`), omitBackground: tema === 'claro' });
  await page.close();
}
const board = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
await board.goto(PAGE);
await board.waitForSelector('body[data-pronto]');
await board.screenshot({ path: join(OUT, 'quadro.png'), fullPage: true });
await board.close();

await browser.close();
console.log('marca ok');
