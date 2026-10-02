// Exploratório 11: a plateia e os patrões (02/10/2026). Quatro celulares:
// p1: Ana cria, Beto entra, a partida começa; Caio chega no meio: senta na plateia, vê a mesa sem mão,
//     abre a câmera (preto e branco para os outros) e pede para jogar a próxima;
// p2: a Ana (patroa) vê o pedido no alto da mesa e aceita;
// p3: a Ana põe senha no meio da partida (menu ☰): a Dani, que chega sem senha, é barrada;
// p4: a Ana faz o Beto patrão (chapéu ao lado do nome, na mesa);
// p5: a partida acaba e a revanche começa com o Caio sentado na mesa.
import { actOnce, closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame } from './lib.mjs';

const MAX_MIN = Number(process.env.MAX_MIN ?? 8);

async function ate(cond, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return Date.now() - t0;
    await sleep(250);
  }
  return null;
}
async function abrirCamera(d) {
  const direto = d.page.getByRole('button', { name: 'Abrir a câmera' }).first();
  if (await direto.isVisible().catch(() => false)) return direto.click();
  const chave = d.page.getByRole('switch', { name: /Câmera/ });
  if (!(await chave.isVisible().catch(() => false))) await d.page.getByRole('button', { name: /^Microfone e câmera/ }).click();
  await chave.click();
  await d.page.mouse.click(4, 300);
}

const ana = await device('Ana', { dev: 'iPhone 15', microfone: true, settings: { speed: 'normal' } });
const beto = await device('Beto', { dev: 'Pixel 7', microfone: true });
const caio = await device('Caio', { dev: 'iPhone 13 Mini', microfone: true });
const code = await createRoom(ana.page);
// Partida curta: um palito.
for (let i = 0; i < 2; i++) await ana.page.getByRole('button', { name: 'Diminuir palitos' }).click().catch(() => {});
await joinByLink(beto.page, code);
await ana.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 15000 });
await startGame(ana.page);
await ana.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 20000 });

// p1
await joinByLink(caio.page, code);
const naPlateia = await ate(() => caio.page.getByRole('button', { name: 'Quero jogar a próxima' }).isVisible().catch(() => false), 20000);
if (naPlateia === null) flag('p1', 'o Caio não chegou na plateia com o botão de pedir', { tela: (await caio.page.locator('body').innerText()).slice(0, 300) });
else log('p1', `Caio na plateia em ${naPlateia} ms`);
if (await caio.page.locator('[aria-label="Tuas cartas"]').isVisible().catch(() => false)) flag('p1', 'a plateia tem mão de cartas');
await abrirCamera(caio);
const pb = await ate(
  () =>
    ana.page
      .evaluate(() => {
        const g = document.querySelector('[role="group"][aria-label^="Plateia"]');
        const v = g?.querySelector('video');
        return !!v && getComputedStyle(v).filter.includes('grayscale');
      })
      .catch(() => false),
  20000,
);
if (pb === null) flag('p1', 'a Ana não vê a câmera do Caio em preto e branco no canto da mesa');
else log('p1', `a câmera do Caio aparece em preto e branco para a Ana em ${pb} ms`);
await ana.shot('plateia-ana-camera');
await caio.page.getByRole('button', { name: 'Quero jogar a próxima' }).click();

// p2
const pedido = await ate(() => ana.page.getByText(/Caio.*quer jogar a próxima/).first().isVisible().catch(() => false));
if (pedido === null) flag('p2', 'a Ana não viu o pedido do Caio na mesa');
else {
  log('p2', `pedido na mesa da Ana em ${pedido} ms`);
  await ana.shot('plateia-ana-pedido');
  await ana.page.getByRole('button', { name: 'Aceitar' }).click();
  const aceito = await ate(() => caio.page.getByText(/Tu joga a próxima/).first().isVisible().catch(() => false));
  if (aceito === null) flag('p2', 'o Caio não ficou sabendo que foi aceito');
  else log('p2', 'o Caio foi aceito');
}

// p3
await ana.page.getByRole('button', { name: 'Menu' }).click();
await ana.page.getByRole('switch', { name: /Sala com senha/ }).click();
await ana.page.getByLabel('Nova senha da sala').fill('tche');
await ana.page.getByRole('button', { name: 'Salvar' }).click();
await sleep(600);
await ana.shot('plateia-ana-senha');
await ana.page.keyboard.press('Escape');
await ana.page.getByRole('button', { name: 'Continuar' }).click().catch(() => {});
const dani = await device('Dani', { dev: 'Pixel 5' });
await joinByLink(dani.page, code);
const pediuSenha = await ate(() => dani.page.getByText(/Essa sala tem senha|senha/i).first().isVisible().catch(() => false));
if (pediuSenha === null) flag('p3', 'a Dani entrou sem senha', { tela: (await dani.page.locator('body').innerText()).slice(0, 300) });
else log('p3', 'a Dani foi barrada pela senha posta no meio da partida');

// p4: só na sala de espera tem os chapéus; aqui confere no fim.

// p5
const fim = ana.page.getByRole('dialog', { name: 'Fim de jogo' });
const t0 = Date.now();
while (Date.now() - t0 < MAX_MIN * 60000) {
  if (await fim.isVisible().catch(() => false)) break;
  const a = await actOnce([ana, beto]);
  if (!a) await sleep(150);
}
if (!(await fim.isVisible().catch(() => false))) flag('p5', 'a partida não acabou');
else {
  log('p5', `fim em ${Math.round((Date.now() - t0) / 1000)} s`);
  await ana.page.getByRole('button', { name: 'Voltar pra sala' }).click();
  await ana.page.getByText(/Na mesa \(3\/8\)/).waitFor({ timeout: 15000 }).catch(() => flag('p5', 'o Caio não sentou na mesa ao voltar para a sala'));
  // p4
  await ana.page.getByRole('button', { name: 'Fazer Beto patrão' }).click();
  const chapeu = await ate(() => beto.page.getByRole('button', { name: 'Começar partida' }).isVisible().catch(() => false));
  if (chapeu === null) flag('p4', 'o Beto virou patrão mas não pode começar a partida');
  else log('p4', 'o Beto é patrão: pode começar a partida');
  await ana.shot('plateia-ana-sala');
  await beto.shot('plateia-beto-sala');
}

for (const d of [ana, beto, caio, dani]) if (d.errors.length) flag('erros', `erros na página de ${d.label}`, d.errors.slice(0, 4));
report();
await closeAll();
