// QA 1: identidade e entrada (janela anônima sem nada salvo, convite, senha, sala cheia, partida começada).
import { alertText, closeAll, createRoom, device, flag, joinByLink, log, report, screenOf, sleep, startGame, BASE, OUT } from './lib.mjs';

async function q1() {
  const S = 'Q1 convite anônimo';
  const ana = await device('Ana');
  const code = await createRoom(ana.page);
  const bia = await device('Bia', { name: null, preset: false });
  await joinByLink(bia.page, code);
  await sleep(1500);
  await bia.shot('q1-bia-chegou');
  const prompt = bia.page.getByText(`Antes de entrar na sala ${code}`);
  if (!(await prompt.isVisible().catch(() => false))) {
    flag(S, 'sem o pedido de nome ao chegar pelo convite', { tela: await screenOf(bia.page), alerta: await alertText(bia.page) });
  } else {
    const nome = bia.page.getByRole('textbox', { name: /Como te chamam/ });
    await nome.fill('Bia');
    await bia.page.getByRole('button', { name: `Entrar na sala ${code}` }).click();
  }
  await sleep(2000);
  const tela = await screenOf(bia.page);
  if (tela !== 'lobby') flag(S, `Bia não chegou ao lobby (tela: ${tela})`, { alerta: await alertText(bia.page) });
  const naMesa = await ana.page.getByText(/Na mesa \(2\/8\)/).isVisible().catch(() => false);
  if (!naMesa) flag(S, 'Ana não vê a Bia na mesa');
  const nomeNaMesa = await ana.page.getByText('Bia', { exact: true }).first().isVisible().catch(() => false);
  if (!nomeNaMesa) flag(S, 'o nome da Bia não aparece para a Ana');
  await bia.shot('q1-bia-lobby');
  log(S, `ok até aqui: tela da Bia = ${tela}`);
  return { ana, bia, code };
}

async function q2() {
  const S = 'Q2 início sem nome';
  const cida = await device('Cida', { name: null, preset: false });
  await cida.page.goto(BASE);
  await cida.page.getByRole('button', { name: 'Jogar com a gurizada' }).click();
  const folha = cida.page.getByRole('dialog', { name: 'Teu apelido' });
  if (!(await folha.isVisible().catch(() => false))) flag(S, 'sem a folha de apelido na primeira visita');
  if (await cida.page.getByRole('button', { name: 'Pular' }).isVisible().catch(() => false)) flag(S, 'dá para pular o apelido indo jogar online');
  const seguir = cida.page.getByRole('button', { name: /Escreve teu apelido|Pronto/ });
  if (!(await seguir.isDisabled())) flag(S, 'seguir habilitado sem apelido');
  await cida.page.getByRole('textbox', { name: /Como te chamam/ }).fill('Cida');
  await cida.page.getByRole('button', { name: 'Pronto' }).click();
  const criar = cida.page.getByRole('button', { name: 'Criar sala' });
  await criar.waitFor({ timeout: 5000 });
  if (await cida.page.getByText('Antes de tudo').isVisible().catch(() => false)) flag(S, 'pediu o apelido duas vezes');
  await criar.click();
  await sleep(2000);
  if ((await screenOf(cida.page)) !== 'lobby') flag(S, 'não criou a sala depois de pôr o nome', { alerta: await alertText(cida.page) });
  await cida.shot('q2-lobby');
  // Contra bots, ainda dá para pular.
  const dudu = await device('Dudu', { name: null, preset: false });
  await dudu.page.goto(BASE);
  await dudu.page.getByRole('button', { name: 'Jogar contra bots' }).click();
  if (!(await dudu.page.getByRole('button', { name: 'Pular' }).isVisible().catch(() => false))) flag(S, 'contra bots sumiu o "Pular"');
  await cida.close();
  await dudu.close();
}

