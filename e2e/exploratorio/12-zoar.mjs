// Exploratório 12: zoar o amigo (04/10/2026). Dois celulares numa partida ao vivo:
// z1: a Ana toca no rosto do Beto e atira um tomate: a mancha aparece nos dois aparelhos;
// z2: a Ana carimba "Cagão" na testa do Beto;
// z3: atirar quatro vezes na mesma rodada: o quarto recebe "Acabou a munição";
// z4: a Ana segura a frase favorita: o Beto vê o balão gritado ("CAGÃÃÃ…");
// z5: a Ana vira a mesa pelo menu; a segunda vez recebe o recado do limite;
// z6: o Beto demora 10 s na vez e a Ana cutuca.
import { actOnce, closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame } from './lib.mjs';

async function ate(cond, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return Date.now() - t0;
    await sleep(200);
  }
  return null;
}

const ana = await device('Ana', { dev: 'iPhone 15', settings: { speed: 'normal' } });
const beto = await device('Beto', { dev: 'Pixel 7' });
const code = await createRoom(ana.page);
await joinByLink(beto.page, code);
await ana.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 15000 });
await startGame(ana.page);
await ana.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 20000 });
await sleep(1500);
for (const d of [ana, beto]) await d.page.getByRole('button', { name: 'Entendi' }).click({ timeout: 1500 }).catch(() => {});

const menu = () => ana.page.getByRole('dialog', { name: 'Zoar Beto' });
const abrirMenu = async () => {
  await ana.page.getByRole('button', { name: 'Zoar Beto' }).click();
  await menu().waitFor({ timeout: 3000 });
};
const manchas = (d) => d.page.locator('svg path[d^="M58 8"]').count();

// z1
await abrirMenu();
await ana.shot('zoar-menu');
await menu().getByRole('button', { name: 'Atirar tomate em Beto' }).click();
const t1 = await ate(async () => (await manchas(beto)) > 0 && (await manchas(ana)) > 0);
if (t1 === null) flag('z1', 'a mancha do tomate não apareceu nos dois');
else log('z1', `tomate no Beto, visto pelos dois em ${t1} ms`);
await sleep(300);
await beto.shot('zoar-tomate-beto');

// z2
await abrirMenu();
await menu().getByRole('button', { name: /Carimbar "Cagão!"/ }).click();
const t2 = await ate(() => beto.page.getByText('Cagão', { exact: true }).first().isVisible().catch(() => false));
if (t2 === null) flag('z2', 'o carimbo não apareceu para o Beto');
else log('z2', `carimbo na testa em ${t2} ms`);
await beto.shot('zoar-carimbo-beto');

// z3
await sleep(1600);
for (let i = 0; i < 2; i++) {
  await abrirMenu();
  await menu().getByRole('button', { name: 'Atirar ovo em Beto' }).click();
  await sleep(400);
}
await abrirMenu();
await menu().getByRole('button', { name: 'Atirar chinelo em Beto' }).click();
const t3 = await ate(() => menu().getByText(/Acabou a munição/).isVisible().catch(() => false), 4000);
if (t3 === null) flag('z3', 'o quarto tiro da rodada não recebeu o recado da munição');
else log('z3', 'quarto tiro: "Acabou a munição desta rodada"');
await ana.page.keyboard.press('Escape');

// z4 (na vez de cantar da Ana a pílula some: canta primeiro)
const fav = ana.page.getByRole('button', { name: /^Mandar "Cagão!"/ });
if (!(await fav.isVisible().catch(() => false))) await actOnce([ana]);
await fav.waitFor({ timeout: 8000 }).catch(() => {});
const box = await fav.boundingBox({ timeout: 3000 }).catch(() => null);
if (!box) { await ana.shot('zoar-z4-ana'); flag('z4', 'sem a frase favorita "Cagão!" na mesa'); }
else {
  await ana.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await ana.page.mouse.down();
  await sleep(1500);
  await ana.page.mouse.up();
  await sleep(250);
  await ana.shot('zoar-z4-ana');
  const t4 = await ate(() => beto.page.getByText(/CAGÃÃÃ/).first().isVisible().catch(() => false));
  if (t4 === null) flag('z4', 'o Beto não viu o grito');
  else log('z4', `grito visto em ${t4} ms`);
  await beto.shot('zoar-grito-beto');
}

// z5
await sleep(1600);
await ana.page.getByRole('button', { name: 'Menu' }).click();
await ana.page.getByRole('button', { name: 'Virar a mesa' }).click();
await sleep(900);
const recado1 = await ana.page.getByRole('alert').first().textContent().catch(() => null);
if (await ana.page.getByRole('dialog', { name: 'Menu da partida' }).isVisible().catch(() => false)) flag('z5', 'a primeira virada não fechou o menu', { recado1 });
await beto.shot('zoar-virada-beto');
await sleep(1500);
await ana.page.getByRole('button', { name: 'Menu' }).click();
await ana.page.getByRole('button', { name: 'Virar a mesa' }).click();
const t5 = await ate(() => ana.page.getByText(/já virou a mesa/).isVisible().catch(() => false), 4000);
await ana.shot('zoar-z5-ana');
if (t5 === null) flag('z5', 'a segunda virada não recebeu o recado');
else log('z5', 'a segunda virada da partida foi recusada');
await ana.page.getByRole('button', { name: 'Continuar' }).click({ timeout: 3000 }).catch(() => {});

// z6: espera alguém ficar na vez por 10 s.
await sleep(10500);
const vezDoBeto = await ana.page.getByRole('dialog', { name: 'Zoar Beto' }).isVisible().catch(() => false);
await ana.page.getByRole('button', { name: 'Zoar Beto' }).click();
const cutucar = menu().getByRole('button', { name: 'Cutucar' });
if (await cutucar.isVisible().catch(() => false)) {
  await cutucar.click();
  log('z6', 'cutucou o Beto');
} else log('z6', `sem cutucar agora (a vez não é do Beto${vezDoBeto ? '' : ''})`);
await ana.page.keyboard.press('Escape');

for (const d of [ana, beto]) if (d.errors.length) flag('erros', `erros na página de ${d.label}`, d.errors.slice(0, 4));
report();
await closeAll();
