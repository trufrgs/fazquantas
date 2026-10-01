// Exploratório 10: a fumaça da demora, o carimbo de quem saiu e o alto da sala (01/10/2026). Três
// pessoas de câmera aberta (a de mentira do Chromium), em três celulares:
// f1: ninguém joga por 50 s: a fumaça enche a mesa, e depois passa por cima de tudo; a carta da vez
//     continua tocável;
// f2: a partida segue no automático até alguém sair: o rosto dele na mesa leva o carimbo, e o vídeo
//     ampliado fica em preto e branco com o carimbo no canto;
// f3: fim de jogo, o anfitrião volta para a sala: o alto cabe em todos os celulares e o voltar segue
//     redondo (antes amassava), com o convite junto do código.
import { actOnce, closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame } from './lib.mjs';

const MAX_MIN = Number(process.env.MAX_MIN ?? 12);
const PESSOAS = [
  ['Ana', 'iPhone 15'],
  ['Beto', 'iPhone SE'],
  ['Caio', 'Pixel 7'],
];

async function abrir(d, o) {
  const direto = d.page.getByRole('button', { name: o === 'mic' ? 'Abrir o microfone' : 'Abrir a câmera' }).first();
  if (await direto.isVisible().catch(() => false)) return direto.click();
  const chave = d.page.getByRole('switch', { name: o === 'mic' ? /Microfone/ : /Câmera/ });
  if (!(await chave.isVisible().catch(() => false))) await d.page.getByRole('button', { name: /^Microfone e câmera/ }).click();
  await chave.click();
  await d.page.mouse.click(4, 300);
}
const nuvens = (d) => d.page.locator('.fumaca-nuvem').count();
/** O alto de uma tela de menu: cabe, e o voltar é redondo. */
const alto = (d) =>
  d.page.evaluate(() => {
    const h = document.querySelector('header');
    const v = h.querySelector('button[aria-label="Voltar"]').getBoundingClientRect();
    const filhos = [...h.querySelectorAll('button, h1')].map((e) => e.getBoundingClientRect());
    return {
      cabe: h.scrollWidth <= h.clientWidth && filhos.every((r) => r.right <= innerWidth + 0.5 && r.left >= -0.5),
      voltar: [Math.round(v.width), Math.round(v.height)],
      titulo: Math.round(h.querySelector('h1').getBoundingClientRect().width),
      botoes: h.querySelectorAll('button').length,
    };
  });

const devs = [];
for (const [nome, dev] of PESSOAS) devs.push(await device(nome, { dev, microfone: true }));
const [ana, ...outros] = devs;
const code = await createRoom(ana.page);
for (const d of outros) await joinByLink(d.page, code);
await ana.page.getByText(/Na mesa \(3\/8\)/).waitFor({ timeout: 20000 });
for (const d of devs) {
  await abrir(d, 'mic');
  await abrir(d, 'camera');
}
await sleep(2500);
// O alto da sala antes da partida, já com microfone e câmera.
for (const d of devs) {
  const a = await alto(d);
  log('f3', `${d.label} (antes): ${JSON.stringify(a)}`);
  if (!a.cabe || a.voltar[0] !== a.voltar[1]) flag('f3', `${d.label}: o alto da sala não cabe ou o voltar amassou (antes)`, a);
}
await ana.shot('fumaca-sala-antes-ana');

await startGame(ana.page);
await ana.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 20000 }).catch(() => {});
const fim = ana.page.getByRole('dialog', { name: 'Fim de jogo' });

// f1: joga até ter carta na mesa, e para.
let acoes = 0;
let jogadas = 0;
while (jogadas < 1 && acoes < 40) {
  const a = await actOnce(devs);
  if (a) acoes++;
  if (a?.endsWith(':jogou')) jogadas++;
  if (!a) await sleep(150);
}
await sleep(600);
const daVez = async () => {
  for (const d of devs) if (await d.page.locator('[aria-label="Tuas cartas"] button:not([disabled])').first().isVisible().catch(() => false)) return d;
  return null;
};
const vez = await daVez();
const espera = devs.find((d) => d !== vez) ?? devs[0];
log('f1', `parado na vez de ${vez?.label ?? 'ninguém (cantando)'}; ${espera.label} espera`);
const t0 = Date.now();
const fotos = [[3, 'antes'], [14, '14s'], [30, '30s'], [42, '42s'], [56, '56s']];
for (const [s, nome] of fotos) {
  await sleep(Math.max(0, s * 1000 - (Date.now() - t0)));
  const n = await Promise.all(devs.map(nuvens));
  log('f1', `${nome}: nuvens ${n.join('/')}`);
  if (s < 9 && n.some((x) => x > 0)) flag('f1', 'fumaça antes da hora', n);
  if (s > 12 && n.some((x) => x === 0)) flag('f1', `sem fumaça aos ${s} s`, n);
  for (const d of [vez ?? devs[0], espera]) await d.shot(`fumaca-${nome}-${d.label}`);
}
// A carta de quem está na vez continua tocável (a fumaça não pega toque).
if (vez) {
  const toca = await vez.page.evaluate(() => {
    const b = document.querySelector('[aria-label="Tuas cartas"] button:not([disabled])');
    if (!b) return 'sem carta';
    const r = b.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.3);
    return b.contains(e) || e === b ? 'ok' : `coberta por ${e?.className}`;
  });
  if (toca !== 'ok') flag('f1', `a carta de ${vez.label} não recebe o toque`, toca);
  else log('f1', 'a carta da vez continua tocável no meio da fumaça');
}
// Jogou: a fumaça vai embora.
await actOnce(devs);
await sleep(1500);
const depois = await Promise.all(devs.map(nuvens));
if (depois.some((x) => x > 0)) flag('f1', 'a fumaça ficou depois da jogada', depois);
else log('f1', 'jogou: a fumaça sumiu em todos');

