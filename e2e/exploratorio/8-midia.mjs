// Exploratório 8: microfone e câmera da mesa (30/09/2026). Microfone e câmera de mentira do Chromium (o
// microfone apita uma vez por segundo; a câmera é um quadro verde com um relógio): cada um abre o que
// quiser, e a sala toda ouve e vê. Confere pelo `window.__midia.diagnostico()` (ligações e o que chegou
// de cada um) e pela tela (vídeo no lugar do avatar, selos, vídeo grande).
import { closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame } from './lib.mjs';

const diag = (d) => d.page.evaluate(() => window.__midia?.diagnostico() ?? null);
const conectadas = async (d) => Object.values((await diag(d))?.pares ?? {}).filter((p) => p.conectado).length;
/** O que chega de uma pessoa (ex.: ['audio', 'video']). */
const chegaDe = async (d, id) => (await diag(d))?.remotos?.[id] ?? [];

async function ate(cond, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return Date.now() - t0;
    await sleep(250);
  }
  return null;
}

/**
 * Abre ou fecha o microfone ou a câmera: pelos botões da sala; na mesa, pelo botão só do alto (abre as
 * chaves) ou, no microfone, pelo selo do teu rosto.
 */
async function alternar(d, o, abrirOuFechar) {
  const nome = `${abrirOuFechar} ${o === 'mic' ? 'o microfone' : 'a câmera'}`;
  const direto = d.page.getByRole('button', { name: nome }).first();
  if (await direto.isVisible().catch(() => false)) return direto.click();
  await d.page.getByRole('button', { name: /^Microfone e câmera/ }).click();
  await d.page.getByRole('switch', { name: o === 'mic' ? /Microfone/ : /Câmera/ }).click();
  await d.page.keyboard.press('Escape').catch(() => {});
}
const abrir = (d, o) => alternar(d, o, 'Abrir');
const fechar = (d, o) => alternar(d, o, 'Fechar');
const videosNaTela = (d) => d.page.locator('video').count();

const ana = await device('Ana', { microfone: true });
const beto = await device('Beto', { microfone: true });
const caio = await device('Caio', { microfone: true });
const code = await createRoom(ana.page);
await joinByLink(beto.page, code);
await joinByLink(caio.page, code);
await ana.page.getByText(/Na mesa \(3\/8\)/).waitFor({ timeout: 15000 });
const ids = Object.fromEntries(await Promise.all([ana, beto, caio].map(async (d) => [d.label, await d.page.evaluate(() => JSON.parse(localStorage.getItem('fodinha:sala') ?? '{}').playerId ?? null)])));
const idDe = async (d) => (await diag(d))?.eu;

// m1: só a Ana abre a câmera; Beto e Caio (sem abrir nada) veem o rosto dela no lugar do avatar.
await abrir(ana, 'camera');
const idAna = await idDe(ana);
const t1 = await ate(async () => (await chegaDe(beto, idAna)).includes('video') && (await chegaDe(caio, idAna)).includes('video'));
if (t1 === null) flag('m1', 'o vídeo da Ana não chegou para Beto e Caio', { beto: await diag(beto), caio: await diag(caio) });
else log('m1', `câmera da Ana chegou para os dois em ${t1} ms`);
await sleep(800);
if ((await videosNaTela(beto)) < 1) flag('m1', 'na sala do Beto não aparece o vídeo da Ana');
if ((await videosNaTela(ana)) < 1) flag('m1', 'a Ana não vê a própria prévia');
await beto.shot('midia-m1-beto');

// m2: Beto abre só o microfone: Ana e Caio ouvem (e ele acende falando).
await abrir(beto, 'mic');
const idBeto = await idDe(beto);
const t2 = await ate(async () => (await chegaDe(ana, idBeto)).includes('audio') && (await chegaDe(caio, idBeto)).includes('audio'));
if (t2 === null) flag('m2', 'o áudio do Beto não chegou', { ana: await diag(ana), caio: await diag(caio) });
else log('m2', `microfone do Beto chegou para os dois em ${t2} ms`);
const ouviu = await ate(async () => ((await diag(ana))?.falando ?? []).includes(idBeto), 5000);
if (ouviu === null) flag('m2', 'o Beto não aparece falando para a Ana');

