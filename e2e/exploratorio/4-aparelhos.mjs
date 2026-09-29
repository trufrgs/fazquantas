// QA 4: troca de aparelho com o celular morto, expulso sem rede, sair reconectando.
import { alertText, closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame } from './lib.mjs';

const only = process.argv.slice(2);
const want = (id) => only.length === 0 || only.includes(id);

async function espera(d, telas, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await d.screen();
    if (telas.includes(s)) return { ok: true, s, ms: Date.now() - t0 };
    await sleep(200);
  }
  return { ok: false, s: await d.screen(), ms: Date.now() - t0 };
}

async function n1() {
  const S = 'N1 troca de aparelho (celular morto)';
  const ana = await device('Ana');
  const celular = await device('Beto');
  const code = await createRoom(ana.page);
  await joinByLink(celular.page, code);
  await ana.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 15000 });
  await startGame(ana.page);
  await celular.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 15000 });
  celular.morta(true);
  // Um pouco antes dos 30 s: o nome igual ainda não toma o lugar.
  await sleep(12000);
  const notebook = await device('Beto');
  await joinByLink(notebook.page, code);
  await sleep(3000);
  const cedo = await notebook.screen();
  log(S, `notebook aos 15 s: tela ${cedo} alerta=${await alertText(notebook.page)}`);
  // Depois dos 30 s: recupera.
  await sleep(22000);
  await joinByLink(notebook.page, code);
  const r = await espera(notebook, ['jogo', 'fim'], 15000);
  log(S, r.ok ? `notebook recuperou o lugar (${r.s})` : `notebook NÃO recuperou (tela ${r.s}, alerta ${await alertText(notebook.page)})`);
  if (!r.ok) flag(S, 'o notebook não recuperou o lugar do celular morto', { tela: r.s });
  // O celular volta: não pode derrubar o notebook.
  celular.morta(false);
  await celular.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await sleep(12000);
  const tc = await celular.screen();
  const ac = await alertText(celular.page);
  log(S, `celular depois de voltar: tela ${tc}, alerta ${ac}`);
  const tn = await notebook.screen();
  const an = await alertText(notebook.page);
  log(S, `notebook: tela ${tn}, alerta ${an}`);
  if (tn !== 'jogo' && tn !== 'fim') flag(S, 'o celular derrubou o notebook ao voltar', { tela: tn, alerta: an });
  if (tc === 'jogo') flag(S, 'celular e notebook os dois na mesa (o celular devia ter saído)');
  if (tc !== 'jogo' && !/outro aparelho/.test(ac ?? '')) flag(S, 'o celular saiu sem dizer que segue no outro aparelho', { tela: tc, alerta: ac });
  await ana.close();
  await celular.close();
  await notebook.close();
}

async function n2() {
  const S = 'N2 tirado sem rede';
  const ana = await device('Ana');
  const beto = await device('Beto');
  const code = await createRoom(ana.page);
  await joinByLink(beto.page, code);
  await ana.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 15000 });
  await beto.aviao(true);
  await sleep(1500);
  await ana.page.getByRole('button', { name: 'Tirar Beto da sala' }).click();
  await ana.page.getByText(/Na mesa \(1\/8\)/).waitFor({ timeout: 10000 }).catch(() => flag(S, 'Ana não tirou o Beto'));
  await beto.aviao(false);
  await sleep(4000);
  const tela = await beto.screen();
  const alerta = await alertText(beto.page);
  log(S, `Beto voltou: tela ${tela}, alerta ${alerta}`);
  if (!/tirou/.test(alerta ?? '')) flag(S, 'Beto não ficou sabendo que foi tirado', { tela, alerta });
  const umSo = await ana.page.getByText(/Na mesa \(1\/8\)/).isVisible().catch(() => false);
  if (!umSo) flag(S, 'o Beto sentou de novo sozinho depois de ser tirado');
  await ana.close();
  await beto.close();
}

async function n3() {
  const S = 'N3 sair reconectando';
  const ana = await device('Ana');
  const beto = await device('Beto');
  const code = await createRoom(ana.page);
  await joinByLink(beto.page, code);
  await ana.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 15000 });
  beto.morta(true);
  await sleep(1000);
  // Sai pelo botão voltar do lobby e confirma.
  await beto.page.getByRole('button', { name: /Voltar/ }).first().click();
  await beto.page.getByRole('button', { name: 'Sair', exact: true }).click();
  const t0 = Date.now();
  const saiu = await ana.page.getByText(/Na mesa \(1\/8\)/).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  log(S, saiu ? `Ana viu o Beto sair em ${Date.now() - t0} ms` : 'Ana NÃO viu o Beto sair em 20 s');
  if (!saiu) flag(S, 'sair com a conexão morta não chegou ao servidor');
  await ana.close();
  await beto.close();
}

try {
  if (want('n2')) await n2();
  if (want('n3')) await n3();
  if (want('n1')) await n1();
} catch (e) {
  flag('ERRO', e.message.split('\n')[0]);
} finally {
  report();
  await closeAll();
}
