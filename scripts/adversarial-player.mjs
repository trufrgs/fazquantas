// Jogador adversarial: joga partidas locais pela interface em vários tamanhos de tela, gira o
// celular, recarrega, abre a caderneta no meio da jogada, aperta teclas a esmo e mede a cada passo
// se alguma carta ficou fora da tela, encavalada, atrás do painel de palpite ou cobrindo o rosto
// de alguém. Sai com código 1 se achar problema ou erro de página.
//
// Uso (com `pnpm dev` rodando): node scripts/adversarial-player.mjs [pasta-das-capturas] [url] [telas]
// `telas` filtra pelos nomes da lista abaixo, separados por vírgula (ex.: desktop,tablet).
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? join(tmpdir(), 'fodinha-adversario');
const BASE = process.argv[3] ?? 'http://localhost:5173';
mkdirSync(OUT, { recursive: true });
const CONFIGS = [
  { name: 'desktop', w: 1436, h: 809, players: 6, touch: false },
  { name: 'deitado', w: 844, h: 390, players: 8, touch: true },
  { name: 'pequeno', w: 360, h: 640, players: 8, touch: true },
  { name: 'tablet', w: 768, h: 1024, players: 5, touch: true },
  { name: 'celular', w: 390, h: 844, players: 3, touch: true, rotate: true },
  { name: 'dois', w: 390, h: 844, players: 2, touch: true, lives: 12 },
];

const rnd = (n) => Math.floor(Math.random() * n);
const problems = [];

async function inspect(page, cfg, step) {
  const r = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const box = (el) => {
      const b = el.getBoundingClientRect();
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height };
    };
    const hit = (a, b, slack = 3) => a.l < b.r - slack && b.l < a.r - slack && a.t < b.b - slack && b.t < a.b - slack;
    const issues = [];
    const reveals = [...document.querySelectorAll('[role="group"][aria-label^="Carta de"], [role="group"][aria-label^="Cartas de"]')].map((el) => ({ label: el.getAttribute('aria-label'), ...box(el) }));
    const faces = [...document.querySelectorAll('[role="group"]')]
      .filter((el) => !/^(Cartas? de|Tuas cartas)/.test(el.getAttribute('aria-label') ?? '') && el.querySelector('img'))
      .map((el) => ({ label: el.getAttribute('aria-label'), ...box(el.querySelector('img').parentElement) }));
    const panel = document.querySelector('section[aria-label="Teu palpite"]');
    const pb = panel ? box(panel) : null;
    reveals.forEach((a, i) => {
      if (a.l < -2 || a.r > vw + 2 || a.t < -2 || a.b > vh + 2) issues.push(`carta à mostra fora da tela: ${a.label}`);
      reveals.forEach((b, j) => j > i && hit(a, b) && issues.push(`cartas à mostra encavaladas: ${a.label} × ${b.label}`));
      faces.forEach((f) => hit(a, f) && issues.push(`carta à mostra cobre o rosto de ${f.label}: ${a.label}`));
      if (pb && hit(a, pb, 6)) issues.push(`carta à mostra atrás do painel: ${a.label}`);
    });
    if (pb && (pb.l < -1 || pb.r > vw + 1 || pb.t < -1 || pb.b > vh + 1)) issues.push('painel de palpite fora da tela');
    if (pb) faces.forEach((f) => hit(pb, f, 8) && issues.push(`painel cobre o rosto de ${f.label}`));
    const handEls = [...document.querySelectorAll('[aria-label="Tuas cartas"] button')];
    const hand = handEls.map(box);
    hand.forEach((c, i) => (c.l < -2 || c.r > vw + 2) && issues.push(`carta ${i + 1} da mão fora da tela (${Math.round(c.l)}–${Math.round(c.r)})`));
    const tiny = handEls.map((el) => ({ w: el.offsetWidth })).filter((c) => c.w < 44);
    if (tiny.length) issues.push(`cartas da mão estreitas demais: ${Math.round(tiny[0].w)}px`);
    const bidButtons = panel ? [...panel.querySelectorAll('button')].map(box) : [];
    bidButtons.forEach((b) => (b.h < 36 || b.w < 32) && issues.push(`botão de palpite pequeno: ${Math.round(b.w)}×${Math.round(b.h)}`));
    return { issues, reveals: reveals.length, revealW: reveals[0]?.w ?? 0 };
  });
  for (const i of r.issues) problems.push(`[${cfg.name} ${cfg.w}x${cfg.h}] passo ${step}: ${i}`);
  return r;
}

