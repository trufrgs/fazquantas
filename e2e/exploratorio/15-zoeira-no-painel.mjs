// Exploratório 15: a Ana despeja zoeira no Beto (iPhone SE) enquanto ele canta: tomate, o golpe da vó, carimbos com efeito; o painel de cantar dele segue usável.
import { closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame } from './lib.mjs';
const ana = await device('Ana', { dev: 'iPhone 15', settings: { speed: 'normal', avatar: 'g-vo-do-chinelo', frasesFavoritas: ['chorao', 'chinelao', 'guloso'] } });
const beto = await device('Beto', { dev: 'iPhone SE', settings: { speed: 'normal' } });
const code = await createRoom(ana.page);
await joinByLink(beto.page, code);
await ana.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 15000 });
await startGame(ana.page);
await ana.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 20000 });
await sleep(1200);
for (const d of [ana, beto]) await d.page.getByRole('button', { name: 'Entendi' }).click({ timeout: 1500 }).catch(() => {});
// Espera a vez do Beto cantar (a Ana canta se for a dela).
for (let i = 0; i < 40; i++) {
  if (await beto.page.locator('section[aria-label="Teu palpite"]').isVisible().catch(() => false)) break;
  const bid = ana.page.locator('section[aria-label="Teu palpite"] button[aria-label^="Palpite"]:not([disabled])').first();
  if (await bid.isVisible().catch(() => false)) await bid.click().catch(() => {});
  await sleep(300);
}
const zoar = async (rotulo) => {
  await ana.page.getByRole('button', { name: 'Zoar Beto' }).click({ timeout: 2000 }).catch(() => {});
  const m = ana.page.getByRole('dialog', { name: 'Zoar Beto' });
  await m.getByRole('button', { name: rotulo }).first().click({ timeout: 2000 }).catch(() => {});
  await ana.page.keyboard.press('Escape').catch(() => {});
};
const t0 = Date.now();
await zoar(/^Atirar tomate/);
await zoar(/^O golpe do teu/);
await zoar(/^Carimbar "Chorão/);
await zoar(/^Atirar ovo/);
await zoar(/^Carimbar "Guloso/);
await zoar(/^Atirar bergamota/);
log('s1', `zoeira despejada em ${Date.now() - t0} ms`);
await sleep(400);
await beto.shot('spam-beto');
const botao = beto.page.locator('section[aria-label="Teu palpite"] button[aria-label^="Palpite"]:not([disabled])').first();
const ok = await botao.click({ timeout: 3000, trial: true }).then(() => true).catch(() => false);
if (!ok) flag('s1', 'o painel de cantar do Beto ficou coberto pela zoeira');
else log('s1', 'o painel de cantar do Beto segue clicável no meio da zoeira');
const erros = [...ana.errors, ...beto.errors].filter((e) => !/net::|WebSocket|vibrate/.test(e));
if (erros.length) flag('erros', erros.slice(0, 3).join(' | '));
await closeAll();
report();
