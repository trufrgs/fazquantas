// Exploratório 7: longe da mesa por muito tempo (WhatsApp, janta, celular que matou a página).
// Relato de 29/09/2026: criou a sala no iPhone, foi ao WhatsApp mandar um áudio chamando a gurizada e,
// na volta, "teu lugar nessa sala não vale mais". Os cenários esperam juntos `LONGE_MIN` minutos
// (padrão 3,5: passa do prazo da coroa; com 16, passa também dos 15 min que a sala vazia durava).
import { alertText, closeAll, createRoom, device, flag, joinByLink, log, report, sleep, BASE } from './lib.mjs';

const LONGE_MS = Number(process.env.LONGE_MIN ?? 3.5) * 60_000;
const visivel = (loc) => loc.isVisible().catch(() => false);

async function espera(cond, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return Date.now() - t0;
    await sleep(250);
  }
  return null;
}

const naMesa = (page, n) => page.getByText(new RegExp(`Na mesa \\(${n}/8\\)`));
const comanda = (page) => visivel(page.getByRole('button', { name: /Começar partida|Chama alguém/ }));

/** Simula o app indo para o segundo plano (ou voltando): a página avisa a sala, a conexão continua. */
async function tela(page, visivel) {
  await page.evaluate((v) => {
    Object.defineProperty(document, 'visibilityState', { value: v ? 'visible' : 'hidden', configurable: true });
    Object.defineProperty(document, 'hidden', { value: !v, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, visivel);
}

async function reabrir(d) {
  d.page = await d.ctx.newPage();
  await d.page.goto(BASE);
}

const t0 = Date.now();

// l1: a anfitriã vai ao WhatsApp (modo avião) com o Beto esperando na sala.
const ana = await device('Ana');
const beto = await device('Beto');
const salaA = await createRoom(ana.page);
await joinByLink(beto.page, salaA);
await naMesa(ana.page, 2).waitFor({ timeout: 15000 });
await ana.aviao(true);
log('l1', `sala ${salaA}: Ana foi pro WhatsApp com o Beto na sala`);

// l2: sozinha com um bot, o celular mata a página: ninguém fica conectado na sala.
const carla = await device('Carla');
const salaC = await createRoom(carla.page);
await carla.page.getByRole('button', { name: 'Adicionar bot' }).click();
await naMesa(carla.page, 2).waitFor({ timeout: 15000 });
await carla.page.close();
log('l2', `sala ${salaC}: Carla fechou o app, sala sem ninguém conectado`);

// l3: fecha o app; ao reabrir, o servidor não responde (rede ruim) até um tempo depois.
const dani = await device('Dani');
const edu = await device('Edu');
const salaD = await createRoom(dani.page);
await joinByLink(edu.page, salaD);
await naMesa(dani.page, 2).waitFor({ timeout: 15000 });
await dani.page.close();
log('l3', `sala ${salaD}: Dani fechou o app com o Edu na sala`);

// l4: o anfitrião deixa o jogo em segundo plano (Android no WhatsApp), com a conexão viva.
const fe = await device('Fê');
const gabi = await device('Gabi');
const salaF = await createRoom(fe.page);
await joinByLink(gabi.page, salaF);
await naMesa(fe.page, 2).waitFor({ timeout: 15000 });
await tela(fe.page, false);
log('l4', `sala ${salaF}: Fê deixou o jogo em segundo plano, conectada`);

log('todos', `esperando ${(LONGE_MS / 60_000).toFixed(1)} min longe da mesa…`);
await sleep(Math.max(0, LONGE_MS - (Date.now() - t0)));

// l1 --------------------------------------------------------------------------------------------
{
  const S = 'l1 anfitriã no WhatsApp';
  if (!(await comanda(beto.page))) flag(S, 'o Beto, que ficou na sala, não recebeu a coroa para começar');
  if (!(await visivel(beto.page.getByText('saiu da tela, esperando voltar…')))) flag(S, 'o lugar da Ana sumiu da lista do Beto');
  if (!(await visivel(naMesa(beto.page, 2)))) flag(S, 'a sala não tem mais 2 lugares');
  if (!(await visivel(ana.page.getByText(/Reconectando/)))) flag(S, 'a Ana, sem rede, não via o "Reconectando…"');
  // A rede volta com o app ainda em segundo plano (o Android reconecta sozinho): o lugar volta, a coroa
  // fica com o Beto, que está olhando a mesa.
  await tela(ana.page, false);
  await ana.aviao(false);
  const conectou = await espera(() => visivel(beto.page.getByText('na mesa')), 30000);
  if (conectou === null) flag(S, 'a Ana não reconectou com o app em segundo plano');
  await sleep(1000);
  if (!(await comanda(beto.page))) flag(S, 'a coroa voltou para a Ana com o app dela em segundo plano');
  await tela(ana.page, true);
  // De volta de verdade: sem a faixa de reconectando, e o servidor devolveu a coroa (o Beto vê).
  const ms = await espera(
    async () =>
      !(await visivel(ana.page.getByText(/Reconectando/))) &&
      (await comanda(ana.page)) &&
      (await visivel(beto.page.getByText(/Esperando Ana começar/))),
    30000,
  );
  if (ms === null) flag(S, 'a Ana não voltou para a sala com a coroa', { alerta: await alertText(ana.page) });
  else log(S, `Ana olhou a mesa de novo: coroa de volta em ${ms} ms`);
  await ana.shot('longe-l1-ana');
}

// l2 --------------------------------------------------------------------------------------------
{
  const S = 'l2 sala sem ninguém conectado';
  await reabrir(carla);
  const ms = await espera(async () => (await visivel(naMesa(carla.page, 2))) && (await comanda(carla.page)), 30000);
  if (ms === null) flag(S, 'reabrir o app não levou de volta à sala', { alerta: await alertText(carla.page) });
  else log(S, `Carla de volta ao mesmo lugar em ${ms} ms`);
  await carla.shot('longe-l2-carla');
}

// l3 --------------------------------------------------------------------------------------------
{
  const S = 'l3 reabre sem servidor';
  dani.rede.modo = 'offline'; // o site abre, a sala não responde
  await reabrir(dani);
  const voltando = await espera(() => visivel(dani.page.getByText(`Voltando pra sala ${salaD}…`)), 10000);
  if (voltando === null) flag(S, 'ao reabrir, a tela não disse que está voltando para a sala', { alerta: await alertText(dani.page) });
  else log(S, `"Voltando pra sala" em ${voltando} ms`);
  const semRede = await espera(() => visivel(dani.page.getByText(/Sem resposta do servidor agora/)), 25000);
  if (semRede === null) flag(S, 'sem servidor, a tela não explicou que segue tentando');
  else log(S, `aviso de sem conexão em ${semRede} ms`);
  await dani.shot('longe-l3-voltando');
  await sleep(4000);
  dani.rede.modo = 'ok';
  const ms = await espera(async () => (await visivel(naMesa(dani.page, 2))) && (await comanda(dani.page)), 30000);
  if (ms === null) flag(S, 'a volta não aconteceu sozinha quando o servidor respondeu', { alerta: await alertText(dani.page) });
  else log(S, `Dani de volta, com a coroa, ${ms} ms depois de a rede voltar`);
  const edu2 = await espera(() => visivel(edu.page.getByText(/Esperando Dani começar/)), 10000);
  if (edu2 === null) flag(S, 'a coroa não voltou para a Dani na tela do Edu');
}

// l4 --------------------------------------------------------------------------------------------
{
  const S = 'l4 anfitriã com o jogo em segundo plano';
  if (!(await comanda(gabi.page))) flag(S, 'a Gabi, olhando a mesa, não recebeu a coroa');
  await tela(fe.page, true);
  const ms = await espera(async () => (await comanda(fe.page)) && (await visivel(gabi.page.getByText(/Esperando Fê começar/))), 15000);
  if (ms === null) flag(S, 'a coroa não voltou quando a Fê olhou a mesa');
  else log(S, `Fê olhou a mesa: coroa de volta em ${ms} ms`);
}

for (const d of [ana, beto, carla, dani, edu, fe, gabi]) for (const e of d.errors) flag('erros', `${d.label}: ${e}`);
await closeAll();
report();
