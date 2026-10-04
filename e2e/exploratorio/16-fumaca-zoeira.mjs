// Exploratório 16: a fumaça e a zoeira de quem espera (04/10/2026). O Beto demora na vez dele:
// f1: a Ana abana com o dedo (arrasto rápido) e a fumaça abre por um instante, só na tela dela;
// f2: a Ana sopra a baforada na cara do Beto pelo menu do amigo (só aparece para quem está na vez);
// f3: a Ana cutuca o Beto (o cutucão e a baforada têm descansos separados).
import { closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame } from './lib.mjs';

async function ate(cond, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return Date.now() - t0;
    await sleep(150);
  }
  return null;
}

const ana = await device('Ana', { dev: 'iPhone 15', settings: { speed: 'normal' } });
const beto = await device('Beto', { dev: 'Pixel 7', settings: { speed: 'normal' } });
const code = await createRoom(ana.page);
await joinByLink(beto.page, code);
await ana.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 15000 });
await startGame(ana.page);
await ana.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 20000 });
await sleep(1200);
for (const d of [ana, beto]) await d.page.getByRole('button', { name: 'Entendi' }).click({ timeout: 1500 }).catch(() => {});
// Se a vez for da Ana, ela canta; daí é a vez do Beto, que não faz nada.
for (let i = 0; i < 30; i++) {
  if (await beto.page.locator('section[aria-label="Teu palpite"]').isVisible().catch(() => false)) break;
  const bid = ana.page.locator('section[aria-label="Teu palpite"] button[aria-label^="Palpite"]:not([disabled])').first();
  if (await bid.isVisible().catch(() => false)) await bid.click().catch(() => {});
  await sleep(300);
}
const temFumaca = await ate(() => ana.page.locator('[data-abano]').first().isVisible().catch(() => false), 15000);
if (temFumaca === null) flag('f1', 'a fumaça não apareceu depois da demora');
else {
  await sleep(6000);
  await ana.shot('f1-antes');
  const box = (await ana.page.locator('[data-abano]').first().boundingBox()) ?? { x: 50, y: 300, width: 300, height: 300 };
  const y = box.y + box.height * 0.5;
  await ana.page.mouse.move(box.x + 30, y);
  await ana.page.mouse.down();
  for (let i = 1; i <= 6; i++) await ana.page.mouse.move(box.x + 30 + i * 40, y + (i % 2) * 10, { steps: 1 });
  await ana.page.mouse.up();
  await sleep(450);
  const abano = await ana.page.locator('[data-abano]').first().getAttribute('data-abano');
  const opacidade = await ana.page.locator('[data-abano]').first().evaluate((el) => Number(getComputedStyle(el).opacity));
  await ana.shot('f1-abanou');
  if (abano === '0' || opacidade > 0.6) flag('f1', `o abano não abriu a fumaça (abano=${abano}, opacidade=${opacidade.toFixed(2)})`);
  else log('f1', `abanou: a fumaça abriu (opacidade ${opacidade.toFixed(2)})`);
  const doBeto = await beto.page.locator('[data-abano]').first().getAttribute('data-abano').catch(() => null);
  if (doBeto && doBeto !== '0') flag('f1', 'o abano da Ana mexeu na fumaça do Beto');
}

// f2
await ana.page.getByRole('button', { name: 'Zoar Beto' }).click();
const menu = ana.page.getByRole('dialog', { name: 'Zoar Beto' });
await menu.waitFor({ timeout: 3000 });
const baforada = menu.getByRole('button', { name: 'Baforada' });
if (!(await baforada.isVisible().catch(() => false))) flag('f2', 'sem o botão da baforada no menu de quem está na vez');
else {
  await baforada.click();
  const t = await ate(async () => (await beto.page.locator('svg path[d^="M20 48 C8 44"]').count()) > 0, 4000);
  if (t === null) flag('f2', 'a baforada não chegou na cara do Beto');
  else log('f2', `baforada na cara do Beto em ${t} ms`);
  await beto.shot('f2-baforada');
}
// f3
await ana.page.getByRole('button', { name: 'Zoar Beto' }).click();
await menu.waitFor({ timeout: 3000 });
const cutucar = menu.getByRole('button', { name: 'Cutucar' });
if (!(await cutucar.isVisible().catch(() => false))) flag('f3', 'sem o cutucão no menu');
else {
  await cutucar.click();
  await sleep(300);
  const recado = await menu.getByRole('alert').textContent().catch(() => null);
  if (recado) flag('f3', `o cutucão foi barrado logo depois da baforada: "${recado}"`);
  else log('f3', 'cutucão passou depois da baforada (descansos separados)');
}

const erros = [...ana.errors, ...beto.errors].filter((e) => !/net::|WebSocket|vibrate/.test(e));
if (erros.length) flag('erros', erros.slice(0, 3).join(' | '));
await closeAll();
report();
