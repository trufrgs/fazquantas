// Exploratório 2: ciclo de vida da aba (criadora cai no lobby, fechar e reabrir, recarregar, duas abas).
import { alertText, closeAll, createRoom, device, flag, joinByLink, log, report, screenOf, sleep, startGame, watch, BASE } from './lib.mjs';

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.includes(id);

async function mesa(S) {
  const ana = await device('Ana');
  const beto = await device('Beto');
  const code = await createRoom(ana.page);
  await joinByLink(beto.page, code);
  await ana.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 15000 });
  await startGame(ana.page);
  for (const d of [ana, beto]) await d.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 15000 });
  log(S, `mesa ${code} começou`);
  return { ana, beto, code };
}

async function espera(d, telas, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await d.screen();
    if (telas.includes(s)) return { ok: true, s, ms: Date.now() - t0 };
    await sleep(200);
  }
  return { ok: false, s: await d.screen(), ms: Date.now() - t0 };
}

async function lobby() {
  const S = 'criadora cai no lobby (modo avião 10 s)';
  const ana = await device('Ana');
  const beto = await device('Beto');
  const code = await createRoom(ana.page);
  await joinByLink(beto.page, code);
  await ana.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 15000 });
  await ana.aviao(true);
  await sleep(10000);
  await ana.aviao(false);
  const r = await espera(ana, ['lobby'], 20000);
  if (!r.ok) flag(S, 'criadora não voltou ao lobby', { tela: r.s, alerta: await alertText(ana.page) });
  if (!(await ana.page.getByRole('button', { name: 'Começar partida' }).isVisible().catch(() => false))) flag(S, 'criadora perdeu o comando da sala');
  if (!(await beto.page.getByText(/Na mesa \(2\/8\)/).isVisible().catch(() => false))) flag(S, 'o Beto não vê 2/8 depois da volta');
  await ana.close();
  await beto.close();
}

async function reabrir() {
  const S = 'fechar a aba no meio da partida e reabrir o site';
  const { ana, beto, code } = await mesa(S);
  await watch(S, [ana, beto], 2000, { act: true });
  await beto.page.close();
  await sleep(4000);
  beto.page = await beto.ctx.newPage();
  await beto.page.goto(BASE);
  const r = await espera(beto, ['jogo', 'fim'], 15000);
  if (!r.ok) flag(S, 'reabrir o site não levou de volta à mesa', { tela: r.s, alerta: await alertText(beto.page) });
  else log(S, `voltou à mesa em ${r.ms} ms`);
  await beto.page.goto(`${BASE}/?sala=${code}`);
  const r2 = await espera(beto, ['jogo', 'fim'], 15000);
  if (!r2.ok) flag(S, 'abrir o link de novo no meio da partida não levou à mesa', { tela: r2.s, alerta: await alertText(beto.page) });
  await ana.close();
  await beto.close();
}

async function recarregar() {
  const S = 'criadora recarrega no meio';
  const { ana, beto } = await mesa(S);
  await watch(S, [ana, beto], 2000, { act: true });
  await ana.page.reload();
  const r = await espera(ana, ['jogo', 'fim'], 15000);
  if (!r.ok) flag(S, 'depois de recarregar, a criadora não voltou à mesa', { tela: r.s, alerta: await alertText(ana.page) });
  else log(S, `voltou em ${r.ms} ms`);
  await watch(S, [ana, beto], 5000, { act: true, expect: ['jogo', 'fim'] });
  await ana.close();
  await beto.close();
}

async function duasAbas() {
  const S = 'duas abas do mesmo aparelho';
  const { ana, beto, code } = await mesa(S);
  const aba2 = await beto.ctx.newPage();
  const socks2 = [];
  aba2.on('websocket', (ws) => socks2.push(ws.url()));
  await aba2.goto(`${BASE}/?sala=${code}`);
  await sleep(20000);
  const antes1 = beto.sockets.length;
  const antes2 = socks2.length;
  await sleep(15000);
  const novos = beto.sockets.length - antes1 + (socks2.length - antes2);
  log(S, `aba 1: tela=${await screenOf(beto.page)} alerta=${await alertText(beto.page)}`);
  log(S, `aba 2: tela=${await screenOf(aba2)}`);
  if (novos > 2) flag(S, 'as duas abas ficam se derrubando', { novos });
  if ((await screenOf(aba2)) !== 'jogo' && (await screenOf(aba2)) !== 'fim') flag(S, 'a aba nova não ficou com a mesa');
  await ana.close();
  await beto.close();
}

try {
  if (want('lobby')) await lobby();
  if (want('reabrir')) await reabrir();
  if (want('recarregar')) await recarregar();
  if (want('abas')) await duasAbas();
} catch (e) {
  flag('ERRO', e.message.split('\n')[0]);
} finally {
  report();
  await closeAll();
}
