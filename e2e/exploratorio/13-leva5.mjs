// Exploratório 13: a 5ª leva da zoeira (04/10/2026), dois celulares numa sala ao vivo.
// l1: a Ana tem "Cagão!" gravado na voz dela: a gravação vai para a sala e chega no Beto;
// l2: piada interna: o admin escreve a chegada do Beto (apelido guardado); quando ele entra, a Ana
//     vê a faixa e o apelido de zoeira embaixo do nome;
// l3: o Beto joga de Zorrilho: no menu do amigo tem o golpe dele, e a nuvem verde cai na Ana;
// l4: o Beto cai (modo avião): o cusco senta na cadeira dele na tela da Ana; ele volta e o cusco sai;
// l5: partida valendo ranking até o fim (1 palito, com um bot): o mural da vergonha aparece no ranking.
import { actOnce, BASE, closeAll, createRoom, device, flag, joinByLink, log, report, sleep, startGame } from './lib.mjs';

const SENHA_ADMIN = process.env.E2E_ADMIN_SENHA ?? 'senha-do-teste-e2e';
const API = process.env.API ?? BASE.replace(':5173', ':8787');
const so = process.argv.slice(2);
const roda = (c) => so.length === 0 || so.includes(c);

async function ate(cond, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return Date.now() - t0;
    await sleep(200);
  }
  return null;
}

async function post(caminho, corpo, token) {
  const r = await fetch(`${API}${caminho}`, {
    method: 'POST',
    // A API só aceita pedido da origem do jogo.
    headers: { 'Content-Type': 'application/json', Origin: new URL(BASE).origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo),
  });
  return r.json();
}

const chaveDe = (d) => d.page.evaluate(() => JSON.parse(localStorage.getItem('fodinha:ajustes') ?? '{}').state?.profileKey);
const idDe = async (chave) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(`fazquantas:perfil:${chave}`).digest('base64url').slice(0, 22);
};

// Uma gravação de mentira (base64 válido, do tamanho de um "Cagão!"): o roteiro confere o caminho, não o som.
const VOZ = 'iIiI'.repeat(1500);
const nomeBeto = `Beto${Math.random().toString(36).slice(2, 6)}`;

const ana = await device('Ana', { dev: 'iPhone 15', settings: { speed: 'normal', frasesFavoritas: ['cagao', 'masbah', 'guloso'] } });
await ana.page.addInitScript((voz) => {
  if (!localStorage.getItem('fodinha:vozes')) localStorage.setItem('fodinha:vozes', JSON.stringify({ state: { vozes: { cagao: voz } }, version: 1 }));
}, VOZ);
const beto = await device('Beto', { name: nomeBeto, dev: 'Pixel 7', settings: { avatar: 'g-zorrilho' } });

// O Beto guarda o apelido (com PIN), e o admin escreve a piada dele antes de ele entrar.
await beto.page.goto(BASE);
const chaveBeto = await chaveDe(beto);
const guardou = await post('/api/perfis/guardar', { profileKey: chaveBeto, apelido: nomeBeto, pin: '4321', avatar: 'g-zorrilho' });
if (!guardou.ok) flag('l2', `não deu para guardar o apelido do Beto: ${JSON.stringify(guardou)}`);
const entrou = await post('/api/admin/entrar', { senha: SENHA_ADMIN });
const token = entrou.token ?? entrou.sessao ?? null;
if (!token) flag('l2', `admin não entrou: ${JSON.stringify(entrou)}`);
const chegada = `Chegou o ${nomeBeto}. Segurem as carteiras.`;
if (token) {
  const r = await post('/api/admin/perfil', { profileId: await idDe(chaveBeto), acao: 'piada', chegada, alcunha: 'o Pé-frio' }, token);
  if (!r.ok) flag('l2', `admin não guardou a piada: ${JSON.stringify(r)}`);
}

const code = await createRoom(ana.page);
await sleep(800);
await joinByLink(beto.page, code);
await ana.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 15000 });

// l2
if (roda('l2')) {
  const t = await ate(() => ana.page.getByText(chegada).isVisible().catch(() => false), 6000);
  if (t === null) flag('l2', 'a faixa da chegada não apareceu para a Ana');
  else log('l2', `faixa da chegada em ${t} ms`);
  await ana.shot('l2-chegada');
  if (!(await ana.page.getByText('o Pé-frio').first().isVisible().catch(() => false))) flag('l2', 'o apelido de zoeira não aparece embaixo do nome na sala');
  else log('l2', 'apelido de zoeira na lista da sala');
}

// l1
if (roda('l1')) {
  const t = await ate(async () => beto.rede.quadros.some((q) => q.de === 'servidor' && q.m.includes('voz:frase')), 6000);
  if (t === null) flag('l1', 'a voz da Ana não chegou no Beto');
  else log('l1', `a voz da Ana chegou no Beto em ${t} ms`);
  if (!ana.rede.quadros.some((q) => q.de === 'pagina' && q.m.includes('voz:frase'))) flag('l1', 'a Ana não mandou a voz para a sala');
}

await startGame(ana.page);
await ana.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 20000 });
await sleep(1500);
for (const d of [ana, beto]) await d.page.getByRole('button', { name: 'Entendi' }).click({ timeout: 1500 }).catch(() => {});

