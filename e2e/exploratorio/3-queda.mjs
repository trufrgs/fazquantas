// QA 3: quedas de verdade no WebSocket (modo avião, morta em silêncio, buraco negro, lenta, celular dormindo).
import { actOnce, alertText, closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame, watch } from './lib.mjs';

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

async function a1() {
  const S = 'A1 modo avião 8 s';
  const { ana, beto } = await mesa(S);
  await watch(S, [ana, beto], 2000, { act: true });
  await beto.aviao(true);
  const r1 = await espera(beto, ['reconectando'], 6000);
  log(S, r1.ok ? `"Reconectando…" em ${r1.ms} ms` : `sem "Reconectando…" (tela ${r1.s})`);
  if (!r1.ok) flag(S, 'sem "Reconectando…" com a conexão fechada', { tela: r1.s });
  await sleep(8000 - r1.ms);
  await beto.aviao(false);
  const r2 = await espera(beto, ['jogo', 'fim'], 20000);
  log(S, r2.ok ? `voltou em ${r2.ms} ms` : `não voltou (tela ${r2.s})`);
  if (!r2.ok || r2.ms > 5000) flag(S, 'volta lenta depois do modo avião', { ms: r2.ms, tela: r2.s, alerta: await alertText(beto.page) });
  await watch(S, [ana, beto], 4000, { act: true, expect: ['jogo', 'fim'] });
  await ana.close(); await beto.close();
}

async function a2() {
  const S = 'A2 morta em silêncio';
  const { ana, beto } = await mesa(S);
  beto.morta(true);
  const r = await espera(beto, ['reconectando'], 70000);
  log(S, r.ok ? `percebeu em ${r.ms} ms` : 'não percebeu em 70 s');
  if (!r.ok || r.ms > 25000) flag(S, 'demora para perceber a conexão morta', { ms: r.ms });
  beto.morta(false);
  const r2 = await espera(beto, ['jogo', 'fim'], 20000);
  log(S, r2.ok ? `voltou em ${r2.ms} ms` : `não voltou (tela ${r2.s})`);
  if (!r2.ok || r2.ms > 8000) flag(S, 'volta lenta depois da conexão morta', { ms: r2.ms, tela: r2.s });
  await ana.close(); await beto.close();
}

async function a3() {
  const S = 'A3 buraco negro 75 s';
  const { ana, beto } = await mesa(S);
  beto.morta(true, { buraco: true });
  await sleep(75000);
  const antes = beto.rede.conexoes;
  beto.morta(false);
  const r2 = await espera(beto, ['jogo', 'fim'], 30000);
  log(S, r2.ok ? `voltou em ${r2.ms} ms (tentativas: ${beto.rede.conexoes - antes} depois de voltar)` : `NÃO voltou em 30 s (tela ${r2.s})`);
  if (!r2.ok || r2.ms > 10000) flag(S, 'depois do buraco negro, demora ou não volta', { ms: r2.ms, tela: r2.s, tentativas: beto.rede.conexoes });
  await ana.close(); await beto.close();
}

async function a4() {
  const S = 'A4 celular dormindo 90 s';
  const { ana, beto } = await mesa(S);
  await beto.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  beto.morta(true);
  await watch(S, [ana], 90000, { act: true });
  const antes = beto.rede.conexoes;
  beto.morta(false);
  await beto.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const t0 = Date.now();
  // Acordou: quanto tempo até a mesa voltar a responder (tela sem "Reconectando…" e ação aceita ou partida no fim)?
  let pronto = null;
  while (Date.now() - t0 < 40000) {
    const s = await beto.screen();
    const vivo = beto.rede.quadros.some((q) => q.t >= t0 && q.m.startsWith('{"e":"room:join"')) || beto.rede.conexoes > antes;
    if ((s === 'jogo' || s === 'fim') && vivo) { pronto = Date.now() - t0; break; }
    await sleep(200);
  }
  log(S, pronto !== null ? `acordou e voltou à mesa em ${pronto} ms (tela ${await beto.screen()})` : 'não voltou em 40 s');
  if (pronto === null || pronto > 8000) flag(S, 'ao acordar, demora para voltar à mesa', { ms: pronto });
  await ana.close(); await beto.close();
}

