// Exploratório 9: a sala cheia (30/09/2026). Oito pessoas, o máximo de uma sala (`ROOM_CAPACITY` =
// `MAX_PLAYERS` = 8), cada uma num celular diferente: todas abrem o microfone e quatro a câmera (a malha
// de WebRTC com 8 aparelhos, 28 ligações). Uma nona pessoa entra e vai para a plateia. Depois, uma
// partida inteira no automático, medindo a mesa de 8 em dois celulares (cartas encavaladas, número
// sempre à mostra, alto da mesa cabendo na tela).
import { actOnce, closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame, OUT } from './lib.mjs';

const MAX_MIN = Number(process.env.MAX_MIN ?? 10);
const PESSOAS = [
  ['Ana', 'iPhone 15', true],
  ['Beto', 'iPhone SE', false],
  ['Caio', 'Pixel 7', true],
  ['Dani', 'iPhone 15 Pro Max', false],
  ['Edu', 'Galaxy S9+', true],
  ['Fê', 'iPhone 12', false],
  ['Gabi', 'Pixel 5', true],
  ['Heitor', 'iPhone 13 Mini', false],
];

const diag = (d) => d.page.evaluate(() => window.__midia?.diagnostico() ?? null);
const conectadas = async (d) => Object.values((await diag(d))?.pares ?? {}).filter((p) => p.conectado).length;
async function ate(cond, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return Date.now() - t0;
    await sleep(400);
  }
  return null;
}
/** Abre o microfone ou a câmera pelos botões da sala (ou pelo botão só, que abre as chaves). */
async function abrir(d, o) {
  const direto = d.page.getByRole('button', { name: o === 'mic' ? 'Abrir o microfone' : 'Abrir a câmera' }).first();
  if (await direto.isVisible().catch(() => false)) return direto.click();
  // Tela estreita: o botão só abre as chaves (e fecha com um toque fora).
  const chave = d.page.getByRole('switch', { name: o === 'mic' ? /Microfone/ : /Câmera/ });
  if (!(await chave.isVisible().catch(() => false))) await d.page.getByRole('button', { name: /^Microfone e câmera/ }).click();
  await chave.click();
  await d.page.mouse.click(4, 300);
}

// o1: oito na sala.
const t0 = Date.now();
const devs = [];
for (const [nome, dev] of PESSOAS) devs.push(await device(nome, { dev, microfone: true }));
const [ana, ...outros] = devs;
const code = await createRoom(ana.page);
for (const d of outros) await joinByLink(d.page, code);
const cheia = await ate(() => ana.page.getByText(/Na mesa \(8\/8\)/).isVisible().catch(() => false), 40000);
if (cheia === null) flag('o1', 'as oito pessoas não chegaram à sala');
else log('o1', `oito na sala em ${Date.now() - t0} ms`);

// o2: a nona pessoa não entra.
const nona = await device('Ivo', { dev: 'Pixel 7' });
await joinByLink(nona.page, code);
// Desde 02/10/2026, com a mesa cheia, quem chega senta na plateia (assiste e pede a próxima).
const recusa = await ate(() => nona.page.getByText(/Tu tá na plateia/).first().isVisible().catch(() => false), 15000);
if (recusa === null) flag('o2', 'a nona pessoa não foi para a plateia', { tela: await nona.page.locator('body').innerText().catch(() => '') });
else log('o2', `a nona pessoa sentou na plateia em ${recusa} ms`);
const naSala = await ana.page.getByText(/Na mesa \(8\/8\)/).isVisible().catch(() => false);
if (!naSala) flag('o2', 'a sala mudou depois da nona tentar entrar');

