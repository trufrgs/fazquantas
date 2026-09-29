import { actOnce, closeAll, createRoom, device, joinByLink, sleep, startGame, OUT } from './lib.mjs';
const vps = { '360': { width: 360, height: 640 }, se: { width: 375, height: 667 }, mini: { width: 320, height: 568 } };
const tag = process.argv[2] ?? '360';
const host = await device('Anfitriã', { viewport: vps[tag] });
const code = await createRoom(host.page);
const outros = [];
for (const n of ['Bia', 'Caio', 'Dani', 'Edu', 'Fê', 'Gabriela', 'Heitorzão']) {
  const d = await device(n, { viewport: { width: 390, height: 844 } });
  await joinByLink(d.page, code);
  outros.push(d);
}
await host.page.getByText(/Na mesa \(8\/8\)/).waitFor({ timeout: 30000 });
await startGame(host.page);
await host.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 20000 });
const t0 = Date.now();
let foto = 0;
while (Date.now() - t0 < 60000 && foto < 2) {
  const painel = host.page.locator('section[aria-label="Teu palpite"] button[aria-label^="Palpite"]:not([disabled])').first();
  if (await painel.isVisible().catch(() => false)) {
    await sleep(600);
    await host.page.screenshot({ path: `${OUT}/painel8-${tag}-${foto}.png` });
    foto++;
    await painel.click().catch(() => {});
    continue;
  }
  await actOnce(outros);
  await sleep(300);
}
await closeAll();
console.log('fotos', foto);
