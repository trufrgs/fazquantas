// Exploratório 8: conversa por voz (30/09/2026). Microfone de mentira do Chromium (apita sem parar):
// quem entra liga direto com cada um da conversa (WebRTC em malha) e o servidor só repassa a oferta e a
// resposta. Confere pelo `window.__voz.diagnostico()` (as ligações de cada um) e pelos selos na tela.
import { closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame } from './lib.mjs';

const diag = (d) => d.page.evaluate(() => window.__voz?.diagnostico() ?? null);
const ligadasCom = async (d) => Object.values((await diag(d))?.pares ?? {}).filter((p) => p.conectado).length;

async function esperaLigacoes(devs, n, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ns = await Promise.all(devs.map(ligadasCom));
    if (ns.every((x) => x >= n)) return Date.now() - t0;
    await sleep(250);
  }
  return null;
}

const entrarNaVoz = (d) => d.page.getByRole('button', { name: 'Entrar na conversa por voz' }).click();

// v1: três na sala, os três entram na conversa: cada um liga com os outros dois e ouve os dois.
const ana = await device('Ana', { microfone: true });
const beto = await device('Beto', { microfone: true });
const caio = await device('Caio', { microfone: true });
const code = await createRoom(ana.page);
await joinByLink(beto.page, code);
await joinByLink(caio.page, code);
await ana.page.getByText(/Na mesa \(3\/8\)/).waitFor({ timeout: 15000 });
for (const d of [ana, beto, caio]) await entrarNaVoz(d);
const t1 = await esperaLigacoes([ana, beto, caio], 2);
if (t1 === null) flag('v1', 'os três não ligaram entre si', await Promise.all([ana, beto, caio].map(diag)));
else log('v1', `três na conversa, cada um ligado com os outros dois em ${t1} ms`);
const audios = await Promise.all([ana, beto, caio].map(async (d) => (await diag(d))?.audios ?? 0));
if (audios.some((n) => n < 2)) flag('v1', 'faltou áudio de alguém', audios);
// O microfone de mentira apita uma vez por segundo: em 3 s, os três têm que aparecer falando para a Ana.
const ouvidos = new Set();
for (let i = 0; i < 30; i++) {
  for (const id of (await diag(ana))?.falando ?? []) ouvidos.add(id);
  await sleep(100);
}
if (ouvidos.size < 3) flag('v1', 'avatares falando (o microfone apita): esperava os três acesos em algum momento', { ouvidos: [...ouvidos] });
else log('v1', 'os três aparecem falando na sala da Ana');
await ana.shot('voz-v1');

// v2: Beto silencia: vermelho para os outros; na mesa, o microfone vai para o alto e os selos para os assentos.
await beto.page.getByRole('button', { name: /Microfone aberto/ }).click();
await ana.page.getByRole('img', { name: 'na conversa, mudo' }).waitFor({ timeout: 5000 }).catch(() => flag('v2', 'o mudo do Beto não apareceu para a Ana'));
await startGame(ana.page);
await caio.page.getByText('Rodada 1').waitFor({ timeout: 15000 });
await sleep(1500);
if (!(await caio.page.getByRole('button', { name: /Microfone aberto/ }).isVisible().catch(() => false))) flag('v2', 'na mesa, o microfone do Caio sumiu do alto');
if ((await ligadasCom(caio)) < 2) flag('v2', 'a ligação caiu quando a partida começou', await diag(caio));
else log('v2', 'partida começou e a conversa seguiu (microfone no alto, selos nos assentos)');
await caio.shot('voz-v2-mesa');

// v3: a conexão da sala do Caio cai (modo avião) e volta: a conversa se refaz sozinha.
await caio.aviao(true);
await sleep(1500);
await caio.aviao(false);
const t3 = await esperaLigacoes([caio], 2, 25000);
if (t3 === null) flag('v3', 'depois da queda, a conversa do Caio não voltou', await diag(caio));
else log('v3', `a sala do Caio caiu e voltou; a conversa se refez em ${t3} ms`);

// v4: Beto sai da conversa pelo menu: as ligações dos outros com ele fecham.
await beto.page.getByRole('button', { name: 'Menu' }).click();
await beto.page.getByRole('switch', { name: /Conversa por voz/ }).click();
await beto.page.keyboard.press('Escape').catch(() => {});
const t4 = await esperaLigacoes([ana, caio], 1, 8000);
await sleep(800);
const sobraram = await Promise.all([ana, caio].map(ligadasCom));
if (sobraram.some((n) => n !== 1)) flag('v4', 'depois que o Beto saiu, cada um devia ficar com uma ligação', sobraram);
else log('v4', `Beto saiu; Ana e Caio seguem conversando (${t4} ms)`);

for (const d of [ana, beto, caio]) if (d.errors.length) flag('erros', `erros na página de ${d.label}`, d.errors.slice(0, 4));
report();
await closeAll();
