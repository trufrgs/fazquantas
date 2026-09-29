// QA 5: WebKit (iPhone/Safari) e Firefox: entrar pelo link, jogar, cair a rede, recarregar.
import { alertText, closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame, watch } from './lib.mjs';

async function motor(engine, dev) {
  const S = `M ${engine}`;
  const ana = await device('Ana', { engine, dev });
  const beto = await device('Beto', { engine, dev });
  const code = await createRoom(ana.page);
  await joinByLink(beto.page, code);
  await ana.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 20000 });
  await startGame(ana.page);
  for (const d of [ana, beto]) await d.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 20000 });
  await watch(S, [ana, beto], 6000, { act: true, expect: ['jogo', 'fim'] });
  await beto.aviao(true);
  await sleep(4000);
  await beto.aviao(false);
  let t0 = Date.now();
  while (Date.now() - t0 < 15000 && !['jogo', 'fim'].includes(await beto.screen())) await sleep(200);
  log(S, `depois do modo avião: ${await beto.screen()} em ${Date.now() - t0} ms`);
  if (!['jogo', 'fim'].includes(await beto.screen())) flag(S, 'não voltou depois do modo avião', { alerta: await alertText(beto.page) });
  await beto.page.reload();
  t0 = Date.now();
  while (Date.now() - t0 < 15000 && !['jogo', 'fim'].includes(await beto.screen())) await sleep(200);
  log(S, `depois de recarregar: ${await beto.screen()} em ${Date.now() - t0} ms`);
  if (!['jogo', 'fim'].includes(await beto.screen())) flag(S, 'não voltou depois de recarregar', { alerta: await alertText(beto.page) });
  await watch(S, [ana, beto], 5000, { act: true, expect: ['jogo', 'fim'] });
  for (const d of [ana, beto]) {
    const errs = d.errors.filter((e) => !/WebSocket|ERR_|Failed to load|NetworkError|network connection was lost|Load failed/.test(e));
    if (errs.length) flag(S, `${d.label}: erros no console`, errs.slice(0, 4));
  }
  await beto.shot(`motor-${engine}`);
  await ana.close();
  await beto.close();
}

try {
  if (!process.argv.includes('so-firefox')) await motor('webkit', 'iPhone 13');
  await motor('firefox');
} catch (e) {
  flag('ERRO', e.message.split('\n')[0]);
} finally {
  report();
  await closeAll();
}