async function a5() {
  const S = 'A5 lenta (1,5 s cada lado)';
  const { ana, beto } = await mesa(S);
  beto.rede.atraso = 1500;
  const { counts } = await watch(S, [ana, beto], 40000, { act: true, expect: ['jogo', 'fim', 'reconectando'] });
  const rec = [...counts].filter(([k]) => k.endsWith(':reconectando'));
  if (rec.length) flag(S, '"Reconectando…" só com a rede lenta', Object.fromEntries(rec));
  const errs = beto.errors.filter((e) => !/WebSocket|ERR_|Failed to load/.test(e));
  if (errs.length) flag(S, 'erros no console do Beto', errs.slice(0, 3));
  const alerta = await alertText(beto.page);
  if (alerta) log(S, `alerta do Beto: ${alerta}`);
  await ana.close(); await beto.close();
}

async function a6() {
  const S = 'A6 oscilando (modo avião liga/desliga)';
  const { ana, beto } = await mesa(S);
  for (let i = 0; i < 8; i++) {
    await beto.aviao(true);
    await sleep(1500 + Math.random() * 2000);
    await beto.aviao(false);
    await sleep(1000 + Math.random() * 2000);
    await actOnce([ana, beto]);
  }
  const r = await espera(beto, ['jogo', 'fim'], 15000);
  if (!r.ok) flag(S, 'depois de oscilar, não ficou na mesa', { tela: r.s, alerta: await alertText(beto.page) });
  const assentos = await ana.page.locator('span', { hasText: /^Beto$/ }).count();
  log(S, `conexões do Beto: ${beto.rede.conexoes}; "Beto" na tela da Ana: ${assentos}`);
  await watch(S, [ana, beto], 5000, { act: true, expect: ['jogo', 'fim'] });
  await ana.close(); await beto.close();
}

async function a7() {
  const S = 'A7 jogar com a conexão morta';
  const { ana, beto } = await mesa(S);
  // Espera a vez do Beto e só então mata a conexão: ele toca na carta/palpite sem saber que caiu.
  let vez = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 40000 && !vez) {
    vez = await beto.page.locator('section[aria-label="Teu palpite"] button[aria-label^="Palpite"]:not([disabled]), [aria-label="Tuas cartas"] button:not([disabled])').first().isVisible().catch(() => false);
    if (!vez) { await actOnce([ana]); await sleep(300); }
  }
  if (!vez) { flag(S, 'a vez do Beto não chegou'); return; }
  beto.morta(true);
  const acao = await actOnce([beto]);
  log(S, `Beto tentou agir com a conexão morta: ${acao}`);
  const t1 = Date.now();
  let visto = null;
  while (Date.now() - t1 < 30000) {
    const al = await alertText(beto.page);
    const s = await beto.screen();
    if (al || s === 'reconectando') { visto = { ms: Date.now() - t1, alerta: al, tela: s }; break; }
    await sleep(250);
  }
  log(S, visto ? `o Beto ficou sabendo em ${visto.ms} ms: ${JSON.stringify(visto)}` : 'nenhum sinal em 30 s');
  if (!visto || visto.ms > 10000) flag(S, 'jogada perdida sem aviso rápido', visto ?? {});
  beto.morta(false);
  const r = await espera(beto, ['jogo', 'fim'], 20000);
  if (!r.ok) flag(S, 'não voltou à mesa', { tela: r.s });
  await ana.close(); await beto.close();
}

try {
  if (want('a1')) await a1();
  if (want('a6')) await a6();
  if (want('a5')) await a5();
  if (want('a7')) await a7();
  if (want('a2')) await a2();
  if (want('a3')) await a3();
  if (want('a4')) await a4();
} catch (e) {
  flag('ERRO', e.message.split('\n')[0]);
} finally {
  report();
  await closeAll();
}