// o3: todo mundo de microfone aberto e quatro de câmera: cada um ligado com os outros sete.
for (const [i, d] of devs.entries()) {
  await abrir(d, 'mic');
  if (PESSOAS[i][2]) await abrir(d, 'camera');
}
const malhaT = await ate(async () => (await Promise.all(devs.map(conectadas))).every((n) => n >= 7), 60000);
const malha = await Promise.all(devs.map(conectadas));
if (malhaT === null) flag('o3', 'a malha de 8 não fechou (cada um devia ter 7 ligações)', { malha });
else log('o3', `malha de 8 fechada em ${malhaT} ms: ${malha.join('/')} (${malha.reduce((a, b) => a + b, 0) / 2} ligações)`);

// o4: a partida inteira, no automático.
await startGame(ana.page);
await ana.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 20000 }).catch(() => {});
const fim = ana.page.getByRole('dialog', { name: 'Fim de jogo' });
const inicio = Date.now();
let acoes = 0;
let medidas = 0;
let rodada = 0;
while (Date.now() - inicio < MAX_MIN * 60000) {
  if (await fim.isVisible().catch(() => false)) break;
  const a = await actOnce(devs);
  if (a) acoes++;
  // A mesa de 8 medida no iPhone 15 e no SE, com cartas na mesa.
  if (medidas < 4 && acoes > 12 && acoes % 7 === 0) {
    for (const d of [devs[0], devs[1]]) {
      const m = await d.page.evaluate(() => {
        const alto = document.querySelector('header');
        const camada = document.querySelector('.mesa .pointer-events-none.absolute.inset-0[aria-live="polite"]');
        const cartas = camada ? [...camada.children].filter((e) => e.getAttribute('role') === 'img').map((e) => ({ l: e.offsetLeft, t: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight, z: Number(e.style.zIndex) })) : [];
        const sob = (a, b) => a.l < b.l + b.w - 3 && b.l < a.l + a.w - 3 && a.t < b.t + b.h - 3 && b.t < a.t + a.h - 3;
        let cobertos = 0;
        for (const c of cartas) {
          const canto = { l: c.l, t: c.t, w: c.w * 0.26, h: c.h * 0.2 };
          if (cartas.some((o) => o !== c && o.z > c.z && o.z < 50 && sob(canto, o))) cobertos++;
        }
        const videos = [...document.querySelectorAll('.mesa video')].map((v) => Math.round(v.getBoundingClientRect().width));
        return { altoCabe: alto.scrollWidth <= innerWidth, cartas: cartas.length, largura: cartas[0]?.w ?? null, cobertos, videos };
      });
      log('o4', `${d.label} (${PESSOAS[devs.indexOf(d)][1]}): ${JSON.stringify(m)}`);
      if (!m.altoCabe) flag('o4', `${d.label}: o alto da mesa não cabe`);
      if (m.cobertos > 0) flag('o4', `${d.label}: número de carta coberto`, m);
      await d.page.screenshot({ path: `${OUT}/oito-${d.label}-${medidas}.png` });
    }
    medidas++;
  }
  const r = await ana.page.getByRole('button', { name: /^Caderneta: rodada \d+/ }).getAttribute('aria-label').catch(() => null);
  const n = Number(/rodada (\d+)/.exec(r ?? '')?.[1] ?? rodada);
  if (n !== rodada) {
    rodada = n;
    log('o4', `rodada ${rodada} (${Math.round((Date.now() - inicio) / 1000)} s)`);
  }
  if (!a) await sleep(150);
}
if (await fim.isVisible().catch(() => false)) log('o4', `fim de jogo em ${Math.round((Date.now() - inicio) / 1000)} s, ${acoes} ações, ${rodada} rodadas`);
else flag('o4', `a partida não acabou em ${MAX_MIN} min (rodada ${rodada}, ${acoes} ações)`);
const malhaFim = await Promise.all(devs.map(conectadas));
log('o4', `malha no fim: ${malhaFim.join('/')}`);

for (const d of [...devs, nona]) if (d.errors.length) flag('erros', `erros na página de ${d.label}`, d.errors.slice(0, 4));
report();
await closeAll();