// m3: Caio abre os dois; todo mundo recebe áudio e vídeo dele; cada um ligado com os outros dois.
await abrir(caio, 'mic');
await abrir(caio, 'camera');
const idCaio = await idDe(caio);
const t3 = await ate(async () => {
  const a = await chegaDe(ana, idCaio);
  const b = await chegaDe(beto, idCaio);
  return a.includes('audio') && a.includes('video') && b.includes('audio') && b.includes('video');
});
const malha = await Promise.all([ana, beto, caio].map(conectadas));
if (t3 === null || malha.some((n) => n < 2)) flag('m3', 'o Caio (microfone e câmera) não chegou para todos', { malha, ana: await diag(ana) });
else log('m3', `Caio de microfone e câmera para todos em ${t3} ms; malha ${malha.join('/')}`);

// m4: Ana fecha a câmera: a luz apaga (a trilha para) e, para os outros, volta o avatar dela.
await fechar(ana, 'camera');
const semVideo = await ate(async () => !(await chegaDe(beto, idAna)).includes('video') || !(await diag(ana))?.meu?.some((t) => t.startsWith('video')), 8000);
const meuDepois = (await diag(ana))?.meu ?? [];
if (meuDepois.some((t) => t.startsWith('video'))) flag('m4', 'a câmera da Ana continua ligada depois de fechar', { meuDepois });
else log('m4', `Ana fechou a câmera (trilha parada) em ${semVideo} ms`);
await sleep(1200);
const rostoAna = await beto.page.getByRole('img', { name: /microfone/ }).count();
log('m4', `selos de microfone na sala do Beto: ${rostoAna}`);

// m5: a partida começa: os rostos vão para os assentos (maiores) e tocar num rosto abre o vídeo grande.
await startGame(ana.page);
await beto.page.getByText('Rodada 1').waitFor({ timeout: 15000 });
await sleep(1500);
// Só o Caio está de câmera aberta agora (a Ana fechou; o Beto nunca abriu): um vídeo na mesa do Beto.
const naMesa = await videosNaTela(beto);
if (naMesa !== 1) flag('m5', 'na mesa do Beto devia haver um vídeo (o do Caio)', { naMesa });
await beto.shot('midia-m5-mesa');
// O alto da mesa cabe na tela e o rosto do Caio no assento é grande (o assento cresce com o espaço).
const alto = await beto.page.evaluate(() => {
  const h = document.querySelector('header');
  const v = document.querySelector('.mesa video');
  return { cabe: (h?.scrollWidth ?? 0) <= innerWidth, rosto: v ? Math.round(v.getBoundingClientRect().width) : null };
});
if (!alto.cabe) flag('m5', 'o alto da mesa não cabe na tela', alto);
if ((alto.rosto ?? 0) < 68) flag('m5', 'o rosto no assento devia ter pelo menos 68 px', alto);
else log('m5', `rosto do Caio no assento: ${alto.rosto} px`);
await beto.page.getByRole('button', { name: 'Ver o vídeo grande' }).first().click();
await sleep(700);
const grande = await beto.page.getByRole('dialog', { name: /Vídeo de/ }).isVisible().catch(() => false);
if (!grande) flag('m5', 'tocar no rosto não abriu o vídeo grande');
else log('m5', 'na mesa, os rostos nos assentos e o vídeo grande ao tocar');
await beto.shot('midia-m5-grande');
await beto.page.getByRole('dialog', { name: /Vídeo de/ }).click();

// m6: a sala do Caio cai e volta: tudo se refaz sozinho.
await caio.aviao(true);
await sleep(1500);
await caio.aviao(false);
const t6 = await ate(async () => (await chegaDe(ana, idCaio)).includes('video') && (await conectadas(caio)) >= 2, 25000);
if (t6 === null) flag('m6', 'depois da queda, o Caio não voltou para a mesa', { caio: await diag(caio), ana: await diag(ana) });
else log('m6', `a sala do Caio caiu e voltou; câmera e microfone de volta em ${t6} ms`);

// m7: todo mundo fecha tudo: as ligações acabam (ninguém abriu nada, ninguém precisa ligar).
await fechar(beto, 'mic');
await fechar(caio, 'mic');
await fechar(caio, 'camera');
const t7 = await ate(async () => (await Promise.all([ana, beto, caio].map(conectadas))).every((n) => n === 0), 8000);
if (t7 === null) flag('m7', 'com tudo fechado, as ligações deviam acabar', await Promise.all([ana, beto, caio].map(conectadas)));
else log('m7', `tudo fechado: nenhuma ligação (${t7} ms)`);

for (const d of [ana, beto, caio]) if (d.errors.length) flag('erros', `erros na página de ${d.label}`, d.errors.slice(0, 4));
void ids;
report();
await closeAll();
