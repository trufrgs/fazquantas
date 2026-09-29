import { mkdtempSync, rmSync } from 'node:fs';
import type http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { presetSettings } from './helpers';
import { buildOf, buildWeb, comeBack, servePages } from './producao';

/**
 * Versão nova chegando numa aba que ficou aberta (o problema do service worker preso na versão
 * antiga): publica o build A, abre a aba, publica o B por cima e a aba passa sozinha para o B. No
 * meio de uma partida ela não recarrega; só quando a pessoa sai da mesa.
 *
 * Gera três builds de produção do web (uns 20 s cada) e serve como o Cloudflare Pages: arquivos do
 * build, index.html para as rotas do app, sw.js/index.html/version.json sem cache.
 */

const PORT = 4180;
const BASE = `http://localhost:${PORT}`;
let dir = '';
let server: http.Server;
const build = (id: string) => buildWeb(dir, id);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'fazquantas-atualizacao-'));
  server = await servePages(dir, PORT);
});

test.afterAll(() => {
  server?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('aba aberta passa sozinha para a versão nova; no meio da partida espera sair da mesa', async ({ page }) => {
  test.setTimeout(300_000);
  await presetSettings(page, { name: 'Ana' });
  build('versao-a');
  await page.goto(BASE);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 30_000 }).toBe(true);
  expect(await buildOf(page)).toBe('versao-a');

  // Publica a B por cima (a A some do servidor, como no Pages) e a aba volta para a frente.
  build('versao-b');
  await comeBack(page);
  await expect.poll(() => buildOf(page), { timeout: 60_000 }).toBe('versao-b');
  await expect(page.getByRole('button', { name: 'Jogar contra bots' })).toBeVisible();

  // No meio da partida, a versão C espera: a mesa não recarrega na cara de ninguém.
  await page.getByRole('button', { name: 'Jogar contra bots' }).click();
  await expect(page.getByText(/Rodada \d/)).toBeVisible();
  build('versao-c');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(8000);
  expect(await buildOf(page)).toBe('versao-b');
  await expect(page.getByText(/Rodada \d/)).toBeVisible();

  // Saiu da mesa: agora sim, versão C.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect.poll(() => buildOf(page), { timeout: 60_000 }).toBe('versao-c');
});

test('versão velha aberta pelo convite vai para a nova antes de sentar na sala', async ({ browser }) => {
  test.setTimeout(300_000);
  build('versao-d');
  // A anfitriã cria a sala na versão D.
  const anfitria = await browser.newContext();
  const ana = await anfitria.newPage();
  await presetSettings(ana, { name: 'Ana' });
  await ana.goto(BASE);
  await ana.getByRole('button', { name: 'Jogar com a gurizada' }).click();
  await ana.getByRole('button', { name: 'Criar sala' }).click();
  const rotulo = await ana.locator('div[aria-label^="Código "]').getAttribute('aria-label');
  const code = rotulo!.replace('Código ', '').replace(/ /g, '');

  // O convidado já tinha aberto o jogo (o service worker guardou a D) e fechou.
  const convidado = await browser.newContext();
  const antes = await convidado.newPage();
  await presetSettings(antes, { name: 'Beto' });
  await antes.goto(BASE);
  await expect.poll(() => antes.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 30_000 }).toBe(true);
  await antes.close();

  // Publica a E e o convidado abre o convite: a D (do cache) confere a versão e recarrega antes de sentar.
  build('versao-e');
  const beto = await convidado.newPage();
  await presetSettings(beto, { name: 'Beto' });
  const eventos: string[] = [];
  beto.on('websocket', () => eventos.push('sala'));
  beto.on('load', () => eventos.push('carregou'));
  await beto.goto(`${BASE}/?sala=${code}`);
  await expect(ana.getByText('Beto')).toBeVisible({ timeout: 60_000 });
  expect(await buildOf(beto)).toBe('versao-e');
  // Carregou a D, recarregou na E e só então abriu a conexão com a sala.
  expect(eventos.slice(0, 3)).toEqual(['carregou', 'carregou', 'sala']);
  await anfitria.close();
  await convidado.close();
});