async function play(cfg) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: cfg.w, height: cfg.h }, deviceScaleFactor: 1, hasTouch: cfg.touch });
  await ctx.addInitScript((v) => {
    if (!localStorage.getItem('fodinha:ajustes')) localStorage.setItem('fodinha:ajustes', JSON.stringify({ state: v, version: 1 }));
  }, {
    name: 'Tester', avatar: 'tester', sound: false, haptics: false, speed: 'turbo', players: cfg.players, difficulty: 'medio',
    seenTips: ['palpite', 'jogar', 'cega', 'pe'],
    rules: { hierarchy: 'gaucha', startingLives: cfg.lives ?? 3, penalty: 'difference', tieRule: 'cancel', blindRound: 'all', dealerRestriction: true, dealerRestrictionInBlind: false, progression: 'up', restartOnElimination: true, maxCards: null },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Jogar agora' }).click();
  let shots = 0;
  let maxReveal = 0;
  let rotated = false;
  const deadline = Date.now() + 150_000;
  for (let step = 0; Date.now() < deadline; step++) {
    const over = page.getByRole('dialog', { name: 'Fim de jogo' });
    if (await over.isVisible().catch(() => false)) {
      await page.screenshot({ path: `${OUT}/${cfg.name}-fim.png` });
      break;
    }
    const r = await inspect(page, cfg, step);
    if (r.reveals > 0) {
      maxReveal = Math.max(maxReveal, r.revealW);
      if (shots < 2) await page.screenshot({ path: `${OUT}/${cfg.name}-cega-${shots++}.png` });
    }
    // Adversário: gira a tela, recarrega, abre folhas e aperta teclas no meio da jogada.
    const roll = rnd(100);
    if (cfg.rotate && !rotated && step > 25) {
      await page.setViewportSize({ width: cfg.h, height: cfg.w });
      rotated = true;
      cfg = { ...cfg, w: cfg.h, h: cfg.w };
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/${cfg.name}-girou.png` });
      continue;
    }
    if (roll < 3) {
      await page.reload({ waitUntil: 'networkidle' });
      const cont = page.getByRole('button', { name: /Continuar partida/ });
      if (await cont.isVisible().catch(() => false)) await cont.click();
      continue;
    }
    if (roll < 6) {
      await page.getByRole('button', { name: 'Caderneta' }).click({ timeout: 1500 }).catch(() => undefined);
      await page.waitForTimeout(200);
      await inspect(page, cfg, step);
      await page.keyboard.press('Escape');
      continue;
    }
    if (roll < 8) {
      await page.keyboard.press(String(rnd(10)));
      continue;
    }
    const bids = page.locator('section[aria-label="Teu palpite"] button:not([disabled])');
    const nb = await bids.count().catch(() => 0);
    if (nb > 0) {
      await bids.nth(rnd(nb)).click({ timeout: 1500 }).catch(() => undefined);
      continue;
    }
    const cards = page.locator('[aria-label="Tuas cartas"] button:not([disabled])');
    const nc = await cards.count().catch(() => 0);
    if (nc > 0) {
      const c = cards.nth(rnd(nc));
      await c.click({ timeout: 1500 }).catch(() => undefined);
      await c.click({ timeout: 1500 }).catch(() => undefined);
      continue;
    }
    const cont = page.getByRole('button', { name: 'Continuar', exact: true });
    if (await cont.isVisible().catch(() => false)) await cont.click({ timeout: 1500 }).catch(() => undefined);
    await page.waitForTimeout(120);
  }
  await browser.close();
  return { errors, maxReveal };
}

const only = process.argv[4]?.split(',');
let failed = false;
for (const cfg of CONFIGS.filter((c) => !only || only.includes(c.name))) {
  const { errors, maxReveal } = await play(cfg);
  if (errors.length) failed = true;
  console.log(`${cfg.name} ${cfg.w}x${cfg.h} ${cfg.players}p: cartas à mostra até ${Math.round(maxReveal)}px, erros: ${errors.length}`);
  for (const e of errors.slice(0, 5)) console.log('   ', e);
}
const unique = [...new Set(problems.map((p) => p.replace(/passo \d+: /, '')))];
console.log(`\n${problems.length} ocorrências, ${unique.length} tipos:`);
for (const p of unique.slice(0, 60)) console.log(' -', p);
console.log(`Capturas em ${OUT}`);
process.exit(failed || problems.length > 0 ? 1 : 0);
