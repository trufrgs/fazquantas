// Exploratório 14: a zoeira com câmera (04/10/2026). Ana e Beto de câmera e microfone de mentira (o
// Chromium mostra um quadro verde), um palito cada, sem bot: a primeira rodada (às cegas) decide.
// c1: na mão que decide, o corte de novela abre o vídeo de quem está por um fio (não o avatar);
// c2: quem saiu de câmera aberta ganha a foto do vexame no resumo e no fim de jogo;
// c3: as máscaras e a voz do além não quebram nada (sem erro na tela);
// c4: durante o corte, a faixa do status não conta quem levou a mão.
import { closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame } from './lib.mjs';

async function ate(cond, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return Date.now() - t0;
    await sleep(150);
  }
  return null;
}
async function abrirCamera(d) {
  const direto = d.page.getByRole('button', { name: 'Abrir a câmera' }).first();
  if (await direto.isVisible().catch(() => false)) return direto.click();
  await d.page.getByRole('button', { name: /^Microfone e câmera/ }).click();
  await d.page.getByRole('switch', { name: /Câmera/ }).click();
  await d.page.keyboard.press('Escape').catch(() => {});
}

const ana = await device('Ana', { microfone: true, dev: 'iPhone 15', settings: { speed: 'normal' } });
const beto = await device('Beto', { microfone: true, dev: 'Pixel 7', settings: { speed: 'normal' } });
const code = await createRoom(ana.page);
await joinByLink(beto.page, code);
await ana.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 15000 });
await ana.page.getByRole('button', { name: 'Diminuir palitos' }).click().catch(() => {});
await ana.page.getByRole('button', { name: 'Diminuir palitos' }).click().catch(() => {});
await abrirCamera(ana);
await abrirCamera(beto);
await ate(async () => (await ana.page.locator('video').count()) >= 2, 15000);
await startGame(ana.page);
await ana.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 20000 });
await sleep(1200);
for (const d of [ana, beto]) await d.page.getByRole('button', { name: 'Entendi' }).click({ timeout: 1500 }).catch(() => {});

// Cada um canta 1 e joga (rodada às cegas: a carta é forçada).
let corte = null;
let fotos = 0;
const t0 = Date.now();
while (Date.now() - t0 < 90000) {
  for (const d of [ana, beto]) {
    const bid = d.page.locator('section[aria-label="Teu palpite"] button[aria-label^="Palpite"]:not([disabled])').last();
    if (await bid.isVisible().catch(() => false)) await bid.click({ timeout: 1000 }).catch(() => {});
    const card = d.page.locator('[aria-label="Tuas cartas"] button:not([disabled])').first();
    if (await card.isVisible().catch(() => false)) {
      await card.click({ timeout: 1000 }).catch(() => {});
      await card.click({ timeout: 1000 }).catch(() => {});
    }
  }
  if (!corte) {
    const status = ana.page.getByRole('status', { name: /^A mão que decide/ });
    if (await status.isVisible().catch(() => false)) {
      corte = {
        videos: await status.locator('video').count(),
        nome: await status.getAttribute('aria-label'),
        faixa: (await ana.page.locator('span[aria-live="polite"]').last().textContent().catch(() => '')) ?? '',
      };
      await ana.shot('c1-corte');
    }
  }
  fotos = Math.max(fotos, await ana.page.locator('img[alt^="A cara de"]').count());
  if (fotos > 0) await ana.shot('c2-foto-resumo');
  if (await ana.page.getByRole('dialog', { name: 'Fim de jogo' }).isVisible().catch(() => false)) break;
  await sleep(120);
}
if (!corte) flag('c1', 'o corte de novela não apareceu na mão que decide');
else if (corte.videos === 0) flag('c1', `o corte apareceu sem o vídeo (${corte.nome})`);
else log('c1', `corte com ${corte.videos} vídeo(s): ${corte.nome}`);
if (corte && /fez a mão|Empardou/.test(corte.faixa)) flag('c4', `a faixa contou o resultado durante o corte: "${corte.faixa}"`);
else if (corte) log('c4', `faixa durante o corte: "${corte.faixa}"`);

await sleep(1500);
const fimFotos = await ana.page.locator('[aria-label="A foto do vexame e o lance da noite"] img').count();
await ana.shot('c2-fim');
if (fotos === 0 && fimFotos === 0) flag('c2', 'sem foto do vexame de quem saiu de câmera aberta');
else log('c2', `foto do vexame: ${fotos} no resumo, ${fimFotos} no fim de jogo`);

for (const d of [ana, beto]) {
  const erros = d.errors.filter((e) => !/net::|WebSocket|vibrate|401|429|Failed to load resource/.test(e));
  if (erros.length) flag('c3', `${d.label}: ${erros.slice(0, 3).join(' | ')}`);
  else log('c3', `${d.label}: sem erro na tela`);
}
await closeAll();
report();