async function q3() {
  const S = 'Q3 senha';
  const ana = await device('Ana');
  const code = await createRoom(ana.page, { password: 'galpão' });
  const caio = await device('Caio');
  await joinByLink(caio.page, code);
  await caio.page.getByText('Essa sala tem senha').waitFor({ timeout: 8000 }).catch(() => flag(S, 'não pediu a senha'));
  await caio.page.getByLabel('Senha da sala').fill('errada');
  await caio.page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await sleep(1200);
  const erro = await alertText(caio.page);
  if (!erro || !/senha/i.test(erro)) flag(S, 'senha errada sem erro claro', { erro });
  else log(S, `senha errada: "${erro}"`);
  await caio.page.getByLabel('Senha da sala').fill('galpão');
  await caio.page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await sleep(1500);
  if ((await screenOf(caio.page)) !== 'lobby') flag(S, 'senha certa não entrou', { alerta: await alertText(caio.page) });
  // Recarregar a página já dentro da sala não pede a senha de novo.
  await caio.page.reload();
  await sleep(2500);
  if ((await screenOf(caio.page)) !== 'lobby') flag(S, 'depois de recarregar, saiu do lobby', { tela: await screenOf(caio.page), alerta: await alertText(caio.page) });
  await ana.close();
  await caio.close();
}

async function q4() {
  const S = 'Q4 código inexistente';
  const d = await device('Duda');
  await joinByLink(d.page, 'ZZZZ');
  await sleep(2000);
  const erro = await alertText(d.page);
  if (!erro) flag(S, 'sem mensagem para código inexistente', { tela: await screenOf(d.page) });
  else log(S, `mensagem: "${erro}"`);
  // A mensagem aparece sem rolar a tela?
  const box = await d.page.getByRole('alert').first().boundingBox().catch(() => null);
  const vp = d.page.viewportSize();
  if (box && vp && box.y + box.height > vp.height) flag(S, 'erro fora da tela (precisa rolar)', { y: box.y, altura: vp.height });
  await d.shot('q4-inexistente');
  await d.close();
}

async function q5(ana, bia, code) {
  const S = 'Q5 partida já começou';
  await startGame(ana.page);
  await sleep(2500);
  const dani = await device('Dani');
  await joinByLink(dani.page, code);
  await sleep(2500);
  const tela = await screenOf(dani.page);
  const erro = await alertText(dani.page);
  log(S, `Dani: tela=${tela} alerta=${erro}`);
  await dani.shot('q5-partida-comecada');
  if (tela === 'inicio' && !erro) flag(S, 'Dani caiu no início sem explicação');
  if (tela === 'online' && !erro) flag(S, 'Dani ficou na tela online sem explicação');
  await dani.close();
}

async function q6() {
  const S = 'Q6 sala cheia';
  const host = await device('Host');
  const code = await createRoom(host.page);
  const outros = [];
  for (let i = 2; i <= 8; i++) {
    const d = await device(`P${i}`);
    await joinByLink(d.page, code);
    outros.push(d);
  }
  await host.page.getByText(/Na mesa \(8\/8\)/).waitFor({ timeout: 20000 }).catch(() => flag(S, 'não chegou a 8/8'));
  const nono = await device('Nono');
  await joinByLink(nono.page, code);
  await sleep(2500);
  const erro = await alertText(nono.page);
  log(S, `nono: tela=${await screenOf(nono.page)} alerta=${erro}`);
  if (!erro || !/cheia|lotad|lugar/i.test(erro)) flag(S, 'sala cheia sem mensagem clara', { erro });
  await nono.shot('q6-nono');
  await host.shot('q6-host-8');
  // Começa com 8 e confere a mesa num celular pequeno.
  await startGame(host.page);
  await sleep(3000);
  await host.shot('q6-mesa-8-pixel7');
  for (const d of [...outros, nono]) await d.close();
  return { host, code };
}

try {
  const { ana, bia, code } = await q1();
  await q2();
  await q3();
  await q4();
  await q5(ana, bia, code);
  await ana.close();
  await bia.close();
  const { host } = await q6();
  await host.close();
} catch (e) {
  flag('ERRO', e.message.split('\n')[0]);
} finally {
  report();
  await closeAll();
}
console.log('fotos em', OUT);