// f2: segue até alguém sair.
const inicio = Date.now();
let visto = false;
while (Date.now() - inicio < MAX_MIN * 60000) {
  if (await fim.isVisible().catch(() => false)) break;
  const a = await actOnce(devs);
  if (!a) await sleep(120);
  if (!visto) {
    for (const d of devs) {
      const fora = d.page.locator('[role="group"][aria-label$=", fora do jogo"]').first();
      if (!(await fora.isVisible().catch(() => false))) continue;
      visto = true;
      const nome = (await fora.getAttribute('aria-label')).replace(', fora do jogo', '');
      const carimbo = await fora.getByText('Loser').first().isVisible().catch(() => false);
      if (!carimbo) flag('f2', `${d.label}: o rosto de ${nome} na mesa não levou o carimbo`);
      else log('f2', `${d.label} vê ${nome} fora, com o carimbo no rosto`);
      await d.shot(`loser-mesa-${d.label}`);
      const botao = fora.getByRole('button', { name: 'Ver o vídeo grande' });
      if (await botao.isVisible().catch(() => false)) {
        await botao.click();
        const grande = d.page.getByRole('dialog', { name: new RegExp(`Vídeo de ${nome}, fora do jogo`) });
        await grande.waitFor({ timeout: 5000 }).catch(() => {});
        await sleep(900);
        const m = await grande
          .evaluate((el) => ({ filtro: getComputedStyle(el.querySelector('video')).filter, carimbo: [...el.querySelectorAll('span')].some((s) => s.textContent.trim() === 'Loser') }))
          .catch(() => null);
        if (!m || !m.filtro.includes('grayscale') || !m.carimbo) flag('f2', `${d.label}: o vídeo ampliado de ${nome} não está em preto e branco com o carimbo`, m);
        else log('f2', `vídeo ampliado de ${nome}: ${m.filtro}, com o carimbo`);
        await d.shot(`loser-grande-${d.label}`);
        await grande.click({ position: { x: 5, y: 5 } }).catch(() => {});
      } else flag('f2', `${d.label}: ${nome} saiu, mas o rosto dele não é vídeo (a câmera caiu?)`);
      break;
    }
  }
}
if (!visto) flag('f2', 'ninguém saiu do jogo antes do fim');
if (!(await fim.isVisible().catch(() => false))) flag('f3', `a partida não acabou em ${MAX_MIN} min`);
else log('f3', `fim de jogo em ${Math.round((Date.now() - inicio) / 1000)} s`);

// f3: de volta à sala.
await ana.shot('fumaca-fim-ana');
await ana.page.getByRole('button', { name: 'Voltar pra sala' }).click();
for (const d of devs) {
  await d.page.getByText(/Na mesa \(3\/8\)/).waitFor({ timeout: 15000 }).catch(() => flag('f3', `${d.label} não voltou para a sala`));
  await sleep(600);
  const a = await alto(d);
  log('f3', `${d.label} (depois): ${JSON.stringify(a)}`);
  if (!a.cabe || a.voltar[0] !== a.voltar[1]) flag('f3', `${d.label}: o alto da sala não cabe ou o voltar amassou`, a);
  if (!(await d.page.getByRole('button', { name: 'Convidar' }).isVisible().catch(() => false))) flag('f3', `${d.label}: o convite sumiu`);
  await d.shot(`fumaca-sala-depois-${d.label}`);
}

for (const d of devs) if (d.errors.length) flag('erros', `erros na página de ${d.label}`, d.errors.slice(0, 4));
report();
await closeAll();