// l3
if (roda('l3')) {
  await beto.page.getByRole('button', { name: 'Zoar Ana' }).click();
  const menu = beto.page.getByRole('dialog', { name: 'Zoar Ana' });
  await menu.waitFor({ timeout: 3000 });
  const golpe = menu.getByRole('button', { name: /^O golpe do teu/ });
  if (!(await golpe.isVisible().catch(() => false))) flag('l3', 'o Zorrilho não tem o botão do golpe no menu');
  else {
    await golpe.click();
    const nuvem = () => ana.page.locator('svg path[d^="M22 70 C6 70"]').count();
    const t = await ate(async () => (await nuvem()) > 0, 5000);
    if (t === null) flag('l3', 'a nuvem do zorrilho não caiu na Ana');
    else log('l3', `nuvem verde na Ana em ${t} ms`);
    await sleep(400);
    await ana.shot('l3-zorrilho');
  }
  await beto.page.keyboard.press('Escape').catch(() => {});
}

// l4
if (roda('l4')) {
  await beto.aviao(true);
  const t = await ate(() => ana.page.getByRole('img', { name: /^Caiu: / }).first().isVisible().catch(() => false), 15000);
  if (t === null) flag('l4', 'o cusco não sentou na cadeira do Beto');
  else log('l4', `cusco na cadeira do Beto em ${t} ms`);
  await ana.shot('l4-cusco');
  await beto.aviao(false);
  await beto.page.reload().catch(() => {});
  const v = await ate(async () => !(await ana.page.getByRole('img', { name: /^(Caiu|Ausente): / }).first().isVisible().catch(() => false)), 25000);
  if (v === null) {
    flag('l4', 'o Beto voltou e o cusco não saiu');
    await beto.shot('l4-beto-volta');
    await ana.shot('l4-ana-volta');
  }
  else log('l4', `o Beto voltou e o cusco saiu em ${v} ms`);
}

// l5: uma partida valendo ranking até o fim (sala nova, aparelhos novos, 1 palito, com um bot). A Ana
// vira a mesa no meio: o mural tem de trazer o "virador de mesa".
if (roda('l5')) {
  const a2 = await device('Ana2', { name: `Ana${Math.random().toString(36).slice(2, 6)}`, dev: 'iPhone 15', settings: { speed: 'turbo' } });
  const b2 = await device('Beto2', { name: `Beto${Math.random().toString(36).slice(2, 6)}`, dev: 'Pixel 7', settings: { speed: 'turbo' } });
  const code2 = await createRoom(a2.page);
  await joinByLink(b2.page, code2);
  await a2.page.getByText(/Na mesa \(2\/8\)/).waitFor({ timeout: 15000 });
  await a2.page.getByRole('button', { name: 'Adicionar bot' }).click();
  await a2.page.getByRole('button', { name: 'Diminuir palitos' }).click().catch(() => {});
  await a2.page.getByRole('button', { name: 'Diminuir palitos' }).click().catch(() => {});
  await a2.page.getByRole('switch', { name: /Valendo ranking/ }).click();
  await sleep(600);
  await startGame(a2.page);
  await a2.page.getByText(/^Rodada \d+/).first().waitFor({ timeout: 20000 });
  await sleep(1200);
  for (const d of [a2, b2]) await d.page.getByRole('button', { name: 'Entendi' }).click({ timeout: 1500 }).catch(() => {});
  await a2.page.getByRole('button', { name: 'Menu' }).first().click().catch(() => {});
  await a2.page.getByRole('button', { name: /Virar a mesa/ }).click({ timeout: 3000 }).catch(() => flag('l5', 'não achou "Virar a mesa" no menu'));
  await sleep(2600);
  const fim = await ate(async () => {
    await actOnce([a2, b2]);
    return a2.page.getByRole('dialog', { name: 'Fim de jogo' }).isVisible().catch(() => false);
  }, 240000);
  if (fim === null) flag('l5', 'a partida valendo ranking não terminou');
  else {
    log('l5', `partida terminou em ${Math.round(fim / 1000)} s`);
    await sleep(2000);
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const r = await fetch(`${API}/api/ranking?periodo=semana&escopo=turma&perfil=${await idDe(await chaveDe(a2))}&data=${hoje}`, { headers: { Origin: new URL(BASE).origin } }).then((x) => x.json());
    if (!Array.isArray(r.mural)) flag('l5', `o ranking não trouxe o mural: ${JSON.stringify(r).slice(0, 200)}`);
    else {
      log('l5', `mural: ${r.mural.map((t) => `${t.titulo}=${t.name}(${t.n})`).join(', ') || '(vazio)'}`);
      if (!r.mural.some((t) => t.titulo === 'virada')) flag('l5', 'a mesa virada não foi para o mural');
    }
    await a2.page.getByRole('button', { name: 'Sair da sala' }).click().catch(() => {});
    await a2.page.getByRole('button', { name: /Ranking/ }).first().click({ timeout: 8000 }).catch(() => flag('l5', 'sem o botão do ranking no início'));
    await a2.page.getByText('Mural da vergonha').waitFor({ timeout: 8000 }).catch(() => flag('l5', 'o mural não aparece na tela do ranking'));
    await a2.shot('l5-ranking');
  }
}

for (const d of [ana, beto]) {
  const erros = d.errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|net::|WebSocket|vibrate|401|429/.test(e));
  if (erros.length) flag('erros', `${d.label}: ${erros.slice(0, 3).join(' | ')}`);
}
await closeAll();
report();
